"use strict";

const assert = require("assert");
const { mergeToolInput } = require("../agent-core/jarvis-agent");

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

console.log("jarvis agent adapter tests: PASS");
