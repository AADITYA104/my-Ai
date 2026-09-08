/**
 * Capability-based code runner.
 *
 * IMPORTANT: Worker Threads are an isolation/concurrency primitive, not a
 * security boundary. Untrusted code must never be treated as safe merely
 * because it runs in this worker. The runner therefore exposes only a small
 * capability object and rejects attempts to access Node host capabilities.
 * A production deployment handling hostile code should additionally run this
 * component in a separately sandboxed process/container with OS restrictions.
 */
"use strict";

const { Worker } = require("worker_threads");

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 60000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

const DEFAULT_CAPABILITIES = Object.freeze({
  readFile: async () => ({ success: false, error: "readFile capability is not configured" }),
  writeFile: async () => ({ success: false, error: "writeFile capability is not configured" }),
  runCommand: async () => ({ success: false, error: "runCommand capability is not configured" }),
  listDirectory: async () => ({ success: false, error: "listDirectory capability is not configured" })
});

const FORBIDDEN_SOURCE = [
  /\brequire\s*\(/,
  /\bprocess\b/,
  /\bglobalThis\b/,
  /\bglobal\b/,
  /\bmodule\b/,
  /\bexports\b/,
  /\b__dirname\b/,
  /\b__filename\b/,
  /\bchild_process\b/,
  /\bworker_threads\b/,
  /\bnode:fs\b/,
  /\bnode:path\b/,
  /\bfrom\s+['"]fs['"]/, 
  /\bfrom\s+['"]path['"]/, 
  /\bfrom\s+['"]child_process['"]/, 
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\.constructor\s*\(/,
  /\bconstructor\s*\[\s*['"]constructor['"]\s*\]/
];

function validateSource(code) {
  if (typeof code !== "string" || !code.trim()) return { allowed: false, reason: "No executable code supplied." };
  for (const pattern of FORBIDDEN_SOURCE) {
    if (pattern.test(code)) return { allowed: false, reason: `Sandbox source rejected by capability policy: ${pattern}` };
  }
  return { allowed: true };
}

function makeWorkerCode() {
  return `
const { parentPort, workerData } = require("worker_threads");
const logs = [];
const safeConsole = Object.freeze({
  log: (...args) => logs.push(args.map(String).join(" ")),
  info: (...args) => logs.push("[INFO] " + args.map(String).join(" ")),
  warn: (...args) => logs.push("[WARN] " + args.map(String).join(" ")),
  error: (...args) => logs.push("[ERROR] " + args.map(String).join(" "))
});
const pending = new Map();
let nextRequestId = 1;
function callCapability(name, args) {
  return new Promise((resolve) => {
    const id = nextRequestId++;
    pending.set(id, resolve);
    parentPort.postMessage({ type: "capability", id, name, args });
  });
}
const tools = Object.freeze({
  readFile: (...args) => callCapability("readFile", args),
  writeFile: (...args) => callCapability("writeFile", args),
  runCommand: (...args) => callCapability("runCommand", args),
  listDirectory: (...args) => callCapability("listDirectory", args)
});
parentPort.on("message", (message) => {
  if (message && message.type === "capability_result") {
    const resolve = pending.get(message.id);
    if (resolve) { pending.delete(message.id); resolve(message.value); }
  }
});
(async () => {
  try {
    const run = new Function("tools", "console", "return (async () => {\\n" + workerData.code + "\\n})();");
    const result = await run(tools, safeConsole);
    parentPort.postMessage({ type: "result", success: true, result: result === undefined ? null : result, logs: logs.join("\\n") });
  } catch (error) {
    parentPort.postMessage({ type: "result", success: false, error: error.stack || error.message, logs: logs.join("\\n") });
  }
})();
`;
}

async function runSandboxedCode(code, options = {}) {
  const validation = validateSource(code);
  if (!validation.allowed) return { success: false, error: validation.reason, logs: "", durationMs: 0 };
  const timeoutMs = Math.min(Math.max(options.timeoutMs || DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS);
  const maxHeapMb = Math.min(Math.max(options.maxHeapMb || 256, 64), 512);
  const capabilities = { ...DEFAULT_CAPABILITIES, ...(options.capabilities || {}) };
  const startTime = Date.now();
  return new Promise((resolve) => {
    let finished = false;
    const worker = new Worker(makeWorkerCode(), {
      eval: true,
      workerData: { code },
      resourceLimits: { maxOldGenerationSizeMb: maxHeapMb, maxYoungGenerationSizeMb: 64 }
    });
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      resolve({ ...result, durationMs: Date.now() - startTime });
    };
    const timer = setTimeout(() => finish({
      success: false,
      error: `Execution timed out after ${timeoutMs}ms`,
      logs: `[TIMEOUT]: Worker exceeded ${timeoutMs}ms and was terminated.`
    }), timeoutMs);
    worker.on("message", async (message) => {
      if (finished) return;
      if (message?.type === "result") {
        finish({ success: message.success, result: message.result, error: message.error, logs: truncateOutput(message.logs || "") });
        return;
      }
      if (message?.type === "capability") {
        const capability = capabilities[message.name];
        if (typeof capability !== "function") {
          worker.postMessage({ type: "capability_result", id: message.id, value: { success: false, error: `Capability denied: ${message.name}` } });
          return;
        }
        try {
          const value = await capability(...(Array.isArray(message.args) ? message.args : []));
          worker.postMessage({ type: "capability_result", id: message.id, value });
        } catch (error) {
          worker.postMessage({ type: "capability_result", id: message.id, value: { success: false, error: error.message } });
        }
      }
    });
    worker.on("error", (error) => finish({ success: false, error: error.message, logs: `[WORKER ERROR]: ${error.stack || error.message}` }));
    worker.on("exit", (code) => {
      if (!finished && code !== 0) finish({ success: false, error: `Worker exited with non-zero code: ${code}`, logs: "" });
    });
  });
}

function truncateOutput(value) {
  const text = String(value || "");
  return Buffer.byteLength(text, "utf8") <= MAX_OUTPUT_BYTES ? text : text.slice(0, MAX_OUTPUT_BYTES) + "\n[OUTPUT TRUNCATED]";
}

module.exports = { runSandboxedCode, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, validateSource };
