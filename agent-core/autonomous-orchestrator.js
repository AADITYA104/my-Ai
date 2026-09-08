"use strict";

const { createTask, transition, canContinue, isTerminal } = require("./task-state-machine");
const { DEFAULTS } = require("./autonomy-policy");
const { TaskStore } = require("./task-store");

const NON_RETRYABLE_ERROR_CODES = new Set([
  "APPROVAL_REQUIRED",
  "TOOL_DENIED",
  "INVALID_TOOL_INPUT",
  "WORKSPACE_ESCAPE",
  "TASK_NOT_FOUND",
  "TASK_NOT_RESUMABLE"
]);

function isRetryableError(error) {
  if (!error) return true;
  return !NON_RETRYABLE_ERROR_CODES.has(error.code);
}

function normalizePlan(plan, goal) {
  if (!plan || typeof plan !== "object") throw new Error("Planner returned no plan.");
  const steps = Array.isArray(plan.steps) ? plan.steps : Array.isArray(plan.subtasks) ? plan.subtasks : [];
  if (steps.length === 0) throw new Error("Planner returned an empty plan.");
  const normalized = steps.map((step, index) => ({
    id: step.id == null ? index + 1 : step.id,
    description: String(step.description || step.task || "").trim(),
    doneWhen: String(step.doneWhen || step.successCriteria || "").trim(),
    tool: step.tool || null,
    input: step.input && typeof step.input === "object" && !Array.isArray(step.input) ? step.input : {},
    risk: step.risk || "normal"
  })).filter(step => step.description);
  if (normalized.length === 0) throw new Error("Planner returned no usable steps.");

  const ids = new Set();
  for (const step of normalized) {
    const key = String(step.id);
    if (ids.has(key)) throw new Error(`Planner returned duplicate step id: ${step.id}`);
    ids.add(key);
  }

  return {
    goal: String(plan.goal || goal).trim(),
    assumptions: Array.isArray(plan.assumptions) ? plan.assumptions : [],
    steps: normalized
  };
}

function withDeadline(promiseOrFactory, deadline, label = "Operation") {
  if (deadline === Infinity) return Promise.resolve().then(promiseOrFactory);
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    const error = new Error(`Wall-clock budget exhausted during ${label}.`);
    error.code = "WALL_TIME_EXHAUSTED";
    return Promise.reject(error);
  }

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Wall-clock budget exhausted during ${label}.`);
      error.code = "WALL_TIME_EXHAUSTED";
      reject(error);
    }, remaining);
  });

  return Promise.race([Promise.resolve().then(promiseOrFactory), timeout]).finally(() => clearTimeout(timer));
}

class AutonomousOrchestrator {
  constructor(options = {}) {
    this.limits = { ...DEFAULTS, ...(options.limits || {}) };
    this.plan = options.plan || null;
    this.planner = options.planner;
    this.executor = options.executor;
    this.verifier = options.verifier;
    this.recovery = options.recovery;
    this.taskStore = options.taskStore instanceof TaskStore ? options.taskStore : null;
  }

  persist(task, sessionId, plan, results, reason = null, finalVerification = null) {
    if (!this.taskStore) return;
    this.taskStore.save(task, sessionId, { plan, results, reason, finalVerification });
  }

  async run(goal, context = {}) {
    const resumeTaskId = context.resumeTaskId || context.resumeTask;
    if (resumeTaskId && this.taskStore) {
      return this.resume(resumeTaskId, context.sessionId || "default_session", context);
    }

    if (!goal || !String(goal).trim()) throw new Error("Goal is required.");
    if (typeof this.planner !== "function") throw new Error("Planner callback is required.");
    if (typeof this.executor !== "function") throw new Error("Executor callback is required.");
    if (typeof this.verifier !== "function") throw new Error("Verifier callback is required.");

    const startedAt = Date.now();
    const deadline = Number.isFinite(this.limits.maxWallTimeMs) && this.limits.maxWallTimeMs >= 0
      ? startedAt + this.limits.maxWallTimeMs
      : Infinity;
    const sessionId = context.sessionId || "default_session";
    let task = createTask(goal, { phase: "planner", startedAt, sessionId: String(sessionId), id: context.taskId });
    let plan;
    this.persist(task, sessionId, null, []);

    try {
      plan = this.plan
        ? normalizePlan(this.plan, goal)
        : normalizePlan(await withDeadline(() => this.planner(goal, context), deadline, "planning"), goal);
      task = transition(task, "planning", "Plan created");
      this.persist(task, sessionId, plan, []);
    } catch (error) {
      const reason = error.code === "WALL_TIME_EXHAUSTED" ? "Wall-clock budget exhausted" : `Planning failed: ${error.message}`;
      task = transition(task, "planning", "Planner failed");
      task = transition(task, error.code === "WALL_TIME_EXHAUSTED" ? "blocked" : "failed", reason);
      this.persist(task, sessionId, plan, [], reason);
      return this.snapshot(task, plan, [], reason);
    }

    return this.executePlan(goal, sessionId, task, plan, [], context, deadline);
  }

  async resume(taskId, sessionId = "default_session", context = {}) {
    if (!this.taskStore) throw new Error("Task store is required for resume.");
    if (!taskId || !String(taskId).trim()) throw new Error("Task id is required for resume.");
    if (typeof this.executor !== "function") throw new Error("Executor callback is required.");
    if (typeof this.verifier !== "function") throw new Error("Verifier callback is required.");

    const record = this.taskStore.load(taskId, sessionId);
    if (!record) {
      const error = new Error(`Persisted task not found: ${taskId}`);
      error.code = "TASK_NOT_FOUND";
      throw error;
    }
    if (!record.plan || !Array.isArray(record.plan.steps)) {
      const error = new Error("Persisted task has no resumable plan.");
      error.code = "TASK_NOT_RESUMABLE";
      throw error;
    }
    if (record.task.state === "completed") return this.snapshot(record.task, record.plan, record.results, record.reason, record.finalVerification);
    if (record.task.state === "cancelled") {
      const error = new Error("Cancelled tasks cannot be resumed.");
      error.code = "TASK_NOT_RESUMABLE";
      throw error;
    }

    let task = record.task;
    if (isTerminal(task.state)) task = transition(task, "planning", "Resuming persisted task");
    else if (task.state === "verifying") task = transition(task, "executing", "Resuming persisted task");
    else if (task.state === "queued") task = transition(task, "planning", "Resuming persisted task");
    const plan = normalizePlan(record.plan, task.goal);
    const results = Array.isArray(record.results) ? record.results : [];
    const startedAt = Date.now();
    const deadline = Number.isFinite(this.limits.maxWallTimeMs) && this.limits.maxWallTimeMs >= 0
      ? startedAt + this.limits.maxWallTimeMs
      : Infinity;

    this.persist(task, sessionId, plan, results, "Resuming persisted task");
    return this.executePlan(task.goal, sessionId, task, plan, results, context, deadline);
  }

  async executePlan(goal, sessionId, initialTask, plan, initialResults, context, deadline) {
    let task = initialTask;
    const results = [...initialResults];
    const maxRetries = this.limits.maxRetries ?? 3;
    const completedStepIds = new Set(results.map(entry => entry && entry.step && entry.step.id));

    for (const step of plan.steps) {
      if (completedStepIds.has(step.id)) continue;

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
          stepResult = await withDeadline(() => this.executor(step, {
            goal,
            plan,
            attempt: attempts,
            recoveryContext,
            task,
            deadline,
            ...context
          }), deadline, `step ${step.id} execution`);
          task = transition(task, "verifying", `Step ${step.id} execution finished`);
          lastVerification = await withDeadline(() => this.verifier(step, stepResult, {
            goal,
            plan,
            attempt: attempts,
            task,
            deadline,
            ...context
          }), deadline, `step ${step.id} verification`);
          if (lastVerification && lastVerification.pass === true) {
            task = transition(task, "executing", `Step ${step.id} verified`);
            results.push({ step, attempts, result: stepResult, verification: lastVerification });
            completedStepIds.add(step.id);
            this.persist(task, sessionId, plan, results);
            stepFinished = true;
            break;
          }
          if (attempts >= maxRetries) break;
          recoveryContext = typeof this.recovery === "function"
            ? await withDeadline(() => this.recovery(step, stepResult, lastVerification, { goal, plan, attempt: attempts, task, deadline, ...context }), deadline, `step ${step.id} recovery`)
            : { reason: "Verification failed", previousResult: stepResult };
          this.persist(task, sessionId, plan, results, lastVerification?.reason || "Verification failed");
        } catch (error) {
          lastVerification = { pass: false, reason: error.message, code: error.code || null };
          if (!isRetryableError(error) || attempts >= maxRetries) break;
          try {
            recoveryContext = typeof this.recovery === "function"
              ? await withDeadline(() => this.recovery(step, stepResult, lastVerification, { goal, plan, attempt: attempts, task, deadline, error, ...context }), deadline, `step ${step.id} recovery`)
              : { reason: error.message };
          } catch (recoveryError) {
            recoveryContext = { reason: error.message, recoveryError: recoveryError.message };
          }
          this.persist(task, sessionId, plan, results, error.message);
        }
      }

      if (!stepFinished) {
        if (Date.now() >= deadline || lastVerification?.reason?.startsWith("Wall-clock budget exhausted")) {
          task = transition(task, "blocked", "Wall-clock budget exhausted");
          this.persist(task, sessionId, plan, results, "Wall-clock budget exhausted");
          return this.snapshot(task, plan, results, "Wall-clock budget exhausted");
        }
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
      finalVerification = await withDeadline(() => this.verifier(
        { id: "final", description: goal, doneWhen: "All plan steps are complete", tool: null, input: {}, risk: "normal" },
        results,
        { goal, plan, task, final: true, deadline, ...context }
      ), deadline, "final verification");
    } catch (error) {
      const reason = error.code === "WALL_TIME_EXHAUSTED" ? "Wall-clock budget exhausted" : `Final verification error: ${error.message}`;
      task = transition(task, error.code === "WALL_TIME_EXHAUSTED" ? "blocked" : "failed", reason);
      this.persist(task, sessionId, plan, results, reason);
      return this.snapshot(task, plan, results, reason);
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

module.exports = { AutonomousOrchestrator, normalizePlan, withDeadline, isRetryableError };
