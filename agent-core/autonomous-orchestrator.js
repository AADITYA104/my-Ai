"use strict";

const { createTask, transition, canContinue } = require("./task-state-machine");
const { DEFAULTS } = require("./autonomy-policy");
const { TaskStore } = require("./task-store");

function normalizePlan(plan, goal) {
  if (!plan || typeof plan !== "object") throw new Error("Planner returned no plan.");
  const steps = Array.isArray(plan.steps) ? plan.steps : Array.isArray(plan.subtasks) ? plan.subtasks : [];
  if (steps.length === 0) throw new Error("Planner returned an empty plan.");
  const normalized = steps.map((step, index) => ({
    id: step.id == null ? index + 1 : step.id,
    description: String(step.description || step.task || "").trim(),
    doneWhen: String(step.doneWhen || step.successCriteria || "").trim(),
    tool: step.tool || null,
    input: step.input && typeof step.input === "object" ? step.input : {},
    risk: step.risk || "normal"
  })).filter(step => step.description);
  if (normalized.length === 0) throw new Error("Planner returned no usable steps.");
  return {
    goal: String(plan.goal || goal).trim(),
    assumptions: Array.isArray(plan.assumptions) ? plan.assumptions : [],
    steps: normalized
  };
}

class AutonomousOrchestrator {
  constructor(options = {}) {
    this.limits = { ...DEFAULTS, ...(options.limits || {}) };
    this.plan = options.plan || null;
    this.planner = options.planner;
    this.executor = options.executor;
    this.verifier = options.verifier;
    this.recovery = options.recovery;
    this.taskStore = options.taskStore || null;
  }

  persist(task, sessionId, plan, results, reason = null, finalVerification = null) {
    if (!this.taskStore) return;
    this.taskStore.save(task, sessionId, { plan, results, reason, finalVerification });
  }

  async run(goal, context = {}) {
    if (!goal || !String(goal).trim()) throw new Error("Goal is required.");
    if (typeof this.planner !== "function") throw new Error("Planner callback is required.");
    if (typeof this.executor !== "function") throw new Error("Executor callback is required.");
    if (typeof this.verifier !== "function") throw new Error("Verifier callback is required.");

    const startedAt = Date.now();
    const deadline = Number.isFinite(this.limits.maxWallTimeMs) && this.limits.maxWallTimeMs >= 0
      ? startedAt + this.limits.maxWallTimeMs
      : Infinity;
    const sessionId = context.sessionId || "default_session";
    let task = createTask(goal, { ...context, phase: "planner", startedAt, id: context.taskId });
    let plan;
    this.persist(task, sessionId, null, []);

    try {
      plan = this.plan ? normalizePlan(this.plan, goal) : normalizePlan(await this.planner(goal, context), goal);
      task = transition(task, "planning", "Plan created");
      this.persist(task, sessionId, plan, []);
    } catch (error) {
      task = transition(task, "planning", "Planner failed");
      task = transition(task, "failed", `Planning failed: ${error.message}`);
      this.persist(task, sessionId, plan, [], error.message);
      return this.snapshot(task, plan, [], error.message);
    }

    const results = [];
    const maxRetries = this.limits.maxRetries ?? 3;

    for (const step of plan.steps) {
      if (Date.now() >= deadline) {
        task = transition(task, "blocked", "Wall-clock budget exhausted");
        this.persist(task, sessionId, plan, results, "Wall-clock budget exhausted");
        return this.snapshot(task, plan, results, "Wall-clock budget exhausted");
      }

      const budget = canContinue(task, this.limits);
      if (!budget.ok) {
        task = transition(task, "blocked", budget.reason);
        this.persist(task, sessionId, plan, results, budget.reason);
        return this.snapshot(task, plan, results, budget.reason);
      }

      let attempts = 0;
      let stepResult = null;
      let lastVerification = null;
      let recoveryContext = null;
      let stepFinished = false;

      while (attempts < maxRetries) {
        if (Date.now() >= deadline) {
          task = transition(task, "blocked", "Wall-clock budget exhausted");
          this.persist(task, sessionId, plan, results, "Wall-clock budget exhausted");
          return this.snapshot(task, plan, results, "Wall-clock budget exhausted");
        }

        const nextState = task.state === "planning" || task.state === "verifying" ? "executing" : task.state;
        task = transition(task, nextState, `Executing step ${step.id}`);
        attempts += 1;
        task = { ...task, step: task.step + 1, toolCalls: task.toolCalls + (step.tool ? 1 : 0) };
        this.persist(task, sessionId, plan, results);

        try {
          stepResult = await this.executor(step, {
            goal,
            plan,
            attempt: attempts,
            recoveryContext,
            task,
            deadline
          });
          task = transition(task, "verifying", `Step ${step.id} execution finished`);
          lastVerification = await this.verifier(step, stepResult, {
            goal,
            plan,
            attempt: attempts,
            task,
            deadline
          });
          if (lastVerification && lastVerification.pass === true) {
            task = transition(task, "executing", `Step ${step.id} verified`);
            results.push({ step, attempts, result: stepResult, verification: lastVerification });
            this.persist(task, sessionId, plan, results);
            stepFinished = true;
            break;
          }
          if (attempts >= maxRetries) break;
          recoveryContext = typeof this.recovery === "function"
            ? await this.recovery(step, stepResult, lastVerification, { goal, plan, attempt: attempts, task, deadline })
            : { reason: "Verification failed", previousResult: stepResult };
          this.persist(task, sessionId, plan, results, lastVerification?.reason || "Verification failed");
        } catch (error) {
          lastVerification = { pass: false, reason: error.message };
          if (attempts >= maxRetries) break;
          try {
            recoveryContext = typeof this.recovery === "function"
              ? await this.recovery(step, stepResult, lastVerification, { goal, plan, attempt: attempts, task, deadline, error })
              : { reason: error.message };
          } catch (recoveryError) {
            recoveryContext = { reason: error.message, recoveryError: recoveryError.message };
          }
          this.persist(task, sessionId, plan, results, error.message);
        }
      }

      if (!stepFinished) {
        task = transition(task, "failed", `Step ${step.id} failed after ${attempts} attempt(s)`);
        const reason = lastVerification?.reason || "Step verification failed";
        this.persist(task, sessionId, plan, results, reason);
        return this.snapshot(task, plan, results, reason);
      }
    }

    task = transition(task, "verifying", "All planned steps executed");
    this.persist(task, sessionId, plan, results);
    let finalVerification;
    try {
      finalVerification = await this.verifier(
        { id: "final", description: goal, doneWhen: "All plan steps are complete", tool: null, input: {}, risk: "normal" },
        results,
        { goal, plan, task, final: true, deadline }
      );
    } catch (error) {
      task = transition(task, "failed", `Final verification error: ${error.message}`);
      this.persist(task, sessionId, plan, results, error.message);
      return this.snapshot(task, plan, results, error.message);
    }

    if (!finalVerification || finalVerification.pass !== true) {
      task = transition(task, "failed", "Final verification failed");
      const reason = finalVerification?.reason || "Final verification failed";
      this.persist(task, sessionId, plan, results, reason, finalVerification);
      return this.snapshot(task, plan, results, reason, finalVerification);
    }

    task = transition(task, "completed", "Final verification passed");
    this.persist(task, sessionId, plan, results, null, finalVerification);
    return this.snapshot(task, plan, results, null, finalVerification);
  }

  snapshot(task, plan, results, reason, finalVerification = null) {
    return {
      success: task.state === "completed",
      state: task.state,
      task,
      plan,
      results,
      reason: reason || null,
      finalVerification
    };
  }
}

module.exports = { AutonomousOrchestrator, normalizePlan };
