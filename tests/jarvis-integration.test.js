"use strict";

const assert = require("assert");
const { runJarvisAgent } = require("../agent-core/jarvis-agent");
const { executeWithPolicy } = require("../agent-core/jarvis-server");

(async () => {
  let executions = 0;
  const result = await runJarvisAgent("complete deterministic smoke task", {
    planner: async () => ({
      goal: "complete deterministic smoke task",
      assumptions: [],
      steps: [{ id: 1, description: "Produce the expected result", doneWhen: "result is OK", tool: null, input: {}, risk: "low" }]
    }),
    executor: async () => { executions++; return "OK"; },
    verifier: async () => ({ pass: true, confidence: 1, verdict: "PASS", reason: "deterministic test" }),
    recovery: async () => ({ strategy: "none", constraints: [], change: "", toolInputPatch: {} })
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, "completed");
  assert.strictEqual(executions, 1);

  assert.throws(
    () => executeWithPolicy({ tool: "run_command", input: { command: "echo safe" }, risk: "high" }, { autoApprove: false }),
    err => err.code === "APPROVAL_REQUIRED"
  );

  const safeOutput = executeWithPolicy({ tool: "read_file", input: { file_path: "package.json" }, risk: "low" }, { autoApprove: false });
  assert.ok(safeOutput && typeof safeOutput.then === "function");
  await safeOutput;

  console.log("jarvis integration tests: PASS");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
