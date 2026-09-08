/**
 * Central autonomy policy for Ultron/JARVIS-style execution.
 * Shared by every interface so safety, scope and approval rules are consistent.
 */
"use strict";

const path = require("path");
const watchdog = require("../self-healing-watchdog");

const DEFAULTS = Object.freeze({
  maxSteps: 24,
  maxToolCalls: 48,
  maxWallTimeMs: 12 * 60 * 1000,
  requireApprovalFor: Object.freeze([
    "external_side_effect",
    "credential_change",
    "financial_action"
  ])
});

function workspaceRoot(root) { return path.resolve(root || process.cwd()); }

function isPathAllowed(filePath, root) {
  const base = workspaceRoot(root);
  const candidate = path.resolve(base, String(filePath || ""));
  const rel = path.relative(base, candidate);
  return rel === "" || (!rel.startsWith(".." + path.sep) && rel !== "..");
}

function classifyTool(toolName) {
  if (["read_file", "list_directory", "search_knowledge", "search_session_memory", "web_search", "fetch_web_page", "todo_read", "design_audit"].includes(toolName)) return "read_only";
  if (["write_file", "edit_file_surgical", "todo_write"].includes(toolName)) return "workspace_write";
  if (["run_code", "run_command", "generate_3d_model"].includes(toolName)) return "execution";
  if (["hierarchical_crew", "debate_group_chat", "invoke_specialist_agent", "solve_tot"].includes(toolName)) return "delegation";
  return "unknown";
}

function evaluateToolCall(toolName, input = {}, context = {}) {
  const kind = classifyTool(toolName);
  if (kind === "unknown") return { allowed: false, reason: `Unknown tool: ${toolName}` };

  const target = input.file_path || input.dir_path || input.target;
  if (target && !isPathAllowed(target, context.root)) {
    return { allowed: false, reason: "Path is outside the configured workspace." };
  }
  if ((toolName === "write_file" || toolName === "edit_file_surgical") && target && watchdog.isProtectedPath(path.resolve(workspaceRoot(context.root), target))) {
    return { allowed: false, reason: "Protected path rejected by watchdog." };
  }

  if (toolName === "run_command") {
    const command = String(input.command || "");
    if (!command.trim()) return { allowed: false, reason: "Empty command." };
    if (watchdog.isDestructiveCommand(command)) return { allowed: false, reason: "Command matched the destructive deny matrix." };
  }

  if (toolName === "run_code" && (typeof input.code !== "string" || !input.code.trim())) {
    return { allowed: false, reason: "No executable code supplied." };
  }

  const needsApproval = DEFAULTS.requireApprovalFor.includes(context.sideEffectClass);
  if (needsApproval && context.autoApprove !== true) {
    return { allowed: false, requiresApproval: true, reason: `Approval required for ${context.sideEffectClass}.` };
  }

  return { allowed: true, kind, requiresApproval: false };
}

module.exports = { DEFAULTS, classifyTool, evaluateToolCall, isPathAllowed };
