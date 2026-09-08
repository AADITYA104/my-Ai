"use strict";

const assert = require("assert");
const { evaluateToolCall, isPathAllowed } = require("../agent-core/autonomy-policy");
const { ToolRegistry } = require("../agent-core/tool-registry");
const { createTask, transition, canContinue } = require("../agent-core/task-state-machine");
const { AgentLoopGuard } = require("../agent-loop-guard");

assert.equal(isPathAllowed("package.json", process.cwd()), true);
assert.equal(isPathAllowed("../outside.txt", process.cwd()), false);
assert.equal(evaluateToolCall("read_file", { file_path: "package.json" }, { root: process.cwd() }).allowed, true);
assert.equal(evaluateToolCall("run_command", { command: "rm -rf /" }, { root: process.cwd() }).allowed, false);
assert.equal(evaluateToolCall("unknown_tool", {}, {}).allowed, false);
assert.equal(evaluateToolCall("run_command", { command: "" }, { root: process.cwd() }).allowed, false);
assert.equal(evaluateToolCall("run_code", { code: "" }, { root: process.cwd() }).allowed, false);
assert.equal(evaluateToolCall("write_file", { file_path: "../escape.txt" }, { root: process.cwd() }).allowed, false);
assert.equal(evaluateToolCall("write_file", { file_path: ".env" }, { root: process.cwd() }).allowed, false);
assert.equal(evaluateToolCall("write_file", { file_path: "safe.txt" }, { root: process.cwd() }).allowed, true);
assert.equal(evaluateToolCall("run_command", { command: "echo ok" }, { root: process.cwd(), sideEffectClass: "financial_action" }).allowed, false);
assert.equal(evaluateToolCall("run_command", { command: "echo ok" }, { root: process.cwd(), sideEffectClass: "financial_action", autoApprove: true }).allowed, true);

const registry = new ToolRegistry();
registry.register({ name: "read_file", description: "test", execute: async () => "ok" });
assert.equal(registry.has("read_file"), true);

const guard = new AgentLoopGuard();
assert.equal(guard.checkAnomaly("read_file", { file_path: "package.json" }, { root: process.cwd() }).isLoop, false);
const denied = guard.checkAnomaly("run_command", { command: "rm -rf /" }, { root: process.cwd() });
assert.equal(denied.isLoop, true);
assert.equal(denied.type, "policy_denied");

(async () => {
  assert.equal(await registry.execute("read_file", {}, { root: process.cwd() }), "ok");
  const task = createTask("Build a feature");
  const planned = transition(task, "planning");
  const executing = transition(planned, "executing");
  assert.equal(canContinue(executing).ok, true);
  assert.throws(() => transition(task, "completed"), /Invalid task transition/);
  console.log("agent-core tests: PASS");
})().catch(err => { console.error(err); process.exit(1); });
