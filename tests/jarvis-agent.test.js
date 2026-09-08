"use strict";

const assert = require("assert");
const adapter = require("../agent-core/jarvis-agent");
const { mergeToolInput, runJarvisAgent } = adapter;

assert.equal(typeof adapter.runJarvisAgent, "function");
assert.equal(typeof adapter.mergeToolInput, "function");

const base = { file_path: "safe.txt", content: "before", unchanged: true };
const patched = mergeToolInput(base, { toolInputPatch: { content: "after" } });

assert.deepEqual(patched, {
  file_path: "safe.txt",
  content: "after",
  unchanged: true
});
assert.deepEqual(base, {
  file_path: "safe.txt",
  content: "before",
  unchanged: true
});
assert.deepEqual(mergeToolInput(base, null), base);
assert.deepEqual(mergeToolInput(base, { toolInputPatch: [] }), base);

(async () => {
  let registryCalls = 0;
  const registry = {
    async execute(name, input) {
      registryCalls++;
      assert.equal(name, "test_tool");
      assert.deepEqual(input, { value: "from-plan" });
      return "registry-result";
    }
  };

  const result = await runJarvisAgent("registry routing", {
    registry,
    planner: async () => ({
      steps: [{
        id: 1,
        description: "use registry",
        doneWhen: "result returned",
        tool: "test_tool",
        input: { value: "from-plan" }
      }]
    }),
    verifier: async () => ({ pass: true, reason: "verified" })
  });

  assert.equal(result.success, true);
  assert.equal(result.state, "completed");
  assert.equal(registryCalls, 1);
  assert.equal(result.results[0].result, "registry-result");

  await assert.rejects(
    runJarvisAgent("registry is mandatory", {
      planner: async () => ({
        steps: [{
          id: 1,
          description: "attempt governed tool",
          doneWhen: "tool executes",
          tool: "test_tool",
          input: {}
        }]
      }),
      verifier: async () => ({ pass: true })
    }),
    error => error.code === "REGISTRY_REQUIRED"
  );

  console.log("jarvis agent adapter tests: PASS");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
