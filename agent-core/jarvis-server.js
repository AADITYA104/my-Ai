"use strict";

const express = require("express");
const { runJarvisAgent } = require("./jarvis-agent");
const { executeTool } = require("../autonomous-loop-agent-v7-free");
const { evaluateToolCall } = require("./autonomy-policy");

const app = express();
const PORT = Number(process.env.JARVIS_PORT || 3010);
const HOST = process.env.JARVIS_HOST || "127.0.0.1";

app.use(express.json({ limit: "2mb" }));

function executeWithPolicy(step, executionContext = {}) {
  const input = step.input || {};
  const sideEffectClass = step.risk === "high" ? "external_side_effect" : undefined;
  const policy = evaluateToolCall(step.tool, input, {
    root: process.cwd(),
    sideEffectClass,
    autoApprove: executionContext.autoApprove === true
  });
  if (!policy.allowed) {
    const error = new Error(policy.reason);
    error.code = policy.requiresApproval ? "APPROVAL_REQUIRED" : "TOOL_DENIED";
    throw error;
  }
  return executeTool(step.tool, input);
}

app.get("/health", (_req, res) => {
  res.json({ service: "JARVIS", status: "ONLINE", timestamp: new Date().toISOString() });
});

app.post("/api/jarvis/run", async (req, res) => {
  const goal = typeof req.body?.goal === "string" ? req.body.goal.trim() : "";
  if (!goal) return res.status(400).json({ success: false, error: "goal is required" });

  try {
    const result = await runJarvisAgent(goal, {
      sessionId: req.body.sessionId || "default_session",
      limits: req.body.limits || {},
      autoApprove: req.body.autoApprove === true,
      executor: (step, context) => executeWithPolicy(step, { ...context, autoApprove: req.body.autoApprove === true })
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

module.exports = { app, startServer, executeWithPolicy };
