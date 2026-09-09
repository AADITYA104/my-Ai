"use strict";

const assert = require("assert");
const { AutonomousOrchestrator } = require("../agent-core/autonomous-orchestrator");
const { MemoryLearning } = require("../agent-core/memory-learning");

(async () => {
  const memory = {
    memories: [],
    store(topic, content, tags, category) {
      const id = `lesson_${this.memories.length + 1}`;
      this.memories.push({ id, topic, content, tags, category });
      return id;
    },
    save() {}
  };
  const learner = new MemoryLearning({ memory });
  const agent = new AutonomousOrchestrator({
    memoryLearning: learner,
    limits: { maxSteps: 5, maxToolCalls: 5, maxRetries: 1, maxWallTimeMs: 5000 },
    planner: async () => ({ steps: [{ id: 1, description: "learnable success", doneWhen: "verified" }] }),
    executor: async () => "ok",
    verifier: async (step, result) => step.id === "final" ? { pass: result.length === 1 } : { pass: true }
  });
  const result = await agent.run("learn success", { sessionId: "learning-test", taskId: "learning-task" });
  assert.equal(result.success, true);
  assert.equal(memory.memories.length, 1);
  assert.ok(memory.memories[0].tags.includes("success-pattern"));

  const brokenMemory = { memories: [], store() { throw new Error("storage unavailable"); } };
  const bestEffort = new AutonomousOrchestrator({
    memoryLearning: new MemoryLearning({ memory: brokenMemory }),
    limits: { maxSteps: 5, maxToolCalls: 5, maxRetries: 1, maxWallTimeMs: 5000 },
    planner: async () => ({ steps: [{ id: 1, description: "must still succeed", doneWhen: "verified" }] }),
    executor: async () => "ok",
    verifier: async (step, value) => step.id === "final" ? { pass: value.length === 1 } : { pass: true }
  });
  const bestEffortResult = await bestEffort.run("learning storage failure");
  assert.equal(bestEffortResult.success, true);

  console.log("orchestrator memory learning tests: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
