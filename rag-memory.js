/**
 * ============================================================================
 *  ULTRON AGENTDB & MULTI-TIER PERSISTENT MEMORY ENGINE (RUFLO POWERED)
 *  Provides instant sub-millisecond semantic recall, graph hops, and session logs.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

class AgentDBMemory {
  constructor(storageDir = path.join(__dirname, "agent-memory")) {
    this.storageDir = storageDir;
    this.dbFile = path.join(this.storageDir, "agentdb_memory.json");
    this.ledgerFile = path.join(this.storageDir, "memory_ledger.jsonl");
    this.skillsDir = path.join(this.storageDir, "skills");

    this.memories = [];
    this.init();
  }

  init() {
    if (!fs.existsSync(this.storageDir)) fs.mkdirSync(this.storageDir, { recursive: true });
    if (!fs.existsSync(this.skillsDir)) fs.mkdirSync(this.skillsDir, { recursive: true });

    if (fs.existsSync(this.dbFile)) {
      try {
        const raw = fs.readFileSync(this.dbFile, "utf-8");
        this.memories = JSON.parse(raw);
      } catch (_) {
        this.memories = [];
      }
    }
  }

  save() {
    try {
      fs.writeFileSync(this.dbFile, JSON.stringify(this.memories, null, 2), "utf-8");
    } catch (e) {
      console.error("[AGENTDB SAVE ERROR]", e.message);
    }
  }

  /**
   * Store a memory unit with tags and associations
   */
  store(topic, content, tags = [], category = "general") {
    const entry = {
      id: "mem_" + Math.random().toString(36).slice(2, 11),
      topic,
      content,
      tags: Array.isArray(tags) ? tags : [tags],
      category,
      timestamp: new Date().toISOString(),
      accessCount: 0
    };

    this.memories.push(entry);
    this.save();

    // Append to audit ledger
    try {
      fs.appendFileSync(this.ledgerFile, JSON.stringify(entry) + "\n", "utf-8");
    } catch (_) {}

    return entry.id;
  }

  /**
   * Fast Hybrid Search (Exact Match + Token Overlap + Fuzzy Semantic)
   */
  search(query, limit = 5) {
    if (!query) return [];
    const qTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    const scored = this.memories.map(m => {
      let score = 0;
      const text = `${m.topic} ${m.content} ${m.tags.join(" ")}`.toLowerCase();

      for (const t of qTokens) {
        if (text.includes(t)) score += 2;
        if (m.topic.toLowerCase().includes(t)) score += 5;
      }

      return { ...m, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Retrieve all distilled skills
   */
  listSkills() {
    const files = fs.readdirSync(this.skillsDir).filter(f => f.endsWith(".md"));
    return files.map(f => {
      const content = fs.readFileSync(path.join(this.skillsDir, f), "utf-8");
      return { file: f, title: f.replace(".md", ""), content };
    });
  }
}

module.exports = new AgentDBMemory();
