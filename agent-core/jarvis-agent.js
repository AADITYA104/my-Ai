"use strict";

const { callUniversalLLM } = require("../llm-providers");
const { criticStep } = require("../autonomous-loop-agent-v7-free");
const { AutonomousOrchestrator } = require("./autonomous-orchestrator");
const { TaskStore } = require("./task-store");

async function askModel(messages, system) {
  const response = await callUniversalLLM(messages, system);
  const text = (response.content || []).find(block => block.type === "text");
  return text ? text.text : "";
}

function parseJson(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model did not return JSON.");
  return JSON.parse(match[0]);
}

async function createPlan(goal, context = {}) {
  const system = [
    "You are the JARVIS planner.",
    "Create a minimal, ordered, independently verifiable execution plan.",
    "Never invent tool results or claim an action was performed.",
    "Prefer 1-6 concrete steps.",
    "For tool steps, include an exact JSON object in input using only the tool's documented input fields.",
    "Return ONLY JSON: {\"goal\":string,\"assumptions\":string[],\"steps\":[{\"id\":number,\"description\":string,\"doneWhen\":string,\"tool\":string|null,\"input\":object,\"risk\":\"low\"|\"normal\"|\"high\"}] }"
  ].join(" ");
  return parseJson(await askModel([{ role: "user", content: `Goal: ${goal}\nContext: ${JSON.stringify(context)}` }], system));
}

async function verifyStep(step, result) {
  const verdict = await criticStep(
    { description: step.description, doneWhen: step.doneWhen },
    String(result)
  );
  return {
    pass: verdict.pass,
    confidence: verdict.confidence,
    verdict: verdict.verdict,
    reason: verdict.feedback
  };
}

async function recover(step, result, verification) {
  const system = [
    "You are a recovery planner.",
    "Diagnose the failed execution and propose the next concrete attempt.",
    "Return ONLY JSON: {\"strategy\":string,\"constraints\":string[],\"change\":string,\"toolInputPatch\":object}",
    "toolInputPatch must contain only fields that should change in the next tool invocation; use {} when no input change is needed.",
    "Do not claim the fix was performed."
  ].join(" ");
  return parseJson(await askModel([{
    role: "user",
    content: `Step: ${step.description}\nCurrent tool input: ${JSON.stringify(step.input || {})}\nPrevious result: ${String(result)}\nVerification: ${JSON.stringify(verification)}`
  }], system);
}

function mergeToolInput(base, recoveryContext) {
  const patch = recoveryContext && recoveryContext.toolInputPatch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { ...base };
  return { ...base, ...patch };
}

async function runJarvisAgent(goal, context = {}) {
  const planner = context.planner || createPlan;
  const verifier = context.verifier || verifyStep;
  const recovery = context.recovery || recover;
  const taskStore = context.taskStore instanceof TaskStore ? context.taskStore : null;

  const executor = context.executor || (async (step, executionContext) => {
    if (!step.tool) {
      return askModel(
        [{
          role: "user",
          content: `Execute this reasoning-only step and return the concrete result:\n${step.description}\nSuccess criteria: ${step.doneWhen}`
        }],
        "Act as an execution specialist. Do not claim external side effects unless a tool actually performs them."
      );
    }

    if (!context.registry || typeof context.registry.execute !== "function") {
      const error = new Error("Governed tool registry is required for tool execution.");
      error.code = "REGISTRY_REQUIRED";
      throw error;
    }

    const toolInput = mergeToolInput(
      step.input || context.toolInput || {},
      executionContext && executionContext.recoveryContext
    );
    return context.registry.execute(step.tool, toolInput, context);
  });

  const orchestrator = new AutonomousOrchestrator({
    limits: context.limits || {},
    planner,
    executor,
    verifier,
    recovery,
    taskStore
  });

  return orchestrator.run(goal, context);
}

module.exports = {
  runJarvisAgent,
  createPlan,
  verifyStep,
  recover,
  mergeToolInput,
  askModel,
  parseJson
};
