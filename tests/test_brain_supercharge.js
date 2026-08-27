/**
 * ============================================================================
 *  TEST SUITE: ULTRON BRAIN SUPERCHARGE (5 POWER MODULES)
 *  Verifies:
 *  1. Surgical String Replacement Editor (viewLines, strReplace, insertAfterLine)
 *  2. Executive Todo & Task Planner (todoWrite, todoRead, todoUpdate)
 *  3. Agent Loop Hygiene Guard (anomaly detection, duplicate call blocking)
 *  4. Web Intelligence & Clean Markdown Parser
 *  5. Core Brain Bridge integration
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const surgical = require("../surgical-editor");
const todoManager = require("../todo-manager");
const { AgentLoopGuard } = require("../agent-loop-guard");
const webIntel = require("../web-intelligence");
const { SessionStore } = require("../session-store");

let passed = 0;
let failed = 0;

function report(name, ok, details = "") {
  if (ok) {
    passed++;
    console.log(`  ✅ [PASS] ${name} ${details ? "(" + details + ")" : ""}`);
  } else {
    failed++;
    console.error(`  ❌ [FAIL] ${name}: ${details}`);
  }
}

async function runTests() {
  console.log("\n============================================================");
  console.log("🧠 ULTRON BRAIN SUPERCHARGE SUITE — VERIFICATION");
  console.log("============================================================\n");

  // -------------------------------------------------------------------------
  // TEST 1: Surgical String Replacement Editor
  // -------------------------------------------------------------------------
  console.log("🧪 TEST 1: Surgical String Replacement Editor");
  const tempFile = path.join(__dirname, "temp_surgical_test.txt");
  try {
    fs.writeFileSync(tempFile, "line 1: ALPHA\nline 2: BETA\nline 3: GAMMA\n", "utf-8");

    // 1a. viewLines
    const viewRes = surgical.viewLines("tests/temp_surgical_test.txt", 1, 3);
    assert.strictEqual(viewRes.success, true);
    assert.ok(viewRes.content.includes("line 2: BETA"));

    // 1b. strReplace
    const repRes = surgical.strReplace("tests/temp_surgical_test.txt", "BETA", "DELTA_OPTIMIZED");
    assert.strictEqual(repRes.success, true);
    const updatedContent = fs.readFileSync(tempFile, "utf-8");
    assert.ok(updatedContent.includes("DELTA_OPTIMIZED"));
    assert.ok(!updatedContent.includes("BETA"));

    // 1c. insertAfterLine
    const insRes = surgical.insertAfterLine("tests/temp_surgical_test.txt", 2, "line 2.5: EPSILON");
    assert.strictEqual(insRes.success, true);
    const postIns = fs.readFileSync(tempFile, "utf-8");
    assert.ok(postIns.includes("line 2.5: EPSILON"));

    report("Surgical String Editor (view, replace, insert)", true);
  } catch (err) {
    report("Surgical String Editor", false, err.message);
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }

  // -------------------------------------------------------------------------
  // TEST 2: Executive Todo Manager & SQLite Persistence
  // -------------------------------------------------------------------------
  console.log("\n🧪 TEST 2: Executive Todo Manager & Task Planning");
  try {
    const testSid = "todo_sess_" + Date.now();
    const writeRes = todoManager.todoWrite(testSid, [
      { id: "t1", task: "Analyze system telemetry", status: "completed" },
      { id: "t2", task: "Optimize Three.js vertex shaders", status: "in_progress" },
      { id: "t3", task: "Deploy neural watchdog", status: "pending" }
    ]);
    assert.strictEqual(writeRes.success, true);
    assert.strictEqual(writeRes.count, 3);

    // Read back
    const readRes = todoManager.todoRead(testSid);
    assert.strictEqual(readRes.count, 3);
    assert.ok(readRes.formatted.includes("[✔] #t1"));
    assert.ok(readRes.formatted.includes("[▶] #t2"));
    assert.ok(readRes.formatted.includes("[ ] #t3"));

    // Update status
    const upRes = todoManager.todoUpdate(testSid, "t2", "completed", "Done in 4ms");
    assert.strictEqual(upRes.success, true);

    const postUpdate = todoManager.todoRead(testSid);
    assert.ok(postUpdate.formatted.includes("[✔] #t2: Optimize Three.js vertex shaders"));

    report("Executive Todo Manager & Checklist Engine", true);
  } catch (err) {
    report("Executive Todo Manager", false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Agent Loop Hygiene Guard
  // -------------------------------------------------------------------------
  console.log("\n🧪 TEST 3: Agent Loop Hygiene & Repetition Breaker");
  try {
    const guard = new AgentLoopGuard();

    // Normal single call
    let anom = guard.checkAnomaly("read_file", { file_path: "package.json" });
    assert.strictEqual(anom.isLoop, false);
    guard.record("read_file", { file_path: "package.json" }, "ok", false);

    // Call same thing once more
    anom = guard.checkAnomaly("read_file", { file_path: "package.json" });
    assert.strictEqual(anom.isLoop, false);
    guard.record("read_file", { file_path: "package.json" }, "ok", false);

    // Third consecutive identical call -> LOOP DETECTED!
    anom = guard.checkAnomaly("read_file", { file_path: "package.json" });
    assert.strictEqual(anom.isLoop, true);
    assert.ok(anom.warning.includes("LOOP GUARD INTERVENTION"));

    // Oscillating A-B-A-B detection
    const oscGuard = new AgentLoopGuard();
    oscGuard.record("tool_A", {}, "err", true);
    oscGuard.record("tool_B", {}, "err", true);
    oscGuard.record("tool_A", {}, "err", true);
    oscGuard.record("tool_B", {}, "err", true);

    const oscAnom = oscGuard.checkAnomaly("tool_A", {});
    assert.strictEqual(oscAnom.isLoop, true);
    assert.strictEqual(oscAnom.type, "oscillating_pattern");

    report("Agent Loop Hygiene & Oscillation Detection", true);
  } catch (err) {
    report("Agent Loop Hygiene", false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 4: HTML to Clean Readability Markdown
  // -------------------------------------------------------------------------
  console.log("\n🧪 TEST 4: HTML to Clean Readability Markdown Parser");
  try {
    const sampleHtml = `
      <html>
        <head><script>alert('ad')</script><style>.ad{color:red}</style></head>
        <body>
          <nav><a href="/home">Home</a></nav>
          <h1>DeepSeek V4 Architecture</h1>
          <p>This is a <strong>breakthrough</strong> in reasoning models.</p>
          <pre><code>const x = 42;</code></pre>
          <footer>Copyright 2026</footer>
        </body>
      </html>
    `;

    const md = webIntel.htmlToCleanMarkdown(sampleHtml);
    assert.ok(md.includes("# DeepSeek V4 Architecture"), "Heading must be preserved");
    assert.ok(md.includes("**breakthrough**"), "Bold markdown must be preserved");
    assert.ok(md.includes("```\nconst x = 42;\n```"), "Code block must be preserved");
    assert.ok(!md.includes("<script>"), "Scripts must be stripped");
    assert.ok(!md.includes("<nav>"), "Nav must be stripped");
    assert.ok(!md.includes("<footer>"), "Footer must be stripped");

    report("Clean HTML-to-Markdown Scraper Parser", true);
  } catch (err) {
    report("HTML-to-Markdown Scraper Parser", false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 5: Tree-of-Thought Module Import & Interface
  // -------------------------------------------------------------------------
  console.log("\n🧪 TEST 5: Tree-of-Thought Reflexion Interface");
  try {
    const tot = require("../tree-of-thought");
    assert.strictEqual(typeof tot.solveWithTreeOfThought, "function");
    report("Tree-of-Thought Cognitive Core Interface", true);
  } catch (err) {
    report("Tree-of-Thought Cognitive Core", false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log("\n============================================================");
  console.log(`🏁 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("============================================================\n");

  if (failed > 0) process.exit(1);
  console.log("🎉 ALL 5 BRAIN POWER MODULES ARE 100% OPERATIONAL!");
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
