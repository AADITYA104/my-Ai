"use strict";

const express = require("express");
const fs = require("fs");
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

const KNOWN_TOOLS = [
  "read_file", "write_file", "run_command", "run_code", "list_directory",
  "search_knowledge", "search_session_memory", "edit_file_surgical", "todo_write",
  "todo_read", "web_search", "fetch_web_page", "solve_tot", "design_audit",
  "hierarchical_crew", "debate_group_chat", "invoke_specialist_agent", "generate_3d_model"
];

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

for (const name of KNOWN_TOOLS) {
  registry.register({
    name,
    description: `JARVIS governed ${name} tool`,
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
        const dirPath = String(input.dir_path || ".").trim() || ".";
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
    const error = new Error(anomaly.warning);
    error.code = anomaly.type === "approval_required" ? "APPROVAL_REQUIRED" : "LOOP_GUARD_BLOCKED";
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
      autoApprove
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
      loopGuard
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

module.exports = { app, startServer, executeWithPolicy, registry, isServerAutoApprovalEnabled, taskStore, adaptLegacyToolInput };
