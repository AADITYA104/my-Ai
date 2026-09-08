"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { TaskStore, safeKey } = require("../agent-core/task-store");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-task-store-"));
try {
  const store = new TaskStore({ root });
  const task = {
    id: "task-1",
    goal: "isolation test",
    state: "executing",
    step: 2,
    toolCalls: 1,
    history: [{ state: "queued", at: new Date().toISOString() }]
  };

  store.save(task, "session-a", {
    plan: { steps: [{ id: 1, description: "one" }] },
    results: [{ step: 1, result: "ok" }]
  });

  const restored = store.load("task-1", "session-a");
  assert.deepStrictEqual(restored.task, task);
  assert.deepStrictEqual(restored.plan.steps[0].description, "one");
  assert.deepStrictEqual(restored.results[0].result, "ok");
  assert.deepStrictEqual(restored.operations, {});
  assert.strictEqual(store.load("task-1", "session-b"), null);
  assert.notStrictEqual(safeKey("session-a"), safeKey("session-b"));

  const operationId = "operation-1";
  const claimed = store.claimOperation("task-1", "session-a", operationId, { executionId: "exec-1" });
  assert.strictEqual(claimed.state, "started");
  assert.strictEqual(claimed.executionId, "exec-1");

  const duplicateClaim = store.claimOperation("task-1", "session-a", operationId, { executionId: "exec-2" });
  assert.deepStrictEqual(duplicateClaim, claimed);

  const completed = store.completeOperation("task-1", "session-a", operationId, { sideEffect: "created-once" });
  assert.strictEqual(completed.state, "completed");
  assert.strictEqual(completed.executionId, "exec-1");
  assert.deepStrictEqual(completed.result, { sideEffect: "created-once" });

  const duplicateCompletion = store.completeOperation("task-1", "session-a", operationId, { sideEffect: "should-not-overwrite" });
  assert.deepStrictEqual(duplicateCompletion, completed);

  const restoredWithOperation = store.load("task-1", "session-a");
  assert.strictEqual(restoredWithOperation.operations[operationId].state, "completed");
  assert.deepStrictEqual(restoredWithOperation.operations[operationId].result, { sideEffect: "created-once" });

  const target = store.pathFor("task-1", "session-a");
  assert.ok(fs.existsSync(target));
  assert.strictEqual(fs.statSync(target).mode & 0o777, 0o600);

  store.remove("task-1", "session-a");
  assert.strictEqual(store.load("task-1", "session-a"), null);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("task store tests: PASS");
