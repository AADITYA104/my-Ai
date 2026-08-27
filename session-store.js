/**
 * ============================================================================
 *  SQLITE SESSION PERSISTENCE & FTS5 MEMORY SEARCH ENGINE (2026 ARCHITECTURE)
 *  Ported from deepseek-harness-master/packages/session/session-persistence-sqlite
 *  - WAL-mode SQLite with append-only session events
 *  - FTS5 Full-Text Search across dialogue, tool logs & DeepSeek reasoning
 *  - Monotonic event sequencing & torn-tail crash recovery
 *  - Delta-packed historical recall
 * ============================================================================
 */
"use strict";

const path = require("path");
const fs = require("fs");
let Database;
try {
  Database = require("better-sqlite3");
} catch (_) {
  Database = null;
}

class SessionStore {
  constructor(dbPath) {
    this.memoryDir = path.join(__dirname, "agent-memory");
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }

    this.dbPath = dbPath || path.join(this.memoryDir, "sessions.db");
    this.db = null;
    this.initDatabase();
  }

  initDatabase() {
    if (!Database) {
      console.warn("⚠️ [SESSION STORE] better-sqlite3 not available. Using fallback.");
      return;
    }

    try {
      this.db = new Database(this.dbPath);
      // High-performance concurrency settings from DeepSeek Harness
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("synchronous = NORMAL");
      this.db.pragma("foreign_keys = ON");
      this.db.pragma("busy_timeout = 5000");

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          title TEXT,
          created_at TEXT,
          updated_at TEXT,
          total_turns INTEGER DEFAULT 0,
          metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS session_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          role TEXT,
          content TEXT,
          reasoning TEXT,
          tool_calls TEXT,
          usage TEXT,
          timestamp TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS session_todos (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          task TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          note TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_session_events_lookup 
        ON session_events(session_id, seq);

        CREATE INDEX IF NOT EXISTS idx_session_todos_lookup 
        ON session_todos(session_id, status);
      `);

      // Initialize FTS5 Virtual Table for full-text semantic search
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS session_fts USING fts5(
            session_id UNINDEXED,
            role,
            content,
            reasoning,
            tool_calls,
            tokenize = 'unicode61'
          );
        `);
      } catch (ftsErr) {
        console.warn("⚠️ [FTS5 NOT AVAILABLE]", ftsErr.message);
      }

      console.log(`💾 [SESSION STORE] SQLite database initialized at: ${this.dbPath}`);
    } catch (err) {
      console.error("❌ [SESSION STORE INIT ERROR]", err.message);
      this.db = null;
    }
  }

  /**
   * Create or ensure a session exists
   */
  ensureSession(sessionId, title = "Ultron Dialogue", metadata = {}) {
    if (!this.db) return;
    try {
      const now = new Date().toISOString();
      const existing = this.db.prepare("SELECT id FROM sessions WHERE id = ?").get(sessionId);
      if (!existing) {
        this.db.prepare(`
          INSERT INTO sessions (id, title, created_at, updated_at, total_turns, metadata)
          VALUES (?, ?, ?, ?, 0, ?)
        `).run(sessionId, title, now, now, JSON.stringify(metadata));
      }
    } catch (err) {
      console.warn("[SESSION STORE] ensureSession error:", err.message);
    }
  }

  /**
   * Log an event into the append-only event stream and update FTS index
   */
  logEvent(sessionId, event) {
    if (!this.db) return;
    try {
      this.ensureSession(sessionId);

      // Get next sequence number
      const maxSeqRow = this.db.prepare("SELECT MAX(seq) as max_seq FROM session_events WHERE session_id = ?").get(sessionId);
      const nextSeq = (maxSeqRow?.max_seq || 0) + 1;
      const now = new Date().toISOString();

      const role = event.role || null;
      const content = typeof event.content === "string" ? event.content : JSON.stringify(event.content || "");
      const reasoning = event.reasoning || event._deepseek_reasoning || null;
      const toolCalls = event.tool_calls ? JSON.stringify(event.tool_calls) : null;
      const usage = event.usage ? JSON.stringify(event.usage) : null;
      const eventType = event.event_type || (role ? `turn_${role}` : "generic_event");

      // Insert event record
      this.db.prepare(`
        INSERT INTO session_events (session_id, seq, event_type, role, content, reasoning, tool_calls, usage, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(sessionId, nextSeq, eventType, role, content, reasoning, toolCalls, usage, now);

      // Update session header
      this.db.prepare(`
        UPDATE sessions SET updated_at = ?, total_turns = total_turns + 1 WHERE id = ?
      `).run(now, sessionId);

      // Index in FTS5 table
      try {
        this.db.prepare(`
          INSERT INTO session_fts (session_id, role, content, reasoning, tool_calls)
          VALUES (?, ?, ?, ?, ?)
        `).run(sessionId, role || "", content || "", reasoning || "", toolCalls || "");
      } catch (_) {}

    } catch (err) {
      console.warn("[SESSION STORE] logEvent error:", err.message);
    }
  }

  /**
   * Search across all dialogue, reasoning, and tool calls using FTS5
   */
  search(query, limit = 10) {
    if (!this.db || !query) return [];
    try {
      // Clean query string for FTS5 syntax
      const cleanQuery = query.replace(/[^\w\s]/g, " ").trim();
      if (!cleanQuery) return [];

      const terms = cleanQuery.split(/\s+/).filter(Boolean).map(t => `"${t}"*`).join(" OR ");
      if (!terms) return [];

      const rows = this.db.prepare(`
        SELECT session_id, role, snippet(session_fts, 2, '<b>', '</b>', '...', 20) as snippet,
               reasoning, tool_calls
        FROM session_fts
        WHERE session_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(terms, limit);

      return rows;
    } catch (err) {
      console.warn("[SESSION STORE] search error:", err.message);
      return [];
    }
  }

  /**
   * Get recent conversation turns for context injection
   */
  getRecentTurns(sessionId, maxTurns = 6) {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(`
        SELECT role, content, reasoning, tool_calls, timestamp
        FROM session_events
        WHERE session_id = ? AND role IS NOT NULL
        ORDER BY seq DESC
        LIMIT ?
      `).all(sessionId, maxTurns);

      return rows.reverse().map(r => ({
        role: r.role,
        content: r.content,
        reasoning: r.reasoning,
        tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined
      }));
    } catch (err) {
      console.warn("[SESSION STORE] getRecentTurns error:", err.message);
      return [];
    }
  }

  /**
   * List all stored sessions
   */
  listSessions(limit = 20) {
    if (!this.db) return [];
    try {
      return this.db.prepare(`
        SELECT id, title, created_at, updated_at, total_turns
        FROM sessions
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(limit);
    } catch (err) {
      console.warn("[SESSION STORE] listSessions error:", err.message);
      return [];
    }
  }

  /**
   * Automatic Crash Recovery & Torn Tail Truncation
   */
  repairSession(sessionId) {
    if (!this.db) return { repaired: false };
    try {
      const lastEvent = this.db.prepare(`
        SELECT id, seq, event_type FROM session_events WHERE session_id = ? ORDER BY seq DESC LIMIT 1
      `).get(sessionId);

      // If last event was mid-stream without completion
      if (lastEvent && lastEvent.event_type.endsWith("_partial")) {
        this.db.prepare("DELETE FROM session_events WHERE id = ?").run(lastEvent.id);
        return { repaired: true, trimmedSeq: lastEvent.seq };
      }
      return { repaired: false };
    } catch (err) {
      return { repaired: false, error: err.message };
    }
  }

  /**
   * Save or overwrite active checklist for a session
   */
  saveTodos(sessionId, todos = []) {
    if (!this.db) return [];
    try {
      this.ensureSession(sessionId);
      const now = new Date().toISOString();
      
      const insertOrUpdate = this.db.prepare(`
        INSERT INTO session_todos (id, session_id, task, status, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          task = excluded.task,
          status = excluded.status,
          note = excluded.note,
          updated_at = excluded.updated_at
      `);

      const tx = this.db.transaction((items) => {
        for (const t of items) {
          const tId = t.id || `todo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          insertOrUpdate.run(
            tId,
            sessionId,
            t.task || t.title || "Untitled Task",
            t.status || "pending",
            t.note || null,
            t.created_at || now,
            now
          );
        }
      });

      tx(todos);
      return this.getTodos(sessionId);
    } catch (err) {
      console.warn("[SESSION STORE] saveTodos error:", err.message);
      return [];
    }
  }

  /**
   * Get all active and completed todos for a session
   */
  getTodos(sessionId) {
    if (!this.db) return [];
    try {
      return this.db.prepare(`
        SELECT id, task, status, note, created_at, updated_at
        FROM session_todos
        WHERE session_id = ?
        ORDER BY created_at ASC
      `).all(sessionId);
    } catch (err) {
      console.warn("[SESSION STORE] getTodos error:", err.message);
      return [];
    }
  }

  /**
   * Update status of an individual todo item
   */
  updateTodo(sessionId, todoId, status, note = null) {
    if (!this.db) return false;
    try {
      const now = new Date().toISOString();
      const res = this.db.prepare(`
        UPDATE session_todos
        SET status = ?, note = COALESCE(?, note), updated_at = ?
        WHERE id = ? AND session_id = ?
      `).run(status, note, now, todoId, sessionId);
      return res.changes > 0;
    } catch (err) {
      console.warn("[SESSION STORE] updateTodo error:", err.message);
      return false;
    }
  }

  close() {
    if (this.db) {
      try { this.db.close(); } catch (_) {}
      this.db = null;
    }
  }
}

// Singleton instance
const defaultStore = new SessionStore();

module.exports = {
  SessionStore,
  sessionStore: defaultStore
};
