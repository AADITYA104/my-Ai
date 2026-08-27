/**
 * ============================================================================
 *  EXECUTIVE TODO & TASK PLANNER ENGINE (2026 ARCHITECTURE)
 *  Ported from deepseek-harness-master/packages/todo & dsh-plan
 *  - Persistent SQLite-backed task checklists
 *  - Structured status flow: pending -> in_progress -> completed -> cancelled
 *  - Automated system prompt injection for multi-step goals
 * ============================================================================
 */
"use strict";

const { sessionStore } = require("./session-store");

/**
 * Writes or updates the active todo checklist for a session
 */
function todoWrite(sessionId = "default_session", todos = []) {
  try {
    const list = Array.isArray(todos) ? todos : [todos];
    const saved = sessionStore.saveTodos(sessionId, list);
    return {
      success: true,
      count: saved.length,
      todos: saved,
      formatted: formatTodoList(saved)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Reads all active todos for a session
 */
function todoRead(sessionId = "default_session") {
  try {
    const todos = sessionStore.getTodos(sessionId);
    return {
      success: true,
      count: todos.length,
      todos,
      formatted: formatTodoList(todos)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Updates status of an individual task
 */
function todoUpdate(sessionId = "default_session", todoId, status, note = null) {
  try {
    const ok = sessionStore.updateTodo(sessionId, todoId, status, note);
    return {
      success: ok,
      message: ok ? `Task ${todoId} marked as ${status}.` : `Task ${todoId} not found.`
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Pretty-formats a list of todo items with cyberpunk checkboxes
 */
function formatTodoList(todos = []) {
  if (!todos || todos.length === 0) return "No active tasks in executive checklist.";

  const statusIcons = {
    pending: "[ ]",
    in_progress: "[▶]",
    completed: "[✔]",
    cancelled: "[✖]"
  };

  const lines = ["📋 === ULTRON EXECUTIVE TASK CHECKLIST ==="];
  for (const t of todos) {
    const icon = statusIcons[t.status] || "[?]";
    lines.push(`  ${icon} #${t.id}: ${t.task} (${t.status.toUpperCase()})${t.note ? ` — Note: ${t.note}` : ""}`);
  }
  return lines.join("\n");
}

/**
 * Context prompt injector for ongoing multi-turn sessions
 */
function getTodoContextPrompt(sessionId = "default_session") {
  const todos = sessionStore.getTodos(sessionId);
  const active = todos.filter(t => t.status === "pending" || t.status === "in_progress");
  if (active.length === 0) return "";

  return `\n<active_executive_plan>\n${formatTodoList(active)}\n</active_executive_plan>\n`;
}

module.exports = {
  todoWrite,
  todoRead,
  todoUpdate,
  formatTodoList,
  getTodoContextPrompt
};
