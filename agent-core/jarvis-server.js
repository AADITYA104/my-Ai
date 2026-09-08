"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { runJarvisAgent, verifyStep, recover } = require("./jarvis-agent");
const { executeTool } = require("../autonomous-loop-agent-v7-free");
const { ToolRegistry } = require("./tool-registry");
const { AgentLoopGuard } = require("../agent-loop-guard");
const { TaskStore } = require("./task-store");
const { AutonomousOrchestrator } = require("./autonomous-orchestrator");

const app = express();
const PORT = Number(process.env.JARVIS_PORT || 3010);
const HOST = process.env.JARVIS_HOST || "127.0.0.1";
const registry = new ToolRegistry();
const taskStore = new TaskStore();

app.use(express.json({ limit: "2mb" }));

const TOOL_CONTRACTS = [
  ["read_file", "Read a workspace text file. Input: {file_path:string}"],
  ["write_file", "Write verified text to a workspace file. Input: {file_path:string,content:string}"],
  ["run_command", "Run a governed shell command in the workspace. Input: {command:string}"],
  ["run_code", "Run JavaScript or Python code. Input: {language:string,code:string}"],
  ["list_directory", "List entries in a workspace directory. Input: {dir_path?:string}"],
  ["design_audit", "Audit a UI file or folder for design and accessibility anti-patterns. Input: {target:string}"],
  ["hierarchical_crew", "Delegate a complex mission to the manager-led specialist crew. Input: {mission:string,maxSteps?:number}"],
  ["debate_group_chat", "Run a multi-agent debate on a contentious design or architecture topic. Input: {topic:string,maxTurns?:number}"],
  ["generate_3d_model", "Generate a 3D model through the configured Hunyuan3D service. Input: {text?:string,imagePath?:string,texture?:boolean,outputPath?:string}"]
];
const KNOWN_TOOLS = TOOL_CONTRACTS.map(([name]) => name);

function adaptLegacyToolInput(name, input) {
  const value = input && typeof input === "object" ? input : {};
  switch (name) {
    case "read_file":
    case "write_file":
      return { ...value, filePath: value.file_path ?? value.filePath };
    case "run_code":
      return { ...value, language: value.language || "javascript", code: value.code };
    default:
      return value;
  }
}

function resolveWorkspacePath(inputPath = ".") {
  const root = path.resolve(process.cwd());
  const resolved = path.resolve(root, String(inputPath || "."));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    const error = new Error("Workspace path escapes the JARVIS workspace.");
    error.code = "WORKSPACE_ESCAPE";
    throw error;
  }
  return resolved;
}

for (const [name, description] of TOOL_CONTRACTS) {
  registry.register({
    name,
    description,
    execute: (input) => {
      if (name === "run_command") {
        const command = String(input.command || "").trim();
        if (!command) throw new Error("Empty command.");
        return execSync(command, {
          cwd: process.cwd(),
          encoding: "utf-8",
          timeout: 15000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"]
        });
      }
      if (name === "list_directory") {
        const dirPath = resolveWorkspacePath(input.dir_path || ".");
        return fs.readdirSync(dirPath, { withFileTypes: true }).map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other"
        }));
      }
      if (name === "run_code") {
        return executeTool("code_exec", adaptLegacyToolInput(name, input));
      }
      return executeTool(name, adaptLegacyToolInput(name, input));
    }
  });
}

function isServerAutoApprovalEnabled() {
  return process.env.JARVIS_ALLOW_AUTO_APPROVE === "true";
}

function normalizeSessionId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "default_session";
}

function normalizeTaskId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function createExecutionContext(autoApprove, loopGuard) {
  return {
    autoApprove,
    loopGuard,
    taskStore,
    executor: (step, context) => executeWithPolicy(step, { ...context, autoApprove, loopGuard })
  };
}

async function executeWithPolicy(step, executionContext = {}) {
  if (!step || typeof step.tool !== "string" || !step.tool.trim()) {
    throw new Error("A valid tool name is required.");
  }

  const input = step.input && typeof step.input === "object" ? step.input : {};
  const policyContext = {
    root: process.cwd(),
    sideEffectClass: step.risk === "high" ? "external_side_effect" : undefined,
    autoApprove: executionContext.autoApprove === true && isServerAutoApprovalEnabled()
  };
  const loopGuard = executionContext.loopGuard instanceof AgentLoopGuard
    ? executionContext.loopGuard
    : new AgentLoopGuard();

  const anomaly = loopGuard.checkAnomaly(step.tool, input, policyContext);
  if (anomaly.isLoop) {
    const reason = anomaly.policy?.reason || anomaly.warning;
    const error = new Error(`🛡️ [AUTONOMY POLICY]: ${reason}`);
    error.code = anomaly.type === "approval_required"
      ? "APPROVAL_REQUIRED"
      : anomaly.policy?.reason === "Path is outside the configured workspace."
        ? "WORKSPACE_ESCAPE"
        : "LOOP_GUARD_BLOCKED";
    error.policy = anomaly.policy;
    throw error;
  }

  try {
    const result = await registry.execute(step.tool, input, policyContext);
    loopGuard.record(step.tool, input, result, false);
    return result;
  } catch (error) {
    loopGuard.record(step.tool, input, error.message, true);
    throw error;
  }
}

app.get("/health", (_req, res) => {
  res.json({
    service: "JARVIS",
    status: "ONLINE",
    timestamp: new Date().toISOString(),
    tools: registry.list()
  });
});

app.post("/api/jarvis/run", async (req, res) => {
  const goal = typeof req.body?.goal === "string" ? req.body.goal.trim() : "";
  if (!goal) return res.status(400).json({ success: false, error: "goal is required" });

  try {
    const autoApprove = req.body.autoApprove === true && isServerAutoApprovalEnabled();
    const loopGuard = new AgentLoopGuard();
    const sessionId = normalizeSessionId(req.body.sessionId);
    const result = await runJarvisAgent(goal, {
      ...createExecutionContext(autoApprove, loopGuard),
      sessionId,
      taskId: normalizeTaskId(req.body.taskId) || undefined,
      limits: req.body.limits || {},
      autoApprove,
      availableTools: registry.list()
    });
    res.status(result.success ? 200 : 422).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, code: err.code || "JARVIS_RUN_ERROR" });
  }
});

app.post("/api/jarvis/resume", async (req, res) => {
  const taskId = normalizeTaskId(req.body?.taskId);
  if (!taskId) return res.status(400).json({ success: false, error: "taskId is required" });

  try {
    const autoApprove = req.body.autoApprove === true && isServerAutoApprovalEnabled();
    const loopGuard = new AgentLoopGuard();
    const sessionId = normalizeSessionId(req.body.sessionId);
    const orchestrator = new AutonomousOrchestrator({
      limits: req.body.limits || {},
      taskStore,
      executor: (step, context) => executeWithPolicy(step, { ...context, autoApprove, loopGuard }),
      verifier: verifyStep,
      recovery: recover
    });
    const result = await orchestrator.resume(taskId, sessionId, {
      autoApprove,
      loopGuard,
      availableTools: registry.list()
    });
    res.status(result.success ? 200 : 422).json(result);
  } catch (err) {
    const status = err.code === "TASK_NOT_FOUND" || err.code === "TASK_NOT_RESUMABLE" ? 404 : 500;
    res.status(status).json({ success: false, error: err.message, code: err.code || "JARVIS_RESUME_ERROR" });
  }
});

function startServer(port = PORT, host = HOST) {
  return app.listen(port, host, () => {
    console.log(`[JARVIS] Autonomous API listening on http://${host}:${port}`);
  });
}

if (require.main === module) startServer();

module.exports = { app, startServer, executeWithPolicy, registry, isServerAutoApprovalEnabled, taskStore, adaptLegacyToolInput, resolveWorkspacePath, KNOWN_TOOLS };
