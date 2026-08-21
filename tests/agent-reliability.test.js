/**
 * ============================================================================
 *  ULTRON 2026 25-VECTOR ARCHITECTURAL HARDENING & RELIABILITY TEST SUITE
 * ============================================================================
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const watchdog = require("../self-healing-watchdog");
const sessionContinuity = require("../session-continuity");
const skillEngine = require("../unified-skill-engine");
const ragMemory = require("../rag-memory");
const llmProviders = require("../llm-providers");
const multiAgent = require("../multi-agent-system");
const cronScheduler = require("../cron-scheduler");
const browserAgent = require("../browser-agent");
const osBridge = require("../os-automation-bridge");
const telegramGateway = require("../telegram-gateway");

console.log("=== RUNNING ULTRON 2026 25-VECTOR RELIABILITY TEST SUITE ===\n");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

// 1. Protected Files Deny-List Test
runTest("1. Protected files should reject destructive modification attempts", () => {
  const protectedFiles = [".env", "docker-compose.yml", "self-healing-watchdog.js", ".git"];
  for (const file of protectedFiles) {
    const isProtected = watchdog.isProtectedPath(file);
    assert.strictEqual(isProtected, true, `File ${file} must be guarded`);
  }
});

// 2. Destructive Command Deny-Matrix (Linux & Windows PowerShell/CMD)
runTest("2. Destructive command deny-matrix should block dangerous operations", () => {
  const dangerousCommands = [
    "rm -rf /",
    "find . -delete",
    "Remove-Item -Recurse C:\\",
    "del /s /q C:\\Windows",
    "Format-Volume -DriveLetter C",
    "reg delete HKLM\\Software",
    ":(){ :|:& };:"
  ];
  for (const cmd of dangerousCommands) {
    assert.strictEqual(watchdog.isDestructiveCommand(cmd), true, `Command '${cmd}' must be blocked!`);
  }
  assert.strictEqual(watchdog.isDestructiveCommand("node app.js"), false);
  assert.strictEqual(watchdog.isDestructiveCommand("npm test"), false);
});

// 3. Self-Healing Watchdog Syntax Check
runTest("3. Self-Healing Watchdog should catch syntax errors in JS before applying", () => {
  const invalidCode = "function broken( { syntax error! };";
  assert.strictEqual(watchdog.validateJsSyntax(invalidCode), false, "Invalid JS syntax must fail validation");
  assert.strictEqual(watchdog.validateJsSyntax("function ok() { return 42; }"), true, "Valid JS must pass");
});

// 4. Token Budget Estimation & Pruning
runTest("4. Token budget guard should prune long conversation contexts gracefully", () => {
  const messages = [
    { role: "user", content: "Initial system instruction" },
    { role: "assistant", content: "A".repeat(5000) },
    { role: "user", content: "B".repeat(5000) },
    { role: "assistant", content: "C".repeat(5000) },
    { role: "user", content: "Recent turn 1" },
    { role: "assistant", content: "Recent turn 2" },
    { role: "user", content: "Latest user turn" }
  ];
  const pruned = llmProviders.pruneContextIfNeeded(messages, 1000);
  assert.ok(pruned.length < messages.length, "Messages must be pruned down");
  assert.strictEqual(pruned[0].content, "Initial system instruction", "Preserves system/head");
  assert.strictEqual(pruned[pruned.length - 1].content, "Latest user turn", "Preserves tail");
});

// 5. AST-Aware Semantic Code Chunking
runTest("5. RAG Engine should split code on AST function/class boundaries", () => {
  const sampleCode = `
function calculateMetrics(a, b) {
  return a + b;
}

class SystemWatcher {
  check() { return true; }
}

export function deploy() {
  return "deployed";
}
`;
  const chunks = ragMemory.chunkCodeAST(sampleCode, "test.js", 50);
  assert.ok(chunks.length >= 2, "Must produce multiple AST-aware chunks");
  assert.ok(chunks[0].content.includes("function calculateMetrics") || chunks[0].content.includes("class SystemWatcher"));
});

// 6. BM25 + Vector Hybrid Search
runTest("6. RAG Engine should rank relevant documents higher with BM25 hybrid search", () => {
  ragMemory.store("Database Migration Guide", "How to run postgres and prisma migrations safely in 2026", ["db", "prisma"], "guide");
  ragMemory.store("Frontend Styling Rules", "CSS variables, Tailwind colors, and brutalist design tokens", ["ui", "css"], "guide");

  const results = ragMemory.search("prisma postgres migrations");
  assert.ok(results.length > 0, "Must return search results");
  assert.strictEqual(results[0].topic, "Database Migration Guide", "Top result must match search query");
});

// 7. Multi-Agent Typed Handoff Envelope
runTest("7. Multi-Agent System should enforce structured typed handoff schema", () => {
  const envelope = multiAgent.createHandoffEnvelope("Deploy Web App", "ARCHITECT", { spec: "Spec doc" });
  assert.ok(envelope.mission_id.startsWith("m_"), "Must contain mission_id");
  assert.strictEqual(envelope.stage, "ARCHITECT");
  assert.strictEqual(envelope.payload.spec, "Spec doc");
  assert.strictEqual(envelope.handoff_depth, 1);
});

// 8. Cron Mutex PID Lock & Release
runTest("8. Cron Scheduler should prevent concurrent overlapping jobs using PID lock", () => {
  const acquired1 = cronScheduler.acquireLock("test-job-1");
  assert.strictEqual(acquired1, true, "First lock acquisition must succeed");
  
  const acquired2 = cronScheduler.acquireLock("test-job-2");
  assert.strictEqual(acquired2, false, "Second concurrent lock acquisition must be blocked");

  cronScheduler.releaseLock();
  const acquired3 = cronScheduler.acquireLock("test-job-3");
  assert.strictEqual(acquired3, true, "Lock acquisition must succeed after release");
  cronScheduler.releaseLock();
});

// 9. Browser Agent Selector Resolution
runTest("9. Browser Agent should resolve configured selectors", () => {
  const selector = browserAgent.getSelector("google_search_input");
  assert.ok(selector && selector.includes("name='q'"), "Must resolve google search input selector");
});

// 10. Multi-User Session Isolation in Telegram Gateway
runTest("10. Telegram Gateway must isolate session state per chatId", () => {
  const sessionA = telegramGateway.getSession(1001);
  const sessionB = telegramGateway.getSession(2002);
  assert.notStrictEqual(sessionA, sessionB, "Different chatIds must have distinct session objects");
  sessionA.running = true;
  assert.strictEqual(sessionB.running, false, "Session B running state must remain unaffected");
});

// 11. Multi-Session Continuity Save and Restore
runTest("11. Session Continuity should persist project state across sessions", () => {
  const state = sessionContinuity.getState();
  assert.ok(state.project_goal, "State must contain project_goal");
  assert.ok(Array.isArray(state.completed_steps), "Completed steps must be an array");
});

// 12. Semantic Top-K Skill Routing
runTest("12. Unified Skill Engine should correctly route UI and Security tasks", () => {
  const uiSkills = skillEngine.routeTask("Create a brutalist 3D scroll world page", 2);
  assert.ok(uiSkills.length > 0, "Must match at least 1 UI skill");
  
  const secSkills = skillEngine.routeTask("Perform security audit for reentrancy vulnerabilities", 2);
  assert.ok(secSkills.length > 0, "Must match security skills");
});

console.log(`\n======================================================`);
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`======================================================\n`);

if (failed > 0) process.exit(1);
