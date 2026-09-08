"use strict";

const { callUniversalLLM } = require("../llm-providers");
const { executeTool, criticStep } = require("../autonomous-loop-agent-v7-free");
const { AutonomousOrchestrator } = require("./autonomous-orchestrator");

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
    "Return ONLY JSON: {\"goal\":string,\"assumptions\":string[],\"steps\":[{\"id\":number,\"description\":string,\"doneWhen\":string,\"tool\":string|null,\"risk\":\"low\"|\"normal\"|\"high\"}]}"
  ].join(" ");
  return parseJson(await askModel([{ role: "user", content: `Goal: ${goal}\nContext: ${JSON.stringify(context)}` }], system));
}

async function verifyStep(step, result) {
  const verdict = await criticStep({ description: step.description, doneWhen: step.doneWhen }, String(result));
  return {
    pass: verdict.pass,
    confidence: verdict.confidence,
    verdict: verdict.verdict,
    reason: verdict.feedback
  };
}

async function recover(step, result, verification) {
  const system = "You are a recovery planner. Diagnose the failed execution and propose the next concrete attempt. Return ONLY JSON: {\"strategy\":string,\"constraints\":string[],\"change\":string}. Do not claim the fix was performed.";
  return parseJson(await askModel([{
    role: "user",
    content: `Step: ${step.description}\nPrevious result: ${String(result)}\nVerification: ${JSON.stringify(verification)}`
  }], system));
}

async function runJarvisAgent(goal, context = {}) {
  const orchestrator = new AutonomousOrchestrator({
    limits: context.limits || {},
    planner: createPlan,
    executor: async (step, executionContext) => {
      const toolName = step.tool;
      if (!toolName) {
        return await askModel([{
          role: "user",
          content: `Execute this reasoning-only step and return the concrete result:\n${step.description}\nSuccess criteria: ${step.doneWhen}`
        }], "Act as an execution specialist. Do not claim external side effects unless a tool actually performs them.");
      }
      const toolInput = executionContext.recoveryContext?.toolInput || context.toolInput || {};
      return executeTool(toolName, toolInput);
    },
    verifier: verifyStep,
    recovery: recover
  });

  return orchestrator.run(goal, context);
}

module.exports = { runJarvisAgent, createPlan, verifyStep, recover };
