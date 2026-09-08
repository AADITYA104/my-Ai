"use strict";

const { createTask, transition, canContinue } = require("./task-state-machine");
const { DEFAULTS } = require("./autonomy-policy");

function normalizePlan(plan, goal) {
  if (!plan || typeof plan !== "object") throw new Error("Planner returned no plan.");
  const steps = Array.isArray(plan.steps) ? plan.steps : Array.isArray(plan.subtasks) ? plan.subtasks : [];
  if (steps.length === 0) throw new Error("Planner returned an empty plan.");
  return {
    goal: String(plan.goal || goal).trim(),
    assumptions: Array.isArray(plan.assumptions) ? plan.assumptions : [],
    steps: steps.map((step, index) => ({
      id: step.id == null ? index + 1 : step.id,
      description: String(step.description || step.task || "").trim(),
      doneWhen: String(step.doneWhen || step.successCriteria || "").trim(),
      tool: step.tool || null,
      input: step.input && typeof step.input === "object" ? step.input : {},
      risk: step.risk || "normal"
    })).filter(step => step.description)
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
  }

  async run(goal, context = {}) {
    if (!goal || !String(goal).trim()) throw new Error("Goal is required.");
    if (typeof this.planner !== "function") throw new Error("Planner callback is required.");
    if (typeof this.executor !== "function") throw new Error("Executor callback is required.");
    if (typeof this.verifier !== "function") throw new Error("Verifier callback is required.");

    let task = createTask(goal, { ...context, phase: "planner" });
    let plan = this.plan ? normalizePlan(this.plan, goal) : normalizePlan(await this.planner(goal, context), goal);
    task = transition(task, "planning", "Plan created");
    const results = [];

    for (const step of plan.steps) {
      const budget = canContinue(task, this.limits);
      if (!budget.ok) {
        task = transition(task, "blocked", budget.reason);
        return this.snapshot(task, plan, results, budget.reason);
      }

      let attempts = 0;
      let stepResult = null;
      let lastVerification = null;
      let recoveryContext = null;
      let stepFinished = false;
      const maxRetries = Number.isFinite(Number(this.limits.maxRetries)) ? Number(this.limits.maxRetries) : 3;

      while (attempts < maxRetries) {
        const nextState = task.state === "planning" || task.state === "verifying" ? "executing" : task.state;
        task = transition(task, nextState, `Executing step ${step.id}`);
        attempts += 1;
        task = { ...task, step: task.step + 1, toolCalls: task.toolCalls + 1 };

        try {
          stepResult = await this.executor(step, { goal, plan, attempt: attempts, recoveryContext, task });
          task = transition(task, "verifying", `Step ${step.id} execution finished`);
          lastVerification = await this.verifier(step, stepResult, { goal, plan, attempt: attempts, task });
          if (lastVerification && lastVerification.pass === true) {
            task = transition(task, "executing", `Step ${step.id} verified`);
            results.push({ step, attempts, result: stepResult, verification: lastVerification });
            stepFinished = true;
            break;
          }
          if (attempts >= maxRetries) break;
          recoveryContext = typeof this.recovery === "function"
            ? await this.recovery(step, stepResult, lastVerification, { goal, plan, attempt: attempts, task })
            : { reason: "Verification failed", previousResult: stepResult };
        } catch (error) {
          lastVerification = { pass: false, reason: error.message };
          if (attempts >= maxRetries) break;
          recoveryContext = typeof this.recovery === "function"
            ? await this.recovery(step, stepResult, lastVerification, { goal, plan, attempt: attempts, task, error })
            : { reason: error.message };
        }
      }

      if (!stepFinished) {
        if (task.state === "verifying") task = transition(task, "failed", `Step ${step.id} failed after ${attempts} attempt(s)`);
        else task = transition(task, "failed", `Step ${step.id} failed after ${attempts} attempt(s)`);
        return this.snapshot(task, plan, results, lastVerification?.reason || "Step verification failed");
      }
    }

    task = transition(task, "verifying", "All planned steps executed");
    let finalVerification;
    try {
      finalVerification = await this.verifier({ id: "final", description: goal, doneWhen: "All plan steps are complete" }, results, { goal, plan, task, final: true });
    } catch (error) {
      finalVerification = { pass: false, reason: error.message };
    }
    if (!finalVerification || finalVerification.pass !== true) {
      task = transition(task, "failed", "Final verification failed");
      return this.snapshot(task, plan, results, finalVerification?.reason || "Final verification failed", finalVerification);
    }

    task = transition(task, "completed", "Final verification passed");
    return this.snapshot(task, plan, results, null, finalVerification);
  }

  snapshot(task, plan, results, reason, finalVerification = null) {
    return { success: task.state === "completed", state: task.state, task, plan, results, reason: reason || null, finalVerification };
  }
}

module.exports = { AutonomousOrchestrator, normalizePlan };
