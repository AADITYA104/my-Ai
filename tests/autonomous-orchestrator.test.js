"use strict";

const assert = require("assert");
const { AutonomousOrchestrator, normalizePlan } = require("../agent-core/autonomous-orchestrator");

assert.deepEqual(normalizePlan({ goal: "x", steps: [{ task: "one", successCriteria: "ok" }] }, "fallback").steps[0], {
  id: 1,
  description: "one",
  doneWhen: "ok",
  tool: null,
  input: {},
  risk: "normal"
});

assert.deepEqual(normalizePlan({ steps: [{ description: "write", tool: "write_file", input: { file_path: "a.txt", content: "x" } }] }, "x").steps[0].input, {
  file_path: "a.txt",
  content: "x"
});

(async () => {
  let executions = 0;
  let recoveries = 0;
  const agent = new AutonomousOrchestrator({
    limits: { maxSteps: 10, maxToolCalls: 10, maxRetries: 3, maxWallTimeMs: 5000 },
    planner: async () => ({ steps: [
      { id: 1, description: "make change", doneWhen: "verified" },
      { id: 2, description: "run checks", doneWhen: "verified" }
    ] }),
    executor: async (step, ctx) => {
      executions++;
      if (step.id === 1 && ctx.attempt === 1) throw new Error("transient failure");
      return { step: step.id, attempt: ctx.attempt };
    },
    verifier: async (step, result) => ({
      pass: step.id !== "final" || result.length === 2,
      reason: step.id === "final" ? "all results present" : "step verified"
    }),
    recovery: async (_step, _result, verification) => {
      recoveries++;
      return { retry: true, previousFailure: verification.reason };
    }
  });

  const success = await agent.run("build feature");
  assert.equal(success.success, true);
  assert.equal(success.state, "completed");
  assert.equal(executions, 3);
  assert.equal(recoveries, 1);
  assert.equal(success.results.length, 2);

  const blocked = new AutonomousOrchestrator({
    limits: { maxSteps: 0, maxToolCalls: 10 },
    planner: async () => ({ steps: [{ description: "never run" }] }),
    executor: async () => "bad",
    verifier: async () => ({ pass: true })
  });
  const blockedResult = await blocked.run("budget test");
  assert.equal(blockedResult.success, false);
  assert.equal(blockedResult.state, "blocked");

  const retryZero = new AutonomousOrchestrator({
    limits: { maxSteps: 5, maxToolCalls: 5, maxRetries: 0 },
    planner: async () => ({ steps: [{ description: "no retry" }] }),
    executor: async () => "unexpected",
    verifier: async () => ({ pass: true })
  });
  const retryZeroResult = await retryZero.run("retry zero");
  assert.equal(retryZeroResult.success, false);
  assert.equal(retryZeroResult.state, "failed");
  assert.equal(retryZeroResult.task.step, 0);

  const slow = new AutonomousOrchestrator({
    limits: { maxSteps: 5, maxToolCalls: 5, maxRetries: 2, maxWallTimeMs: 1 },
    planner: async () => ({ steps: [{ description: "too slow" }] }),
    executor: async () => "unexpected",
    verifier: async () => ({ pass: true })
  });
  const slowResult = await slow.run("wall clock test");
  assert.equal(slowResult.success, false);
  assert.equal(slowResult.state, "blocked");
  assert.match(slowResult.reason, /Wall-clock budget exhausted/);

  const failed = new AutonomousOrchestrator({
    limits: { maxSteps: 5, maxToolCalls: 5, maxRetries: 2 },
    planner: async () => ({ steps: [{ description: "always fails" }] }),
    executor: async () => { throw new Error("boom"); },
    verifier: async () => ({ pass: false, reason: "not verified" })
  });
  const failedResult = await failed.run("failure test");
  assert.equal(failedResult.success, false);
  assert.equal(failedResult.state, "failed");
  assert.match(failedResult.reason, /boom/);

  const plannerFailure = new AutonomousOrchestrator({
    planner: async () => { throw new Error("planner boom"); },
    executor: async () => "bad",
    verifier: async () => ({ pass: true })
  });
  const plannerFailureResult = await plannerFailure.run("planner failure");
  assert.equal(plannerFailureResult.success, false);
  assert.equal(plannerFailureResult.state, "failed");
  assert.match(plannerFailureResult.reason, /planner boom/);

  const finalVerifierFailure = new AutonomousOrchestrator({
    planner: async () => ({ steps: [{ description: "complete" }] }),
    executor: async () => "ok",
    verifier: async (step) => {
      if (step.id === "final") throw new Error("final verifier boom");
      return { pass: true };
    }
  });
  const finalVerifierFailureResult = await finalVerifierFailure.run("final verifier failure");
  assert.equal(finalVerifierFailureResult.success, false);
  assert.equal(finalVerifierFailureResult.state, "failed");
  assert.match(finalVerifierFailureResult.reason, /final verifier boom/);

  console.log("autonomous orchestrator tests: PASS");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
