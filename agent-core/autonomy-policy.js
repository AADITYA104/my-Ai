/**
 * Central autonomy policy for Ultron/JARVIS-style execution.
 * Shared by every interface so safety, scope and approval rules are consistent.
 */
"use strict";

const fs = require("fs");
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

function workspaceRoot(root) {
  return path.resolve(root || process.cwd());
}

function canonicalExistingPath(candidate) {
  try {
    return fs.realpathSync.native(candidate);
  } catch (_) {
    return null;
  }
}

function canonicalParentPath(candidate) {
  let current = path.dirname(candidate);
  while (true) {
    const real = canonicalExistingPath(current);
    if (real) return path.join(real, path.basename(candidate));
    const parent = path.dirname(current);
    if (parent === current) return candidate;
    current = parent;
  }
}

function isWithin(base, candidate) {
  const rel = path.relative(base, candidate);
  return rel === "" || (!rel.startsWith(".." + path.sep) && rel !== "..");
}

/**
 * Resolve a path while rejecting lexical traversal and existing symlink escapes.
 * For new files, the nearest existing parent is canonicalized so a symlinked
 * directory cannot be used to write outside the workspace.
 */
function resolveWorkspacePath(filePath, root) {
  const base = workspaceRoot(root);
  const lexical = path.resolve(base, String(filePath || ""));
  if (!isWithin(base, lexical)) {
    return { allowed: false, reason: "Path is outside the configured workspace." };
  }

  const realBase = canonicalExistingPath(base) || base;
  const realCandidate = canonicalExistingPath(lexical) || canonicalParentPath(lexical);
  if (!isWithin(realBase, realCandidate)) {
    return { allowed: false, reason: "Path resolves outside the configured workspace." };
  }
  return { allowed: true, path: lexical, realPath: realCandidate };
}

function isPathAllowed(filePath, root) {
  return resolveWorkspacePath(filePath, root).allowed;
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

  const targets = [input.file_path, input.dir_path, input.target, input.outputPath, input.imagePath]
    .filter(value => typeof value === "string" && value.trim());
  for (const target of targets) {
    const resolved = resolveWorkspacePath(target, context.root);
    if (!resolved.allowed) return { allowed: false, reason: resolved.reason };
  }

  if ((toolName === "write_file" || toolName === "edit_file_surgical") && input.file_path) {
    const resolved = resolveWorkspacePath(input.file_path, context.root);
    if (resolved.allowed && watchdog.isProtectedPath(resolved.path)) {
      return { allowed: false, reason: "Protected path rejected by watchdog." };
    }
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

module.exports = { DEFAULTS, classifyTool, evaluateToolCall, isPathAllowed, resolveWorkspacePath };
