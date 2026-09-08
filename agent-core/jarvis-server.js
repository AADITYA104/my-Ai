"use strict";

const express = require("express");
const { runJarvisAgent } = require("./jarvis-agent");
const { executeTool } = require("../autonomous-loop-agent-v7-free");
const { ToolRegistry } = require("./tool-registry");
const { AgentLoopGuard } = require("../agent-loop-guard");
const { TaskStore } = require("./task-store");

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

for (const name of KNOWN_TOOLS) {
  registry.register({
    name,
    description: `JARVIS governed ${name} tool`,
    execute: (input) => executeTool(name, input)
  });
}

// A client request must never be able to grant itself approval for high-risk work.
// Auto-approval is an explicit server/operator configuration, not user input.
function isServerAutoApprovalEnabled() {
  return process.env.JARVIS_ALLOW_AUTO_APPROVE === "true";
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
    const sessionId = typeof req.body.sessionId === "string" && req.body.sessionId.trim()
      ? req.body.sessionId.trim()
      : "default_session";
    const result = await runJarvisAgent(goal, {
      sessionId,
      taskId: typeof req.body.taskId === "string" && req.body.taskId.trim() ? req.body.taskId.trim() : undefined,
      limits: req.body.limits || {},
      autoApprove,
      taskStore,
      executor: (step, context) => executeWithPolicy(step, { ...context, autoApprove, loopGuard })
    });
    res.status(result.success ? 200 : 422).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, code: err.code || "JARVIS_RUN_ERROR" });
  }
});

function startServer(port = PORT, host = HOST) {
  return app.listen(port, host, () => {
    console.log(`[JARVIS] Autonomous API listening on http://${host}:${port}`);
  });
}

if (require.main === module) startServer();

module.exports = { app, startServer, executeWithPolicy, registry, isServerAutoApprovalEnabled, taskStore };
