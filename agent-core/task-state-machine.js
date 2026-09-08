"use strict";

const VALID = new Set(["queued", "planning", "executing", "verifying", "completed", "failed", "blocked", "cancelled"]);
const TERMINAL = new Set(["completed", "failed", "blocked", "cancelled"]);

const TRANSITIONS = {
  queued: new Set(["planning", "cancelled"]),
  planning: new Set(["executing", "blocked", "failed", "cancelled"]),
  executing: new Set(["executing", "verifying", "blocked", "failed", "cancelled"]),
  verifying: new Set(["executing", "completed", "failed", "blocked", "cancelled"]),
  completed: new Set(), failed: new Set(["planning", "cancelled"]), blocked: new Set(["planning", "cancelled"]), cancelled: new Set()
};

function createTask(goal, metadata = {}) {
  if (!goal || !String(goal).trim()) throw new Error("Task goal is required.");
  const now = new Date().toISOString();
  return {
    id: metadata.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    goal: String(goal).trim(), state: "queued", step: 0, toolCalls: 0,
    createdAt: now, updatedAt: now,
    history: [{ state: "queued", at: now }], metadata
  };
}

function transition(task, next, reason = "") {
  if (!VALID.has(next)) throw new Error(`Invalid task state: ${next}`);
  if (task.state !== next && !TRANSITIONS[task.state]?.has(next)) {
    throw new Error(`Invalid task transition: ${task.state} -> ${next}`);
  }
  const now = new Date().toISOString();
  return { ...task, state: next, updatedAt: now, history: [...(task.history || []), { state: next, at: now, reason }], terminal: TERMINAL.has(next) };
}

function canContinue(task, limits = {}) {
  if (TERMINAL.has(task.state)) return { ok: false, reason: `Task is ${task.state}.` };
  const maxSteps = limits.maxSteps ?? 24;
  const maxToolCalls = limits.maxToolCalls ?? 48;
  if (!Number.isFinite(maxSteps) || maxSteps < 0) return { ok: false, reason: "Invalid step budget." };
  if (!Number.isFinite(maxToolCalls) || maxToolCalls < 0) return { ok: false, reason: "Invalid tool-call budget." };
  if (task.step >= maxSteps) return { ok: false, reason: "Step budget exhausted." };
  if (task.toolCalls >= maxToolCalls) return { ok: false, reason: "Tool-call budget exhausted." };
  return { ok: true };
}

module.exports = { VALID_STATES: [...VALID], createTask, transition, canContinue, isTerminal: state => TERMINAL.has(state) };
