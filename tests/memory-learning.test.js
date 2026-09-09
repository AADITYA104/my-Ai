"use strict";

const assert = require("assert");
const { MemoryLearning, stableFingerprint } = require("../agent-core/memory-learning");

function makeMemory() {
  return {
    memories: [],
    store(topic, content, tags, category) {
      const id = `mem_${this.memories.length + 1}`;
      this.memories.push({ id, topic, content, tags, category });
      return id;
    },
    save() {}
  };
}

const memory = makeMemory();
const learner = new MemoryLearning({ memory });
const successSnapshot = {
  success: true,
  state: "completed",
  task: { id: "task-1", sessionId: "session-1", goal: "build the feature" },
  plan: { goal: "build the feature", steps: [{ id: 1 }] },
  results: [{ step: { id: 1, description: "write implementation", tool: "write_file" }, attempts: 1, verification: { pass: true }, result: "ok" }],
  reason: null,
  finalVerification: { pass: true }
};

const first = learner.learn(successSnapshot);
assert.equal(first.stored, true);
assert.equal(memory.memories.length, 1);
assert.ok(memory.memories[0].tags.includes("lesson"));
assert.ok(memory.memories[0].tags.includes("success-pattern"));
assert.equal(memory.memories[0].category, "task-learning");
assert.match(memory.memories[0].content, /fingerprint:/);

const duplicate = learner.learn(successSnapshot);
assert.equal(duplicate.stored, false);
assert.equal(duplicate.duplicate, true);
assert.equal(memory.memories.length, 1);

const failureSnapshot = {
  success: false,
  state: "failed",
  task: { id: "task-2", sessionId: "session-1", goal: "fix production" },
  plan: { goal: "fix production", steps: [{ id: 1 }] },
  results: [{ step: { id: 1, description: "run diagnostic", tool: "run_command" }, attempts: 2, verification: { pass: false }, result: { stdout: "diagnostic output", token: "SHOULD_NOT_LEAK" } }],
  reason: "verification failed: expected invariant was not met"
};
const failed = learner.learn(failureSnapshot);
assert.equal(failed.stored, true);
assert.equal(memory.memories.length, 2);
assert.ok(memory.memories[1].tags.includes("failure-pattern"));
assert.doesNotMatch(memory.memories[1].content, /SHOULD_NOT_LEAK/);

assert.equal(stableFingerprint(successSnapshot), stableFingerprint(successSnapshot));
assert.notEqual(stableFingerprint(successSnapshot), stableFingerprint(failureSnapshot));

const unavailable = new MemoryLearning();
assert.equal(unavailable.learn(successSnapshot).stored, false);

console.log("memory learning tests: PASS");
