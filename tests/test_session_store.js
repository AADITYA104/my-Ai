"use strict";

const { SessionStore } = require("../session-store.js");
const path = require("path");
const fs = require("fs");

async function main() {
  console.log("Testing SQLite Session Store & FTS5 Search...");
  const testDbPath = path.join(__dirname, "test_sessions.db");
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  const store = new SessionStore(testDbPath);
  const testSessionId = "session_test_" + Date.now();

  // 1. Log user turn
  store.logEvent(testSessionId, {
    role: "user",
    content: "Ultron, how do I configure WebGL Three.js Arc Reactor shaders?"
  });

  // 2. Log assistant turn with DeepSeek reasoning
  store.logEvent(testSessionId, {
    role: "assistant",
    content: "Boss, you can configure the vertex and fragment shaders inside the ArcReactor THREE.ShaderMaterial.",
    reasoning: "User is asking about Three.js shader materials. Need to explain vertex and fragment shader setup with uniforms.",
    tool_calls: [{ name: "search_knowledge", args: { query: "Three.js Arc Reactor" } }]
  });

  // 3. Test Retrieval
  const turns = store.getRecentTurns(testSessionId, 5);
  console.log(`Retrieved ${turns.length} turns.`);

  // 4. Test FTS5 Search
  const results = store.search("Arc Reactor shaders");
  console.log("FTS5 Search Results count:", results.length);
  if (results.length > 0) {
    console.log("Found snippet:", results[0].snippet);
  }

  store.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(testDbPath + "-wal")) fs.unlinkSync(testDbPath + "-wal");
  if (fs.existsSync(testDbPath + "-shm")) fs.unlinkSync(testDbPath + "-shm");

  if (turns.length === 2 && results.length > 0) {
    console.log("✅ SQLite Session Store & FTS5 Test PASSED!");
  } else {
    console.error("❌ Session Store Test FAILED!");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
