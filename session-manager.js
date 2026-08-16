/**
 * ============================================================================
 *  SESSION & STATE MANAGER — Persistent User Sessions, Profiles & Context Compression
 * ============================================================================
 *
 * Implements Pillars 8 (State Management) & 11 (Personalization) from the 12-pillar framework:
 *
 *   1. User Profiles & Preferences (language, coding style, output format).
 *   2. Persistent Multi-Turn Conversation Sessions with automatic compression.
 *   3. Context Summarization when message history approaches token limits.
 *
 * STORAGE: agent-memory/sessions/<userId>.json
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");

const SESSIONS_DIR = path.join(__dirname, "agent-memory", "sessions");
const MAX_SESSION_TURNS = 10;

function ensureSessionDir() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function getSessionFilePath(userId) {
  ensureSessionDir();
  const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(SESSIONS_DIR, `${safeId}.json`);
}

function loadSession(userId) {
  const filePath = getSessionFilePath(userId);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      // Return fresh if corrupted
    }
  }
  return {
    userId: String(userId),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      preferredLanguage: "English / Gujarati",
      codeStyle: "Modern Clean JavaScript / Node.js",
      verbosity: "concise",
      customInstructions: "",
    },
    summary: "",
    history: [],
  };
}

function saveSession(session) {
  const filePath = getSessionFilePath(session.userId);
  session.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
}

function updateProfile(userId, profileUpdates = {}) {
  const session = loadSession(userId);
  session.profile = { ...session.profile, ...profileUpdates };
  saveSession(session);
  return session.profile;
}

function appendTurn(userId, role, content) {
  const session = loadSession(userId);
  session.history.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });

  // Compress history if it exceeds turn limits
  if (session.history.length > MAX_SESSION_TURNS) {
    const turnsToCompress = session.history.slice(0, session.history.length - 4);
    const compressedNote = turnsToCompress
      .map((t) => `${t.role}: ${t.content.slice(0, 120)}`)
      .join(" | ");

    session.summary = session.summary
      ? `${session.summary}\n- ${compressedNote}`
      : `- Prior conversation summary: ${compressedNote}`;

    session.history = session.history.slice(session.history.length - 4);
  }

  saveSession(session);
  return session;
}

function buildSessionContext(userId) {
  const session = loadSession(userId);
  let context = `\n--- USER PROFILE & PREFERENCES ---
Preferred Language: ${session.profile.preferredLanguage}
Code Style: ${session.profile.codeStyle}
Tone/Verbosity: ${session.profile.verbosity}
${session.profile.customInstructions ? `Custom Rules: ${session.profile.customInstructions}` : ""}`;

  if (session.summary) {
    context += `\n\n--- COMPRESSED PREVIOUS SESSION MEMORY ---\n${session.summary}`;
  }

  return context;
}

module.exports = {
  loadSession,
  saveSession,
  updateProfile,
  appendTurn,
  buildSessionContext,
};

if (require.main === module) {
  const testUser = "user-101";
  console.log(`Setting up demo session for ${testUser}...`);
  updateProfile(testUser, { verbosity: "detailed", customInstructions: "Always write code comments in Gujarati/English" });
  appendTurn(testUser, "user", "How do we implement RAG with Voyage AI?");
  appendTurn(testUser, "assistant", "Use rag-memory.js with Voyage-3-lite embeddings and cosine similarity.");
  console.log(buildSessionContext(testUser));
}
