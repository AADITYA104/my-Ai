"use strict";

const assert = require("assert");
const { runJarvisAgent } = require("../agent-core/jarvis-agent");
const { executeWithPolicy, registry, isServerAutoApprovalEnabled } = require("../agent-core/jarvis-server");
const { AgentLoopGuard } = require("../agent-loop-guard");

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

  assert.strictEqual(registry.has("read_file"), true);
  assert.strictEqual(registry.has("run_command"), true);

  const previousAutoApprove = process.env.JARVIS_ALLOW_AUTO_APPROVE;
  delete process.env.JARVIS_ALLOW_AUTO_APPROVE;
  assert.strictEqual(isServerAutoApprovalEnabled(), false);
  await assert.rejects(
    executeWithPolicy({ tool: "run_command", input: { command: "echo safe" }, risk: "high" }, { autoApprove: true }),
    err => err.code === "APPROVAL_REQUIRED"
  );

  process.env.JARVIS_ALLOW_AUTO_APPROVE = "true";
  assert.strictEqual(isServerAutoApprovalEnabled(), true);
  const approvedOutput = await executeWithPolicy(
    { tool: "run_command", input: { command: "echo safe" }, risk: "high" },
    { autoApprove: true }
  );
  assert.match(String(approvedOutput), /safe/i);

  if (previousAutoApprove === undefined) delete process.env.JARVIS_ALLOW_AUTO_APPROVE;
  else process.env.JARVIS_ALLOW_AUTO_APPROVE = previousAutoApprove;

  const safeOutput = await executeWithPolicy(
    { tool: "read_file", input: { file_path: "package.json" }, risk: "low" },
    { autoApprove: false }
  );
  assert.ok(typeof safeOutput === "string");
  assert.ok(safeOutput.length > 0);

  const loopGuard = new AgentLoopGuard();
  const readStep = { tool: "read_file", input: { file_path: "package.json" }, risk: "low" };
  await executeWithPolicy(readStep, { autoApprove: false, loopGuard });
  await executeWithPolicy(readStep, { autoApprove: false, loopGuard });
  await assert.rejects(
    executeWithPolicy(readStep, { autoApprove: false, loopGuard }),
    err => err.code === "LOOP_GUARD_BLOCKED"
  );

  console.log("jarvis integration tests: PASS");
})().catch(err => {
  console.error(err);
  process.exit(1);
});