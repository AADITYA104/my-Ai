"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AutonomousOrchestrator, normalizePlan, createOperationId, createIdempotencyKey } = require("../agent-core/autonomous-orchestrator");
const { TaskStore } = require("../agent-core/task-store");

assert.deepEqual(normalizePlan({ goal: "x", steps: [{ task: "one", successCriteria: "ok" }] }, "fallback").steps[0], {
  id: 1,
  description: "one",
  doneWhen: "ok",
  tool: null,
  input: {},
  risk: "normal"
});
assert.deepEqual(normalizePlan({ steps: [{ description: "write", tool: "write_file", input: { file_path: "a.txt", content: "x" } }] }, "x").steps[0].input, { file_path: "a.txt", content: "x" });
assert.throws(() => normalizePlan({ steps: [{ id: "same", description: "one" }, { id: "same", description: "two" }] }, "duplicate"), /duplicate step id/);
assert.deepEqual(normalizePlan({ steps: [{ description: "array input", input: ["unsafe"] }] }, "input").steps[0].input, {});
assert.equal(createOperationId("session-a", "task-a", 1, 1), createOperationId("session-a", "task-a", 1, 1));
assert.notEqual(createOperationId("session-a", "task-a", 1, 1), createOperationId("session-a", "task-a", 1, 2));
assert.notEqual(createOperationId("session-a", "task-a", 1, 1, "execute"), createOperationId("session-a", "task-a", 1, 1, "recovery"));
assert.equal(createIdempotencyKey("session-a", "task-a", 1), createIdempotencyKey("session-a", "task-a", 1));
assert.equal(createIdempotencyKey("session-a", "task-a", 1), createIdempotencyKey("session-a", "task-a", 1));
assert.notEqual(createIdempotencyKey("session-a", "task-a", 1), createIdempotencyKey("session-a", "task-a", 2));

(async () => {
  let executions = 0;
  let recoveries = 0;
  const agent = new AutonomousOrchestrator({
    limits: { maxSteps: 10, maxToolCalls: 10, maxRetries: 3, maxWallTimeMs: 5000 },
    planner: async () => ({ steps: [{ id: 1, description: "make change", doneWhen: "verified" }, { id: 2, description: "run checks", doneWhen: "verified" }] }),
    executor: async (step, ctx) => {
      executions++;
      if (step.id === 1 && ctx.attempt === 1) throw new Error("transient failure");
      return { step: step.id, attempt: ctx.attempt };
    },
    verifier: async (step, result) => ({ pass: step.id !== "final" || result.length === 2, reason: step.id === "final" ? "all results present" : "step verified" }),
    recovery: async (_step, _result, verification) => { recoveries++; return { retry: true, previousFailure: verification.reason }; }
  });
  const success = await agent.run("build feature");
  assert.equal(success.success, true);
  assert.equal(success.state, "completed");
  assert.equal(executions, 3);
  assert.equal(recoveries, 1);
  assert.equal(success.results.length, 2);
  assert.match(success.results[0].executionId, /^[a-f0-9]{32}$/);
  assert.match(success.results[1].executionId, /^[a-f0-9]{32}$/);
  assert.notEqual(success.results[0].executionId, success.results[1].executionId);

  const blocked = new AutonomousOrchestrator({
    limits: { maxSteps: 0, maxToolCalls: 10 }, planner: async () => ({ steps: [{ description: "never run" }] }), executor: async () => "bad", verifier: async () => ({ pass: true })
  });
  const blockedResult = await blocked.run("budget test");
  assert.equal(blockedResult.success, false); assert.equal(blockedResult.state, "blocked");

  const retryZero = new AutonomousOrchestrator({
    limits: { maxSteps: 5, maxToolCalls: 5, maxRetries: 0 }, planner: async () => ({ steps: [{ description: "no retry" }] }), executor: async () => "unexpected", verifier: async () => ({ pass: true })
  });
  const retryZeroResult = await retryZero.run("retry zero");
  assert.equal(retryZeroResult.success, false); assert.equal(retryZeroResult.state, "failed"); assert.equal(retryZeroResult.task.step, 0);

  const slow = new AutonomousOrchestrator({
    limits: { maxSteps: 5, maxToolCalls: 5, maxRetries: 2, maxWallTimeMs: 1 },
    planner: async () => { await new Promise(resolve => setTimeout(resolve, 10)); return { steps: [{ description: "too slow" }] }; },
    executor: async () => "unexpected", verifier: async () => ({ pass: true })
  });
  const slowResult = await slow.run("wall clock test");
  assert.equal(slowResult.success, false); assert.equal(slowResult.state, "blocked"); assert.match(slowResult.reason, /Wall-clock budget exhausted/);

  let timedExecutorCalls = 0;
  const executorTimeout = new AutonomousOrchestrator({
    limits: { maxSteps: 5, maxToolCalls: 5, maxRetries: 2, maxWallTimeMs: 15 },
    planner: async () => ({ steps: [{ id: 1, description: "hang in executor" }] }),
    executor: async () => { timedExecutorCalls++; await new Promise(resolve => setTimeout(resolve, 100)); return "late"; },
    verifier: async () => ({ pass: true })
  });
  const executorTimeoutResult = await executorTimeout.run("executor timeout");
  assert.equal(executorTimeoutResult.success, false); assert.equal(executorTimeoutResult.state, "blocked"); assert.match(executorTimeoutResult.reason, /Wall-clock budget exhausted/); assert.equal(timedExecutorCalls, 1);

  const verifierTimeout = new AutonomousOrchestrator({
    limits: { maxSteps: 5, maxToolCalls: 5, maxRetries: 2, maxWallTimeMs: 15 },
    planner: async () => ({ steps: [{ id: 1, description: "hang in verifier" }] }),
    executor: async () => "ok",
    verifier: async (step) => { if (step.id === "final") return { pass: true }; await new Promise(resolve => setTimeout(resolve, 100)); return { pass: true }; }
  });
  const verifierTimeoutResult = await verifierTimeout.run("verifier timeout");
  assert.equal(verifierTimeoutResult.success, false); assert.equal(verifierTimeoutResult.state, "blocked"); assert.match(verifierTimeoutResult.reason, /Wall-clock budget exhausted/);

  const recoveryTimeout = new AutonomousOrchestrator({
    limits: { maxSteps: 5, maxToolCalls: 5, maxRetries: 2, maxWallTimeMs: 15 },
    planner: async () => ({ steps: [{ id: 1, description: "hang in recovery" }] }),
    executor: async () => { throw new Error("step failed"); },
    verifier: async () => ({ pass: false, reason: "not verified" }),
    recovery: async () => { await new Promise(resolve => setTimeout(resolve, 100)); return { retry: true }; }
  });
  const recoveryTimeoutResult = await recoveryTimeout.run("recovery timeout");
  assert.equal(recoveryTimeoutResult.success, false); assert.equal(recoveryTimeoutResult.state, "blocked"); assert.match(recoveryTimeoutResult.reason, /Wall-clock budget exhausted/);

  let policyDeniedExecutions = 0;
  let policyDeniedRecoveries = 0;
  const policyDenied = new AutonomousOrchestrator({
    limits: { maxSteps: 5, maxToolCalls: 5, maxRetries: 5, maxWallTimeMs: 5000 },
    planner: async () => ({ steps: [{ id: 1, description: "policy denied action", tool: "run_command" }] }),
    executor: async () => { policyDeniedExecutions++; const error = new Error("Command matched the destructive deny matrix."); error.code = "TOOL_DENIED"; throw error; },
    verifier: async () => ({ pass: false, reason: "should not be reached" }),
    recovery: async () => { policyDeniedRecoveries++; return { retry: true }; }
  });
  const policyDeniedResult = await policyDenied.run("policy denial");
  assert.equal(policyDeniedResult.success, false); assert.equal(policyDeniedResult.state, "failed"); assert.equal(policyDeniedExecutions, 1); assert.equal(policyDeniedRecoveries, 0); assert.equal(policyDeniedResult.task.step, 1); assert.match(policyDeniedResult.reason, /Command matched the destructive deny matrix/);

  const failed = new AutonomousOrchestrator({
    limits: { maxSteps: 5, maxToolCalls: 5, maxRetries: 2 }, planner: async () => ({ steps: [{ description: "always fails" }] }), executor: async () => { throw new Error("boom"); }, verifier: async () => ({ pass: false, reason: "not verified" })
  });
  const failedResult = await failed.run("failure test");
  assert.equal(failedResult.success, false); assert.equal(failedResult.state, "failed"); assert.match(failedResult.reason, /boom/);

  const plannerFailure = new AutonomousOrchestrator({ planner: async () => { throw new Error("planner boom"); }, executor: async () => "bad", verifier: async () => ({ pass: true }) });
  const plannerFailureResult = await plannerFailure.run("planner failure");
  assert.equal(plannerFailureResult.success, false); assert.equal(plannerFailureResult.state, "failed"); assert.match(plannerFailureResult.reason, /planner boom/);

  const finalVerifierFailure = new AutonomousOrchestrator({
    planner: async () => ({ steps: [{ description: "complete" }] }), executor: async () => "ok",
    verifier: async (step) => { if (step.id === "final") throw new Error("final verifier boom"); return { pass: true }; }
  });
  const finalVerifierFailureResult = await finalVerifierFailure.run("final verifier failure");
  assert.equal(finalVerifierFailureResult.success, false); assert.equal(finalVerifierFailureResult.state, "failed"); assert.match(finalVerifierFailureResult.reason, /final verifier boom/);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-resume-"));
  try {
    const taskStore = new TaskStore({ root: tempRoot });
    let step2ShouldFail = true;
    let resumeExecutions = [];
    let observedOperationIds = [];
    const resumable = new AutonomousOrchestrator({
      taskStore,
      limits: { maxSteps: 10, maxToolCalls: 10, maxRetries: 1, maxWallTimeMs: 5000 },
      planner: async () => ({ steps: [{ id: 1, description: "persisted step", doneWhen: "done" }, { id: 2, description: "interrupted step", doneWhen: "done" }] }),
      executor: async (step, ctx) => { resumeExecutions.push(step.id); observedOperationIds.push({ step: step.id, attempt: ctx.attempt, executionId: ctx.executionId }); if (step.id === 2 && step2ShouldFail) { const error = new Error("simulated interruption"); error.code = "RETRYABLE_EXECUTOR_ERROR"; throw error; } return `step-${step.id}-ok`; },
      verifier: async (step, result) => step.id === "final" ? { pass: result.length === 2, reason: "all persisted results present" } : { pass: true, result }
    });
    const interrupted = await resumable.run("resume me", { sessionId: "resume-session", taskId: "resume-task" });
    assert.equal(interrupted.success, false); assert.equal(interrupted.state, "failed"); assert.equal(interrupted.results.length, 1); assert.deepEqual(resumeExecutions, [1, 2]); assert.ok(taskStore.load("resume-task", "resume-session"));
    step2ShouldFail = false;
    const resumed = await resumable.resume("resume-task", "resume-session");
    assert.equal(resumed.success, true); assert.equal(resumed.state, "completed"); assert.equal(resumed.results.length, 2); assert.deepEqual(resumeExecutions, [1, 2, 2]); assert.equal(observedOperationIds[1].executionId, observedOperationIds[2].executionId); assert.equal(observedOperationIds[1].attempt, 1); assert.equal(observedOperationIds[2].attempt, 1); assert.equal(resumed.results[1].executionId, observedOperationIds[2].executionId);

    let idempotentExecutions = 0;
    let stepVerifications = 0;
    const idempotent = new AutonomousOrchestrator({
      taskStore,
      limits: { maxSteps: 10, maxToolCalls: 10, maxRetries: 2, maxWallTimeMs: 5000 },
      planner: async () => ({ steps: [{ id: 1, description: "create exactly once", doneWhen: "verified" }] }),
      executor: async () => { idempotentExecutions++; return { sideEffectId: idempotentExecutions }; },
      verifier: async (step, result) => {
        if (step.id === "final") return { pass: result.length === 1, reason: "single result" };
        stepVerifications++;
        return { pass: stepVerifications >= 2, reason: stepVerifications >= 2 ? "verified on second check" : "verification transiently failed" };
      },
      recovery: async () => ({ retry: true })
    });
    const idempotentResult = await idempotent.run("idempotent retry", { sessionId: "idempotent-session", taskId: "idempotent-task" });
    assert.equal(idempotentResult.success, true);
    assert.equal(idempotentExecutions, 1);
    assert.equal(stepVerifications, 2);
    assert.equal(idempotentResult.results[0].attempts, 2);
    assert.equal(idempotentResult.results[0].result.sideEffectId, 1);
    assert.equal(taskStore.load("idempotent-task", "idempotent-session").operations[idempotentResult.results[0].idempotencyKey].state, "completed");

    let ambiguousExecutions = 0;
    const ambiguous = new AutonomousOrchestrator({
      taskStore,
      limits: { maxSteps: 10, maxToolCalls: 10, maxRetries: 2, maxWallTimeMs: 5000 },
      planner: async () => ({ steps: [{ id: 1, description: "ambiguous side effect", doneWhen: "verified" }] }),
      executor: async () => { ambiguousExecutions++; throw new Error("side effect may have happened before transport failure"); },
      verifier: async () => ({ pass: true }),
      recovery: async () => ({ retry: true })
    });
    const ambiguousResult = await ambiguous.run("ambiguous operation", { sessionId: "ambiguous-session", taskId: "ambiguous-task" });
    assert.equal(ambiguousResult.success, false);
    assert.equal(ambiguousResult.state, "blocked");
    assert.match(ambiguousResult.reason, /duplicate side effects/);
    assert.equal(ambiguousExecutions, 1);
    const ambiguousResumed = await ambiguous.resume("ambiguous-task", "ambiguous-session");
    assert.equal(ambiguousResumed.success, false);
    assert.equal(ambiguousResumed.state, "blocked");
    assert.match(ambiguousResumed.reason, /duplicate side effects/);
    assert.equal(ambiguousExecutions, 1);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log("autonomous orchestrator tests: PASS");
})().catch(error => { console.error(error); process.exit(1); });
