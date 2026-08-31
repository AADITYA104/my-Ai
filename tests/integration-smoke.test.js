/**
 * ============================================================================
 *  INTEGRATION SMOKE TEST -- exercises the REAL runAgent loop + REAL tool
 *  dispatch together, in one process, not mocked pieces in isolation.
 * ----------------------------------------------------------------------------
 *  Why this file exists: unit tests (agent-reliability.test.js,
 *  accuracy-eval.test.js) check individual functions. They would NOT have
 *  caught the bug this suite was built to catch -- runAgent() had a
 *  try{}/finally{} with no catch{}, so when every LLM provider was
 *  unreachable, the exception propagated raw out of runAgent() instead of
 *  the clean {success:false} shape every other failure path returns. Only
 *  running the ACTUAL loop end-to-end surfaced it.
 *
 *  No API keys or GPU needed -- these tests intentionally run with NO LLM
 *  provider configured (or a mock HTTP server standing in for one), so they
 *  work in any CI runner, and specifically exercise the failure paths that
 *  matter most for reliability.
 *
 *  Run: node tests/integration-smoke.test.js
 * ============================================================================
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");

const AGENT_PATH = path.join(__dirname, "..", "autonomous-loop-agent-v7-free.js");
const AGENT_DIR = path.dirname(AGENT_PATH);

console.log("========================================================");
console.log("INTEGRATION SMOKE TEST -- real runAgent loop, real tools");
console.log("========================================================\n");

let passed = 0, failed = 0;
const results = [];

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
    results.push({ name, ok: true });
  } catch (err) {
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
    failed++;
    results.push({ name, ok: false, reason: err.message });
  }
}

function cleanupTestArtifacts() {
  const lock = path.join(AGENT_DIR, "agent-memory", ".workspace.lock");
  const metrics = path.join(AGENT_DIR, "agent-memory", "task_metrics.jsonl");
  const state = path.join(AGENT_DIR, "agent-memory", "task-state.json");
  if (fs.existsSync(lock)) fs.unlinkSync(lock);
  if (fs.existsSync(metrics)) fs.unlinkSync(metrics);
  if (fs.existsSync(state)) fs.unlinkSync(state);
}

async function main() {
  cleanupTestArtifacts();
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;

  // -------------------------------------------------------------------------
  await runTest("Module loads without throwing (no import-time crash)", () => {
    delete require.cache[require.resolve(AGENT_PATH)];
    const mod = require(AGENT_PATH);
    assert.ok(mod.runAgent, "runAgent must be exported");
    assert.ok(mod.executeTool, "executeTool must be exported");
    assert.ok(mod.TOOL_DEFINITIONS, "TOOL_DEFINITIONS must be exported");
  });

  const { runAgent, executeTool, TOOL_DEFINITIONS, buildDesignGuidance, buildSkillEngineGuidance } = require(AGENT_PATH);

  // -------------------------------------------------------------------------
  await runTest("All expected tools are registered exactly once", () => {
    const expected = ["write_file", "read_file", "terminal_exec", "code_exec", "calculator", "design_audit", "generate_3d_model"];
    const names = TOOL_DEFINITIONS.map(t => t.name);
    for (const name of expected) {
      const count = names.filter(n => n === name).length;
      assert.strictEqual(count, 1, `expected exactly one "${name}" tool, found ${count}`);
    }
  });

  // -------------------------------------------------------------------------
  // REGRESSION TEST for the actual bug found via integration testing:
  // runAgent() with every LLM provider unreachable used to throw raw instead
  // of returning {success:false, reason:...} like every other failure path.
  await runTest("runAgent() with no LLM provider returns a clean failure, does not throw", async () => {
    cleanupTestArtifacts();
    const origOffline = process.env.FORCE_OFFLINE;
    const origOllama = process.env.OLLAMA_HOST;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    process.env.FORCE_OFFLINE = "true";
    process.env.OLLAMA_HOST = "http://127.0.0.1:99999";
    let result;
    let threw = null;
    try {
      result = await runAgent("say hello", { userId: "smoke-test-fatal-path" });
    } catch (e) {
      threw = e;
    } finally {
      if (origOffline !== undefined) process.env.FORCE_OFFLINE = origOffline; else delete process.env.FORCE_OFFLINE;
      if (origOllama !== undefined) process.env.OLLAMA_HOST = origOllama; else delete process.env.OLLAMA_HOST;
    }
    assert.strictEqual(threw, null, `runAgent() threw instead of returning cleanly: ${threw && threw.message}`);
    assert.strictEqual(result.success, false, "expected success:false when no LLM provider is reachable");
    assert.ok(typeof result.reason === "string" && result.reason.length > 0, "expected a human-readable reason string");
  });

  // -------------------------------------------------------------------------
  await runTest("Workspace lock is released even after a fatal error (finally{} works)", () => {
    const lockFile = path.join(AGENT_DIR, "agent-memory", ".workspace.lock");
    assert.ok(!fs.existsSync(lockFile), "workspace lock leaked after the previous fatal-error run");
  });

  // -------------------------------------------------------------------------
  await runTest("Metrics ARE logged even for the fatal-error path (previously silently skipped)", () => {
    const metricsFile = path.join(AGENT_DIR, "agent-memory", "task_metrics.jsonl");
    assert.ok(fs.existsSync(metricsFile), "task_metrics.jsonl was not written for the fatal-error run");
    const lines = fs.readFileSync(metricsFile, "utf-8").trim().split("\n").filter(Boolean);
    const entry = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(entry.success, false);
    assert.strictEqual(entry.userId, "smoke-test-fatal-path");
  });

  // -------------------------------------------------------------------------
  await runTest("design_audit tool runs against the real public/ folder", async () => {
    const out = await executeTool("design_audit", { target: "public" });
    assert.ok(out.startsWith("[DESIGN_AUDIT]"), `unexpected output shape: ${out.slice(0, 100)}`);
  });

  // -------------------------------------------------------------------------
  await runTest("design_audit handles a missing target gracefully", async () => {
    const out = await executeTool("design_audit", { target: "public/does-not-exist.html" });
    assert.ok(out.startsWith("Error:"), `expected a clean error, got: ${out.slice(0, 100)}`);
  });

  // -------------------------------------------------------------------------
  await runTest("buildDesignGuidance triggers for UI subtasks, not for non-UI ones", () => {
    const uiGuidance = buildDesignGuidance("Improve accessibility of public/index.html");
    const nonUiGuidance = buildDesignGuidance("Write a cron job to back up the database");
    assert.ok(uiGuidance.length > 0, "expected guidance for a UI-related subtask");
    assert.strictEqual(nonUiGuidance, "", "expected NO guidance for a non-UI subtask");
  });

  // -------------------------------------------------------------------------
  // REGRESSION TEST for a real false-positive bug found during deep testing:
  // the first version of buildSkillEngineGuidance matched "order pizza for
  // the team" to an unrelated multi_agent_swarm skill (score 16, inside the
  // same 15-19 range genuine matches scored). Restricting to
  // category==="scientific_research" fixed it -- this test locks that fix in.
  await runTest("buildSkillEngineGuidance matches real scientific queries, stays clean on noise", () => {
    const scientific = buildSkillEngineGuidance("analyze DNA sequence and protein structure using biopython");
    assert.ok(scientific.length > 0, "expected a match for a clear scientific query");
    assert.ok(scientific.includes("BIOPYTHON"), "expected the biopython skill specifically");

    const noiseCases = [
      "order pizza for the team", // the exact false positive found during testing
      "schedule a meeting with the team tomorrow",
      "help me write a birthday card message",
    ];
    for (const noise of noiseCases) {
      const result = buildSkillEngineGuidance(noise);
      assert.strictEqual(result, "", `expected NO match for non-scientific query: "${noise}", got: ${result.slice(0, 100)}`);
    }
  });

  // -------------------------------------------------------------------------
  // generate_3d_model, tested end-to-end against a real (mock) HTTP server --
  // exercises the actual fetch/poll code path, not a stubbed function.
  await new Promise((resolve) => {
    let jobDone = false;
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.method === "POST" && req.url === "/send") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ uid: "smoke-test-job" }));
          setTimeout(() => { jobDone = true; }, 1500);
        } else if (req.method === "GET" && req.url === "/status/smoke-test-job") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(jobDone
            ? { status: "completed", model_base64: Buffer.from("fake-glb-for-smoke-test").toString("base64") }
            : { status: "processing" }));
        } else {
          res.writeHead(404); res.end();
        }
      });
    });

    server.listen(8199, async () => {
      process.env.HUNYUAN3D_API_URL = "http://localhost:8199";

      await runTest("generate_3d_model completes end-to-end against a real mock server", async () => {
        const out = await executeTool("generate_3d_model", { text: "a smoke-test object" });
        assert.ok(out.startsWith("[3D_GEN]"), `unexpected output: ${out}`);
        const writtenPath = path.join(AGENT_DIR, "workspace", "generated-smoke-test-job.glb");
        assert.ok(fs.existsSync(writtenPath), "expected .glb file was not written");
        fs.unlinkSync(writtenPath); // cleanup
      });

      await runTest("generate_3d_model requires text or imagePath", async () => {
        const out = await executeTool("generate_3d_model", {});
        assert.ok(out.startsWith("Error:"), `expected a clean validation error, got: ${out}`);
      });

      delete process.env.HUNYUAN3D_API_URL;
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
      server.close(() => {
        resolve();
      });
    });
  });

  // -------------------------------------------------------------------------
  await runTest("generate_3d_model degrades gracefully when the service is unreachable", async () => {
    process.env.HUNYUAN3D_API_URL = "http://localhost:1"; // nothing listens here
    const out = await executeTool("generate_3d_model", { text: "test" });
    delete process.env.HUNYUAN3D_API_URL;
    assert.ok(out.startsWith("[3D_GEN_UNAVAILABLE]"), `expected graceful degradation, got: ${out}`);
  });

  // -------------------------------------------------------------------------
  cleanupTestArtifacts();

  console.log(`\n========================================================`);
  console.log(`INTEGRATION SMOKE TEST RESULTS: ${passed} PASSED, ${failed} FAILED (of ${passed + failed})`);
  console.log(`========================================================\n`);
  if (failed > 0) {
    console.log("Failing cases:");
    for (const r of results.filter((r) => !r.ok)) console.log(`  - ${r.name}: ${r.reason}`);
  }
  process.exitCode = failed > 0 ? 1 : 0;
}

if (require.main === module) {
  main();
} else {
  module.exports = { main };
}
