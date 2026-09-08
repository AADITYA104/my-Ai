"use strict";

const assert = require("assert");
const { runJarvisAgent, buildPlannerSystem, normalizeAvailableTools } = require("../agent-core/jarvis-agent");
const { executeWithPolicy, registry, isServerAutoApprovalEnabled, adaptLegacyToolInput, resolveWorkspacePath } = require("../agent-core/jarvis-server");
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
  assert.strictEqual(registry.has("run_code"), true);
  assert.strictEqual(registry.has("list_directory"), true);

  const normalizedTools = normalizeAvailableTools([
    "read_file",
    { name: "run_command", description: "Execute a governed command" },
    { invalid: true }
  ]);
  assert.deepStrictEqual(normalizedTools, [
    { name: "read_file", description: "" },
    { name: "run_command", description: "Execute a governed command" }
  ]);
  const plannerContract = buildPlannerSystem(normalizedTools);
  assert.match(plannerContract, /AVAILABLE TOOLS/);
  assert.match(plannerContract, /read_file/);
  assert.match(plannerContract, /run_command/);
  assert.match(plannerContract, /never invent a tool name/i);

  const readAdapter = adaptLegacyToolInput("read_file", { file_path: "package.json" });
  assert.strictEqual(readAdapter.filePath, "package.json");
  const writeAdapter = adaptLegacyToolInput("write_file", { file_path: "tmp.txt", content: "x" });
  assert.strictEqual(writeAdapter.filePath, "tmp.txt");
  const codeAdapter = adaptLegacyToolInput("run_code", { language: "javascript", code: "1 + 1" });
  assert.strictEqual(codeAdapter.language, "javascript");
  assert.strictEqual(codeAdapter.code, "1 + 1");

  assert.strictEqual(resolveWorkspacePath("."), process.cwd());
  assert.throws(() => resolveWorkspacePath("../"), err => err.code === "WORKSPACE_ESCAPE");
  assert.throws(() => resolveWorkspacePath("../../etc"), err => err.code === "WORKSPACE_ESCAPE");

  const directory = await executeWithPolicy(
    { tool: "list_directory", input: { dir_path: "." }, risk: "low" },
    { autoApprove: false }
  );
  assert.ok(Array.isArray(directory));
  assert.ok(directory.some(entry => entry.name === "package.json"));

  await assert.rejects(
    executeWithPolicy(
      { tool: "list_directory", input: { dir_path: "../" }, risk: "low" },
      { autoApprove: false }
    ),
    err => err.code === "WORKSPACE_ESCAPE"
  );

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