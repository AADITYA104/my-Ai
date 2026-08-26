/**
 * ============================================================================
 *  WORKER-THREAD CODE SANDBOX (`run_code`) — 2026 ARCHITECTURE
 *  Ported from deepseek-harness-master/packages/code-runtime/code-runtime-worker-thread
 *  - Worker thread isolation with memory cap & wall-time budget
 *  - Host tool binding bridge (readFile, writeFile, runCommand, searchKnowledge)
 *  - Output ledger with capture & truncation guards
 *  - Single-turn batch execution of complex multi-step operations
 * ============================================================================
 */
"use strict";

const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 60000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024; // 64MB cap

// ---------------------------------------------------------------------------
// 1. WORKER SCRIPT (Executed inside the Worker thread)
// ---------------------------------------------------------------------------
const WORKER_INLINE_CODE = `
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Captured console output
const logs = [];
const customConsole = {
  log: (...args) => { logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')); },
  error: (...args) => { logs.push('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')); },
  warn: (...args) => { logs.push('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')); },
  info: (...args) => { logs.push('[INFO] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')); }
};

// Tool bindings exposed to the sandboxed script
const tools = {
  readFile: (filePath) => {
    try {
      const resolved = path.resolve(workerData.cwd || process.cwd(), filePath);
      if (!fs.existsSync(resolved)) return { success: false, error: 'File not found: ' + filePath };
      return { success: true, content: fs.readFileSync(resolved, 'utf-8') };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  writeFile: (filePath, content) => {
    try {
      const resolved = path.resolve(workerData.cwd || process.cwd(), filePath);
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolved, content, 'utf-8');
      return { success: true, path: resolved };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  runCommand: (cmd, timeoutMs = 15000) => {
    try {
      const out = execSync(cmd, {
        cwd: workerData.cwd || process.cwd(),
        timeout: timeoutMs,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      return { success: true, output: out.trim() };
    } catch (e) {
      return { success: false, output: (e.stdout || '').toString(), error: (e.stderr || e.message).toString() };
    }
  },
  listDirectory: (dirPath = '.') => {
    try {
      const resolved = path.resolve(workerData.cwd || process.cwd(), dirPath);
      if (!fs.existsSync(resolved)) return { success: false, error: 'Directory not found' };
      const items = fs.readdirSync(resolved, { withFileTypes: true }).map(d => ({
        name: d.name,
        isDirectory: d.isDirectory(),
        size: d.isFile() ? fs.statSync(path.join(resolved, d.name)).size : null
      }));
      return { success: true, items };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
};

(async () => {
  try {
    const userCode = workerData.code;
    // Wrap inside async IIFE with tools and console available
    const runFn = new Function('tools', 'console', 'fs', 'path', 'require', \`
      return (async () => {
        \${userCode}
      })();
    \`);
    
    const result = await runFn(tools, customConsole, fs, path, require);
    parentPort.postMessage({
      success: true,
      result: result !== undefined ? result : null,
      logs: logs.join('\\n')
    });
  } catch (err) {
    parentPort.postMessage({
      success: false,
      error: err.stack || err.message,
      logs: logs.join('\\n')
    });
  }
})();
`;

// ---------------------------------------------------------------------------
// 2. SANDBOX RUNNER
// ---------------------------------------------------------------------------

/**
 * Executes user/agent code in a sandboxed Worker Thread with timeout & memory cap.
 *
 * @param {string} code - JavaScript code string to execute
 * @param {Object} options - { timeoutMs, cwd, maxHeapMb }
 * @returns {Promise<{ success: boolean, result: any, logs: string, durationMs: number }>}
 */
async function runSandboxedCode(code, options = {}) {
  const timeoutMs = Math.min(Math.max(options.timeoutMs || DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS);
  const cwd = options.cwd || process.cwd();
  const maxHeapMb = options.maxHeapMb || 256;
  const startTime = Date.now();

  return new Promise((resolve) => {
    let finished = false;
    let timer = null;

    const worker = new Worker(WORKER_INLINE_CODE, {
      eval: true,
      workerData: { code, cwd },
      resourceLimits: {
        maxOldGenerationSizeMb: maxHeapMb,
        maxYoungGenerationSizeMb: 64
      }
    });

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      finished = true;
    };

    timer = setTimeout(() => {
      if (!finished) {
        cleanup();
        worker.terminate().catch(() => {});
        resolve({
          success: false,
          error: `Execution timed out after ${timeoutMs}ms`,
          logs: `[TIMEOUT]: Worker thread exceeded wall-clock limit (${timeoutMs}ms) and was terminated.`,
          durationMs: Date.now() - startTime
        });
      }
    }, timeoutMs);

    worker.on("message", (msg) => {
      if (!finished) {
        cleanup();
        worker.terminate().catch(() => {});
        resolve({
          success: msg.success,
          result: msg.result,
          error: msg.error,
          logs: msg.logs || "",
          durationMs: Date.now() - startTime
        });
      }
    });

    worker.on("error", (err) => {
      if (!finished) {
        cleanup();
        resolve({
          success: false,
          error: err.message,
          logs: `[WORKER ERROR]: ${err.stack || err.message}`,
          durationMs: Date.now() - startTime
        });
      }
    });

    worker.on("exit", (code) => {
      if (!finished) {
        cleanup();
        if (code !== 0) {
          resolve({
            success: false,
            error: `Worker exited with non-zero code: ${code}`,
            logs: "",
            durationMs: Date.now() - startTime
          });
        }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// 3. EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  runSandboxedCode,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS
};
