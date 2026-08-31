/**
 * ============================================================================
 *  AUTONOMOUS LOOP AGENT - v7: UNIVERSAL FREE MULTI-PROVIDER EDITION (2026)
 *  - Unified Single Source of Truth (task-state.json).
 *  - Post-Action File Read-Back & Integrity Verification.
 *  - Explicit Error Context Injection & N-Gram Loop Detection.
 *  - Workspace Mutex (.workspace.lock) Cross-Process Lock.
 *  - Per-Task Token/Cost Ledger & Step Latency Profiling.
 * ============================================================================
 */
"use strict";

const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");
const { execSync, spawnSync } = require("child_process");
const readline = require("readline");

// Multi-Provider LLM layer
const { callUniversalLLM, callGemini, callOllama, detectProvider } = require("./llm-providers");
const watchdog = require("./self-healing-watchdog");

// Self-learning loop (RETRIEVE -> JUDGE -> DISTILL -> CONSOLIDATE)
let intelligenceLoop = { learnFromOutcome: () => {} };
try { intelligenceLoop = require("./intelligence-loop"); } catch (_) {}

// AI Defence (prompt-injection / PII / loader-hijack guards)
let aidefence = { scanCommandForEnvHijack: () => ({ safe: true, violations: [] }) };
try { aidefence = require("./ai-defence"); } catch (_) {}

// Ruflo MCP bridge — real ruflo tools (agent/swarm/memory/hooks), optional
let rufloBridge = { isConfigured: () => false, listTools: async () => [], callTool: async () => { throw new Error("not configured"); } };
try { rufloBridge = require("./ruflo-bridge"); } catch (_) {}

// Generic multi-MCP bridge — auto-registers bundled servers (sequentialthinking, memory, ponytail)
let mcpBridge = { isConfigured: () => false, callTool: async () => { throw new Error("not configured"); } };
try { mcpBridge = require("./mcp-bridge"); } catch (_) {}

// [9/10] Tool-call rate limiter — protects against runaway tool-calling loops
const { ToolRateLimiter } = require("./tool-rate-limiter");
const toolRateLimiter = new ToolRateLimiter({ perToolCapacity: 15, perToolRefillPerSecond: 1, globalCapacity: 40, globalRefillPerSecond: 3 });

// [7/10] Tool argument schema validator — set up after TOOL_DEFINITIONS below

// Corrective RAG — grades retrieved memory relevance before trusting it
let correctiveRag = { gradeRelevance: async () => ({ verdict: "sufficient", guidance: "" }) };
let ragModule = { search: () => [] };
try {
  correctiveRag = require("./corrective-rag");
  ragModule = require("./rag-memory");
} catch (_) {}

// Scope creep detector — flags file writes that stray beyond task intent
let scopeGuard = { checkScope: () => ({ inScope: true, flags: [] }) };
try { scopeGuard = require("./scope-guard"); } catch (_) {}
let currentTaskIntent = ""; // set at the top of each subtask, read by executeTool's write_file case
let currentMatchedSkillTitle = null; // set at the top of each subtask, read by skill-improvement tracking

// Skill improvement tracker — records whether a matched skill correlated with success
let skillImprovement = { recordSkillOutcome: () => {} };
try { skillImprovement = require("./skill-improvement"); } catch (_) {}

// Optional RAG module
let buildRagContext = async () => "";
let rememberConversationTurn = async () => {};
try {
  const rag = require("./rag-memory");
  buildRagContext = rag.buildRagContext;
  rememberConversationTurn = rag.rememberConversationTurn;
} catch (_) {}

// ---------------------------------------------------------------------------
// CONFIG & PATHS
// ---------------------------------------------------------------------------
const MEMORY_DIR        = path.join(__dirname, "agent-memory");
const SKILLS_DIR        = path.join(MEMORY_DIR, "skills");
const USAGE_FILE        = path.join(MEMORY_DIR, "skill-usage.json");
const LEARNINGS_FILE    = path.join(MEMORY_DIR, "learnings.jsonl");
const METRICS_FILE      = path.join(MEMORY_DIR, "task_metrics.jsonl");
const TASK_STATE_FILE   = path.join(MEMORY_DIR, "task-state.json");
const WORKSPACE_LOCK    = path.join(MEMORY_DIR, ".workspace.lock");

const _rawFD     = process.env.FREEZE_DIR ? path.resolve(process.env.FREEZE_DIR) : null;
const FREEZE_DIR = _rawFD ? (_rawFD.endsWith(path.sep) ? _rawFD : _rawFD + path.sep) : null;

const CONFIG = {
  MAX_OUTER_ITERATIONS  : 15,
  MAX_SUBTASK_RETRIES   : 3,
  MAX_ACTOR_TOOL_STEPS  : 8,
  MAX_TOKENS_TOTAL      : 150000,
  NO_PROGRESS_LIMIT     : 2,
  THREE_STRIKE_THRESHOLD: 3,
};

let tokensUsedSoFar  = 0;
// [CONTEXT BUDGET] Proactive per-goal token tracking with early warnings
// (70%/90% of MAX_TOKENS_TOTAL) — complements the existing hard cutoff at
// 100% by surfacing the drift before it becomes a forced stop.
const { ContextBudget } = require("./context-budget");
let goalContextBudget = new ContextBudget(CONFIG.MAX_TOKENS_TOTAL);
let noProgressStreak = 0;

// Per-session canary token
const SESSION_CANARY = "CANARY-" + crypto.randomBytes(8).toString("hex");

// ===========================================================================
// [1] ATOMIC FILE WRITES & MUTEX LOCKS
// ===========================================================================
function atomicWriteSync(target, data) {
  const tmp = target + ".tmp." + process.pid + "." + crypto.randomBytes(4).toString("hex");
  try {
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw err;
  }
}
function atomicWriteJSON(filePath, obj) {
  atomicWriteSync(filePath, JSON.stringify(obj, null, 2));
}
function atomicAppendLine(filePath, line) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
  atomicWriteSync(filePath, existing + line + "\n");
}

function acquireWorkspaceLock(goal) {
  if (fs.existsSync(WORKSPACE_LOCK)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(WORKSPACE_LOCK, "utf-8"));
      // 1 hour expiry
      if (Date.now() - lockData.timestamp < 3600000) {
        console.warn(`🔒 [WORKSPACE LOCK] Another task is executing: '${lockData.goal}' (PID: ${lockData.pid})`);
        return false;
      }
    } catch (_) {}
  }
  try {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    fs.writeFileSync(WORKSPACE_LOCK, JSON.stringify({ goal, pid: process.pid, timestamp: Date.now() }));
    return true;
  } catch (_) {
    return false;
  }
}

function releaseWorkspaceLock() {
  try {
    if (fs.existsSync(WORKSPACE_LOCK)) fs.unlinkSync(WORKSPACE_LOCK);
  } catch (_) {}
}

// ===========================================================================
// [2] UNICODE CLEANUP & SECRETS REDACTION
// ===========================================================================
function stripSurrogates(text) {
  if (typeof text !== "string") return text;
  return text.replace(/[\uD800-\uDFFF]/g, "\uFFFD");
}

const REDACT_PATTERNS = [
  { id: "aws.key",      re: /(?<![A-Z0-9])(AKIA|ASIA|AROA)[A-Z0-9]{16}(?![A-Z0-9])/g, label: "AWS Access Key" },
  { id: "pem.private",  re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g,        label: "Private Key" },
  { id: "gh.token",     re: /ghp_[A-Za-z0-9]{36}/g,                                    label: "GitHub PAT" },
  { id: "sk.openai",    re: /sk-[A-Za-z0-9]{48}/g,                                     label: "OpenAI Key" },
  { id: "pii.email",    re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, label: "Email" },
  { id: "net.ip",       re: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, label: "IP Address" },
];

function redactSecrets(text) {
  if (!text || typeof text !== "string") return { redacted: text, findings: [] };
  let result = text;
  const findings = [];
  for (const { id, re, label } of REDACT_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      findings.push({ id, label, match: match[0] });
    }
    result = result.replace(re, `[REDACTED: ${label}]`);
  }
  return { redacted: result, findings };
}

function checkCanaryLeak(text) {
  if (typeof text === "string" && text.includes(SESSION_CANARY)) {
    console.error("\n🚨 [SECURITY BREACH] Canary leak detected! Halting execution immediately.");
    process.exit(1);
  }
}

// ===========================================================================
// [3] UNIFIED TASK STATE (Single Source of Truth)
// ===========================================================================
function ensureDirs() {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

function readTaskState() {
  if (!fs.existsSync(TASK_STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(TASK_STATE_FILE, "utf-8"));
  } catch (_) {
    return null;
  }
}

function writeTaskState(state) {
  ensureDirs();
  atomicWriteJSON(TASK_STATE_FILE, {
    ...state,
    lastUpdated: Date.now()
  });
}

function isWithinFreezeDir(targetPath) {
  if (!FREEZE_DIR) return true;
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(FREEZE_DIR);
}

function checkCommandSafety(command) {
  if (watchdog.isDestructiveCommand(command)) {
    return { warn: true, reason: "Command matched dangerous system pattern in deny-matrix." };
  }
  const envCheck = aidefence.scanCommandForEnvHijack(command);
  if (!envCheck.safe) {
    return { warn: true, reason: `Command tries to set restricted env var(s): ${envCheck.violations.join(", ")} (loader-hijack risk).` };
  }
  return { warn: false, reason: "Safe command" };
}

async function askHumanConfirmation(question) {
  if (process.env.NON_INTERACTIVE === "true") return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`\n⚠️ [CONFIRMATION REQUIRED]: ${question} (y/N): `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// ===========================================================================
// [4] LLM INVOCATION & METRIC LOGGING
// ===========================================================================
async function callLLM(messages, system) {
  const t0 = Date.now();
  const res = await callUniversalLLM(messages, system);
  const duration = Date.now() - t0;
  const usage = res.usage || {};
  const total = (usage.input_tokens || 0) + (usage.output_tokens || 0);
  tokensUsedSoFar += total;
  goalContextBudget.record("callLLM", total);
  const textBlock = (res.content || []).find(b => b.type === "text");
  return { text: textBlock ? textBlock.text : "", duration, usage };
}

async function callLLMWithTools(messages, system, tools) {
  const t0 = Date.now();
  const res = await callUniversalLLM(messages, system, tools);
  const duration = Date.now() - t0;
  const usage = res.usage || {};
  const total = (usage.input_tokens || 0) + (usage.output_tokens || 0);
  tokensUsedSoFar += total;
  const budgetStatus = goalContextBudget.record("callLLMWithTools", total);
  if (budgetStatus.level === "warning" || budgetStatus.level === "critical") {
    console.log(`  [CONTEXT BUDGET] ${budgetStatus.level}: ${budgetStatus.pct}% used — ${budgetStatus.guidance}`);
  }
  return { ...res, duration };
}

function calculateTaskCost(totalTokens) {
  const inputEst = Math.round(totalTokens * 0.7);
  const outputEst = totalTokens - inputEst;

  const pricingTable = {
    "ollama": { inputPerM: 0.0, outputPerM: 0.0, label: "Local Ollama (Free)" },
    "local": { inputPerM: 0.0, outputPerM: 0.0, label: "Local Engine (Free)" },
    "gemini-flash": { inputPerM: 0.075, outputPerM: 0.30, label: "Gemini 2.5/3.5 Flash" },
    "gemini-pro": { inputPerM: 1.25, outputPerM: 5.00, label: "Gemini Pro" },
    "claude-sonnet": { inputPerM: 3.00, outputPerM: 15.00, label: "Claude Sonnet" },
    "gpt-4o": { inputPerM: 2.50, outputPerM: 10.00, label: "OpenAI GPT-4o" }
  };

  const isOffline = process.env.FORCE_OFFLINE === "true" || !process.env.GEMINI_API_KEY;
  const providerKey = isOffline ? "ollama" : (process.env.DEFAULT_LLM_PROVIDER || "gemini-flash");
  const rates = pricingTable[providerKey] || pricingTable["gemini-flash"];

  const cost = ((inputEst * rates.inputPerM + outputEst * rates.outputPerM) / 1000000).toFixed(6);
  return {
    costUsd: `$${cost}`,
    provider: rates.label || providerKey
  };
}

function logTaskMetrics(goal, totalTokens, durationMs, success) {
  ensureDirs();
  const { costUsd, provider } = calculateTaskCost(totalTokens);

  const entry = {
    goal,
    timestamp: new Date().toISOString(),
    success,
    totalTokens,
    estimatedCostUsd: costUsd,
    provider,
    durationMs
  };
  atomicAppendLine(METRICS_FILE, JSON.stringify(entry));
}

// ===========================================================================
// [5] MEMORY & LEARNINGS HELPERS
// ===========================================================================
function readMemory() {
  const p = path.join(MEMORY_DIR, "memory.md");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
}
function appendMemory(note) {
  ensureDirs();
  const p = path.join(MEMORY_DIR, "memory.md");
  atomicAppendLine(p, `[${new Date().toISOString()}] ${note}`);
}
function appendLearning(category, id, note) {
  ensureDirs();
  atomicAppendLine(LEARNINGS_FILE, JSON.stringify({ category, id, note, timestamp: Date.now() }));
}
function buildLearningsContext() {
  if (!fs.existsSync(LEARNINGS_FILE)) return "";
  try {
    const lines = fs.readFileSync(LEARNINGS_FILE, "utf-8").trim().split("\n").filter(Boolean);
    const recent = lines.slice(-5).map(l => {
      const obj = JSON.parse(l);
      return `- [${obj.category}] ${obj.note}`;
    });
    return recent.length > 0 ? "\nRecent Learnings:\n" + recent.join("\n") + "\n" : "";
  } catch (_) { return ""; }
}

// ===========================================================================
// [6] SKILLS & AGENTDB
// ===========================================================================
function listSkills() {
  ensureDirs();
  return fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith(".md")).map(f => {
    const content = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
    const titleMatch = content.match(/^#\s*(.+)/m);
    const title = titleMatch ? titleMatch[1] : f;
    const whenMatch = content.match(/## When to use\s*\n(.+)/);
    const whenToUse = whenMatch ? whenMatch[1] : "";
    const refFiles = Array.from(content.matchAll(/`([^`]+\.[a-z]{1,5})`/g)).map(m => m[1]);
    const isStale = refFiles.some(rf => rf.startsWith("./") && !fs.existsSync(path.resolve(__dirname, rf)));
    return { file: f, title, whenToUse, content, isStale };
  });
}
function recordSkillUsage(skillFile) {
  ensureDirs();
  const usage = fs.existsSync(USAGE_FILE) ? JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8")) : {};
  if (!usage[skillFile]) usage[skillFile] = { count: 0, lastUsed: null };
  usage[skillFile].count++;
  usage[skillFile].lastUsed = new Date().toISOString();
  atomicWriteJSON(USAGE_FILE, usage);
}
async function findRelevantSkill(taskDescription) {
  const skills = listSkills();
  if (skills.length === 0) return null;
  const index = skills.map((s, i) => `${i+1}. ${s.title} (${s.isStale ? "STALE" : "fresh"}) - when: ${s.whenToUse}`).join("\n");
  const res = await callLLM(
    [{ role: "user", content: `Task: ${taskDescription}\n\nSkills:\n${index}` }],
    "Reply with ONLY the number of the most relevant skill, or 0 if none apply. Prefer fresh over stale."
  );
  const num = parseInt(res.text.trim(), 10);
  if (num >= 1 && num <= skills.length) {
    const matched = skills[num - 1];
    recordSkillUsage(matched.file);
    if (matched.isStale) console.log(`  [SKILL WARN] ${matched.title} is STALE`);
    return matched;
  }
  return null;
}
async function saveSkill(subtask, successfulApproach) {
  const system = "Distill this into a concise reusable skill. Format EXACTLY:\n# <short title>\n## When to use\n<one line summary>\n## Steps\n<numbered actionable steps>\n## Gotchas\n<pitfalls or \"None noted\">";
  const res = await callLLM([{ role: "user", content: `Task: ${subtask.description}\nApproach: ${successfulApproach}` }], system);
  ensureDirs();
  const titleMatch = res.text.match(/^#\s*(.+)/m);
  const slug = (titleMatch ? titleMatch[1] : `skill-${Date.now()}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
  const filePath = path.join(SKILLS_DIR, `${slug}.md`);
  if (fs.existsSync(filePath)) { appendMemory(`Reinforced skill "${slug}".`); return; }
  atomicWriteSync(filePath, res.text);
  appendMemory(`Learned new skill: "${slug}".`);
  appendLearning("decide", `skill:${slug}`, `Learned skill "${slug}" from: ${subtask.description.slice(0, 80)}`);
  console.log(`  [SKILL SAVED] ${slug}.md`);
}

// ===========================================================================
// [7] TOOL DEFINITIONS & EXECUTION WITH POST-ACTION INTEGRITY CHECK
// ===========================================================================
const TOOL_DEFINITIONS = [
  { name: "write_file",    description: "Writes text content to a file with pre-edit checkpointing and post-write verification.",
    input_schema: { type: "object", properties: { filePath: { type: "string" }, content: { type: "string" } }, required: ["filePath","content"] } },
  { name: "read_file",     description: "Reads text content of a file.",
    input_schema: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] } },
  { name: "terminal_exec", description: "Runs a shell command guarded by safety deny-matrix.",
    input_schema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
  { name: "code_exec",     description: "Executes JavaScript or Python code in sandbox.",
    input_schema: { type: "object", properties: { language: { type: "string", enum: ["javascript","python"] }, code: { type: "string" } }, required: ["language","code"] } },
  { name: "calculator",    description: "Evaluates an arithmetic expression.",
    input_schema: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } },
  { name: "ruflo_tool",    description: "Calls a real ruflo MCP tool (333 available: agent_spawn, swarm_init, memory_store/search with real vector search, hooks_intelligence_*, config_*, etc.) — only works once RUFLO_MCP_PATH is set in .env pointing at a built ruflo v3/@claude-flow/cli/bin/mcp-server.js. Use ruflo_tool with tool_name='tools_list' (no args) first to see what's available.",
    input_schema: { type: "object", properties: { tool_name: { type: "string" }, args: { type: "object" } }, required: ["tool_name"] } },
  { name: "parallel_research", description: "Research multiple independent questions/topics concurrently instead of one at a time — use when a task has 2+ genuinely independent sub-questions to investigate (e.g. comparing options, gathering several unrelated facts).",
    input_schema: { type: "object", properties: { topics: { type: "array" } }, required: ["topics"] } },
  { name: "sequential_thinking", description: "Use for genuinely hard, multi-step problems where you need to reason step-by-step, revise earlier thoughts, or branch into alternative approaches before committing to an answer — NOT for simple/obvious tasks. Call repeatedly, one thought at a time, incrementing thoughtNumber, until nextThoughtNeeded is false.",
    input_schema: { type: "object", properties: {
      thought: { type: "string" }, thoughtNumber: { type: "number" }, totalThoughts: { type: "number" },
      nextThoughtNeeded: { type: "boolean" }, isRevision: { type: "boolean" }, revisesThought: { type: "number" },
      branchFromThought: { type: "number" }, branchId: { type: "string" }
    }, required: ["thought", "thoughtNumber", "totalThoughts", "nextThoughtNeeded"] } },
  { name: "hierarchical_crew", description: "Delegate a substantial, multi-faceted mission to a manager-led team (architect/researcher/coder/auditor) that dynamically decides the right order of steps based on progress — use for genuinely complex build/design missions, not simple single-step tasks.",
    input_schema: { type: "object", properties: { mission: { type: "string" }, maxSteps: { type: "number" } }, required: ["mission"] } },
  { name: "debate_group_chat", description: "Run a multi-turn conversation among architect/researcher/coder/auditor specialists who respond to EACH OTHER (not a fixed handoff) — best for genuinely contentious design decisions, tradeoff debates, or getting a design critiqued from multiple angles before committing. The auditor ends the discussion once satisfied.",
    input_schema: { type: "object", properties: { topic: { type: "string" }, maxTurns: { type: "number" } }, required: ["topic"] } },
  { name: "browser_open", description: "Open a browser session at a URL and return a numbered list of interactive elements (links, buttons, inputs) on the page. Use this instead of writing CSS selectors — act on elements by their number via browser_act.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
  { name: "browser_act", description: "Click, fill, or select a numbered element from the last browser_open/browser_act result (action: \"click\"|\"fill\"|\"select\"; for \"select\", value must be one of that element's listed options). Returns the refreshed element list after the action. Requires an open session (call browser_open first).",
    input_schema: { type: "object", properties: { index: { type: "number" }, action: { type: "string" }, value: { type: "string" } }, required: ["index", "action"] } },
  { name: "browser_scroll", description: "Scroll the current page up or down to reveal more content — many pages hide elements below the fold that won't appear in browser_open's initial element list until you scroll.",
    input_schema: { type: "object", properties: { direction: { type: "string" }, amount: { type: "number" } } } },
  { name: "browser_back", description: "Navigate back to the previous page in the current browser session's history.",
    input_schema: { type: "object", properties: {} } },
  { name: "browser_keys", description: "Send a keyboard key/shortcut to the page (e.g. \"Escape\" to dismiss a popup, \"Enter\" to submit, \"Control+A\" to select all) — for interactions click/fill can't express.",
    input_schema: { type: "object", properties: { keys: { type: "string" } }, required: ["keys"] } },
  { name: "browser_extract", description: "Extract the visible text content of the current page (or a specific CSS selector within it) for reading/summarizing — separate from the interactive-element list, which is for acting on elements not reading content.",
    input_schema: { type: "object", properties: { selector: { type: "string" } } } },
  { name: "browser_find_text", description: "Scroll directly to a piece of text on the page instead of scrolling blindly. Returns the refreshed element list once scrolled into view.",
    input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
  { name: "browser_screenshot", description: "Take a screenshot of the current page and save it to disk. Use for visual verification (layout, charts, a CAPTCHA) that the text-based element list can't capture.",
    input_schema: { type: "object", properties: { fileName: { type: "string" } } } },
  { name: "browser_save_pdf", description: "Save the current page as a PDF file. Only works in headless Chromium.",
    input_schema: { type: "object", properties: { fileName: { type: "string" } } } },
  { name: "browser_list_tabs", description: "List all open tabs in the current browser session, showing which one is active.",
    input_schema: { type: "object", properties: {} } },
  { name: "browser_open_tab", description: "Open a new tab at a URL within the current browser session (keeps existing tabs open) and switch to it.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
  { name: "browser_switch_tab", description: "Switch the active tab to the given tabId (from browser_list_tabs).",
    input_schema: { type: "object", properties: { tabId: { type: "number" } }, required: ["tabId"] } },
  { name: "browser_close_tab", description: "Close the tab with the given tabId (from browser_list_tabs).",
    input_schema: { type: "object", properties: { tabId: { type: "number" } }, required: ["tabId"] } },
  { name: "browser_close", description: "Close the current browser session.",
    input_schema: { type: "object", properties: {} } },
];

// [7/10] Tool argument schema validator, built from the definitions above
const { makeValidator } = require("./tool-validator");
const validateToolCallArgs = makeValidator(TOOL_DEFINITIONS);

function safeEvaluateArithmetic(expr) {
  if (!expr || typeof expr !== "string") return "0";
  const sanitized = expr.trim();
  // Strip out allowed Math functions to check for unauthorized identifiers or variables
  const withoutMath = sanitized.replace(/Math\.(sqrt|sin|cos|tan|abs|floor|ceil|round|pow|min|max|log|log10|PI|E)/g, "");
  if (/[a-zA-Z_$]/.test(withoutMath)) {
    return "[CALC_ERROR]: Expression contains unauthorized code, variables, or functions.";
  }
  try {
    const fn = new Function("Math", `"use strict"; return (${sanitized});`);
    const val = fn(Math);
    if (typeof val !== "number" || !isFinite(val)) {
      return "[CALC_ERROR]: Calculation resulted in non-finite number or NaN.";
    }
    return String(val);
  } catch (err) {
    return `[CALC_ERROR]: ${err.message}`;
  }
}

async function executeTool(toolName, args) {
  const t0 = Date.now();

  // [RATE LIMITER] Guard against a runaway tool-calling loop (a confused
  // agent calling the same/different tool dozens of times per second).
  const rateCheck = toolRateLimiter.checkAndConsume(toolName);
  if (!rateCheck.allowed) {
    return `[RATE_LIMITED]: ${rateCheck.reason}`;
  }

  // [SCHEMA VALIDATION] Catch hallucinated/malformed tool arguments before
  // execution instead of letting them fail deep inside the tool's own logic.
  const validation = validateToolCallArgs(toolName, args);
  if (!validation.valid) {
    return `[VALIDATION_ERROR]: ${validation.errors.join(" ")}`;
  }

  try {
    switch (toolName) {
      case "write_file": {
        const base = FREEZE_DIR ? FREEZE_DIR.slice(0, -1) : __dirname;
        const fullPath = path.resolve(base, args.filePath);
        if (!isWithinFreezeDir(fullPath)) return `[BLOCKED] ${args.filePath} is outside FREEZE_DIR.`;
        if (watchdog.isProtectedPath(fullPath)) return `[SECURITY REJECT] Modification of protected file '${path.basename(fullPath)}' blocked.`;
        
        watchdog.createCheckpoint(fullPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        atomicWriteSync(fullPath, args.content);

        // [POST-ACTION READ-BACK VERIFICATION]
        if (!fs.existsSync(fullPath)) {
          return `[VERIFICATION FAILED] File ${args.filePath} was not created on disk.`;
        }
        const verifyContent = fs.readFileSync(fullPath, "utf-8");
        if (verifyContent.length === 0 && (args.content || "").length > 0) {
          return `[VERIFICATION FAILED] File ${args.filePath} is 0 bytes (corrupt write).`;
        }

        if (!watchdog.validateSyntax(fullPath)) {
          return `[WATCHDOG REJECT] Syntax error detected in ${args.filePath}. File changes reverted.`;
        }

        const verifyMs = Date.now() - t0;
        let note = "";
        try {
          const scopeCheck = scopeGuard.checkScope(currentTaskIntent, args.filePath, args.content);
          if (!scopeCheck.inScope) {
            note = ` [SCOPE NOTE: ${scopeCheck.flags.join(" ")}]`;
            console.log(`  [SCOPE GUARD] ${scopeCheck.verdict}: ${scopeCheck.flags.join(" ")}`);
          }
        } catch (_) {}
        return `[SUCCESS & VERIFIED] Wrote and verified ${verifyContent.length} bytes to ${args.filePath} (${verifyMs}ms).${note}`;
      }
      case "read_file": {
        const base = FREEZE_DIR ? FREEZE_DIR.slice(0, -1) : __dirname;
        const fullPath = path.resolve(base, args.filePath);
        if (!isWithinFreezeDir(fullPath)) return `[BLOCKED] ${args.filePath} is outside FREEZE_DIR.`;
        if (!fs.existsSync(fullPath)) return `Error: File does not exist: ${args.filePath}`;
        let content = fs.readFileSync(fullPath, "utf-8");
        content = stripSurrogates(content);
        const { redacted, findings } = redactSecrets(content);
        if (findings.length > 0) console.log(`  [REDACT] ${findings.map(f => f.label).join(", ")} masked in ${args.filePath}`);
        return redacted;
      }
      case "terminal_exec": {
        const safety = checkCommandSafety(args.command);
        if (safety.warn) {
          return `[SECURITY REJECT] Denied dangerous command: ${args.command}`;
        }
        const cwd = (FREEZE_DIR ? FREEZE_DIR.slice(0, -1) : null) || process.cwd();
        try {
          let out = execSync(args.command, { cwd, timeout: 30000, encoding: "utf-8" });
          out = stripSurrogates(out);
          const { redacted, findings } = redactSecrets(out);
          if (findings.length > 0) console.log(`  [REDACT] ${findings.map(f => f.label).join(", ")} masked in output`);
          return redacted.slice(0, 4000) || "[Command executed with no output]";
        } catch (e) { return `[COMMAND_ERROR]: ${e.message}`; }
      }
      case "code_exec": {
        const ext = args.language === "python" ? "py" : "js";
        const base = FREEZE_DIR ? FREEZE_DIR.slice(0, -1) : __dirname;
        const tmpFile = path.join(base, `_tmp_exec_${process.pid}_${crypto.randomBytes(4).toString("hex")}.${ext}`);
        fs.writeFileSync(tmpFile, args.code);
        try {
          const res = spawnSync(args.language === "python" ? "python" : "node", [tmpFile], { timeout: 15000, encoding: "utf-8" });
          let out = (res.stdout || "") + (res.stderr ? "\nSTDERR: " + res.stderr : "");
          out = stripSurrogates(out);
          const { redacted } = redactSecrets(out);
          return redacted;
        } finally { try { fs.unlinkSync(tmpFile); } catch (_) {} }
      }
      case "calculator":
        return safeEvaluateArithmetic(args.expression);
      case "ruflo_tool": {
        if (!rufloBridge.isConfigured()) {
          return `[TOOL_ERROR]: Ruflo MCP bridge not configured. Set RUFLO_MCP_PATH in .env (see ruflo-bridge-setup.md) to use real ruflo tools.`;
        }
        try {
          if (args.tool_name === "tools_list") {
            const tools = await rufloBridge.listTools();
            return JSON.stringify(tools.map(t => ({ name: t.name, description: t.description })));
          }
          const result = await rufloBridge.callTool(args.tool_name, args.args || {});
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: ruflo_tool "${args.tool_name}" failed: ${err.message}`;
        }
      }
      case "parallel_research": {
        try {
          const { runParallelResearch } = require("./multi-agent-system");
          const result = await runParallelResearch(args.topics, 3);
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: parallel_research failed: ${err.message}`;
        }
      }
      case "sequential_thinking": {
        try {
          if (!mcpBridge.isConfigured("sequentialthinking")) {
            return `[TOOL_ERROR]: sequentialthinking MCP server not built. Run "npm install && npm run build" in mcp-servers/sequentialthinking/.`;
          }
          const result = await mcpBridge.callTool("sequentialthinking", "sequentialthinking", args);
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: sequential_thinking failed: ${err.message}`;
        }
      }
      case "hierarchical_crew": {
        try {
          const { runHierarchicalCrew } = require("./multi-agent-system");
          const result = await runHierarchicalCrew(args.mission, args.maxSteps || 8);
          return JSON.stringify({ mission: result.mission, stepsUsed: result.stepsUsed, steps: result.steps, finalResult: result.finalHandoff?.payload });
        } catch (err) {
          return `[TOOL_ERROR]: hierarchical_crew failed: ${err.message}`;
        }
      }
      case "debate_group_chat": {
        try {
          const { runDebateGroupChat } = require("./multi-agent-system");
          const result = await runDebateGroupChat(args.topic, args.maxTurns || 8);
          return JSON.stringify({ topic: args.topic, stoppedReason: result.stoppedReason, transcript: result.messages });
        } catch (err) {
          return `[TOOL_ERROR]: debate_group_chat failed: ${err.message}`;
        }
      }
      case "browser_open": {
        try {
          const browserAgent = require("./browser-agent");
          const result = await browserAgent.openSession(args.url);
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: browser_open failed: ${err.message}`;
        }
      }
      case "browser_act": {
        try {
          const browserAgent = require("./browser-agent");
          const result = await browserAgent.actByIndex(args.index, args.action, args.value || "");
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: browser_act failed: ${err.message}`;
        }
      }
      case "browser_scroll": {
        try {
          const browserAgent = require("./browser-agent");
          const result = await browserAgent.scroll(args.direction || "down", args.amount || 600);
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: browser_scroll failed: ${err.message}`;
        }
      }
      case "browser_back": {
        try {
          const browserAgent = require("./browser-agent");
          const result = await browserAgent.goBack();
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: browser_back failed: ${err.message}`;
        }
      }
      case "browser_keys": {
        try {
          const browserAgent = require("./browser-agent");
          const result = await browserAgent.sendKeys(args.keys);
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: browser_keys failed: ${err.message}`;
        }
      }
      case "browser_extract": {
        try {
          const browserAgent = require("./browser-agent");
          const result = await browserAgent.extractContent(args.selector || null);
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: browser_extract failed: ${err.message}`;
        }
      }
      case "browser_find_text": {
        try {
          const browserAgent = require("./browser-agent");
          const result = await browserAgent.findText(args.text);
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: browser_find_text failed: ${err.message}`;
        }
      }
      case "browser_screenshot": {
        try {
          const browserAgent = require("./browser-agent");
          const result = await browserAgent.screenshot(args.fileName || null);
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: browser_screenshot failed: ${err.message}`;
        }
      }
      case "browser_save_pdf": {
        try {
          const browserAgent = require("./browser-agent");
          const result = await browserAgent.saveAsPDF(args.fileName || null);
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: browser_save_pdf failed: ${err.message}`;
        }
      }
      case "browser_list_tabs": {
        try {
          const browserAgent = require("./browser-agent");
          const result = await browserAgent.listTabs();
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: browser_list_tabs failed: ${err.message}`;
        }
      }
      case "browser_open_tab": {
        try {
          const browserAgent = require("./browser-agent");
          const result = await browserAgent.openTab(args.url);
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: browser_open_tab failed: ${err.message}`;
        }
      }
      case "browser_switch_tab": {
        try {
          const browserAgent = require("./browser-agent");
          const result = await browserAgent.switchTab(args.tabId);
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: browser_switch_tab failed: ${err.message}`;
        }
      }
      case "browser_close_tab": {
        try {
          const browserAgent = require("./browser-agent");
          const result = await browserAgent.closeTab(args.tabId);
          return JSON.stringify(result);
        } catch (err) {
          return `[TOOL_ERROR]: browser_close_tab failed: ${err.message}`;
        }
      }
      case "browser_close": {
        try {
          const browserAgent = require("./browser-agent");
          await browserAgent.closeSession();
          return "Browser session closed.";
        } catch (err) {
          return `[TOOL_ERROR]: browser_close failed: ${err.message}`;
        }
      }
      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err) { return `[TOOL_ERROR]: ${toolName} failed: ${err.message}`; }
}

// ===========================================================================
// [8] BOOTSTRAP & CRITIC
// ===========================================================================
async function bootstrap(goal) {
  console.log("\n[BOOTSTRAP] Decomposing goal into structured plan...");
  const system = 'Break the goal into 3-6 concrete verifiable subtasks.\nClassify each planning decision as:\n  MECHANICAL     - one clear answer, auto-decide silently\n  TASTE          - multiple valid approaches, auto-decide but note it\n  USER_CHALLENGE - conflicts with user\'s stated goal; NEVER auto-decide\n\nRespond ONLY with JSON:\n{"goal":"...","subtasks":[{"id":1,"description":"...","doneWhen":"..."}],"decisions":[{"type":"MECHANICAL|TASTE|USER_CHALLENGE","note":"..."}]}';
  const res = await callLLM([{ role: "user", content: `Goal: ${goal}` }], system);
  const match = res.text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Bootstrap failed to produce valid JSON plan: " + res.text);
  const plan = JSON.parse(match[0]);

  const taskState = {
    goal,
    status: "BOOTSTRAPPED",
    subtasks: plan.subtasks || [],
    completedSubtasks: [],
    decisions: plan.decisions || []
  };
  writeTaskState(taskState);

  const challenges = (plan.decisions || []).filter(d => d.type === "USER_CHALLENGE");
  if (challenges.length > 0) {
    console.log("\n[USER_CHALLENGE] Agent has concerns before starting:");
    challenges.forEach((c, i) => console.log(`  ${i+1}. ${c.note}`));
    const ok = await askHumanConfirmation("Proceed anyway?");
    if (!ok) {
      console.log("[BOOTSTRAP] User declined. Releasing workspace lock and exiting.");
      releaseWorkspaceLock();
      process.exit(0);
    }
  }
  appendMemory(`Bootstrapped plan for "${goal}" with ${plan.subtasks.length} subtasks.`);
  appendLearning("decide", `bootstrap:${Date.now()}`, `Planned goal: ${goal}`);
  return taskState;
}

async function criticStep(subtask, result) {
  const system = 'You are an independent critic. Respond EXACTLY:\nVERDICT: PASS\nREASON: <one line>\nor\nVERDICT: FAIL\nREASON: <one line>';
  const res = await callLLM(
    [{ role: "user", content: `Subtask: ${subtask.description}\nDone criteria: ${subtask.doneWhen}\nResult: ${result}` }],
    system
  );
  return { pass: /VERDICT:\s*PASS/i.test(res.text), feedback: res.text };
}

async function runRootCauseAnalysis(subtask, failureHistory) {
  console.log("\n  [RCA] 3 failures - running root cause analysis...");
  const system = 'Debugging expert. Iron Law: NO FIXES WITHOUT ROOT CAUSE FIRST.\nIdentify:\n1. Exact failure pattern\n2. Most likely root cause\n3. Symptom (fixable) or architectural flaw (escalate)?\n4. Specific corrective action for next attempt\nRespond with a concise RCA report.';
  const res = await callLLM(
    [{ role: "user", content: `Subtask: ${subtask.description}\nFailure history:\n${failureHistory}` }],
    system
  );
  console.log(`  [RCA]\n${res.text.slice(0, 500)}`);
  appendLearning("decide", `rca:${subtask.id}:${Date.now()}`, `RCA subtask ${subtask.id}: ${res.text.slice(0, 200)}`);
  return res.text;
}

function parseCompletionProtocol(text) {
  if (/\bDONE_WITH_CONCERNS\b/i.test(text)) return "DONE_WITH_CONCERNS";
  if (/\bDONE\b/i.test(text))               return "DONE";
  if (/\bBLOCKED\b/i.test(text))            return "BLOCKED";
  if (/\bNEEDS_CONTEXT\b/i.test(text))      return "NEEDS_CONTEXT";
  return null;
}

// N-Gram repetition detector
function detectRepetitionLoop(recentOutputs) {
  if (recentOutputs.length < 3) return false;
  const last = recentOutputs[recentOutputs.length - 1];
  const secondLast = recentOutputs[recentOutputs.length - 2];
  const thirdLast = recentOutputs[recentOutputs.length - 3];
  return last === secondLast && secondLast === thirdLast;
}

// ===========================================================================
// [9] ACTOR LOOP WITH ERROR FEEDBACK & N-GRAM DETECTION
// ===========================================================================
async function runActorWithNativeTools(subtask, memoryContext, matchedSkill, ragContext, controlOptions, rcaContext, parentGoal = "") {
  rcaContext = rcaContext || "";
  const skillBlock = matchedSkill
    ? `\nRELEVANT SKILL${matchedSkill.isStale ? " (STALE - verify steps)" : ""}:\n${matchedSkill.content}\n`
    : "";
  const learnings = buildLearningsContext();
  const completionBlock = "\nWhen finished, end with one of: DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT\n";
  const system = `You are an autonomous execution agent. Session canary: ${SESSION_CANARY}\nComplete the subtask using available tools.\n\nPrior Learnings:\n${memoryContext || "(none yet)"}\n${learnings}${skillBlock}${ragContext || ""}${rcaContext ? "\nROOT CAUSE ANALYSIS:\n" + rcaContext + "\n" : ""}${completionBlock}`;

  const goalHeader = parentGoal ? `[MASTER GOAL: "${parentGoal}"]\n` : "";
  const initialContent = `${goalHeader}[ACTIVE SUBTASK ${subtask.id}]: ${subtask.description}\n[DONE CRITERIA]: ${subtask.doneWhen}`;

  const messages = [{ role: "user", content: initialContent }];
  let toolStepCount = 0;
  let consecutiveSameToolErrors = 0;
  let lastToolError = "";
  const recentActionSignatures = [];

  while (toolStepCount < CONFIG.MAX_ACTOR_TOOL_STEPS) {
    if (controlOptions.isStopRequested && controlOptions.isStopRequested()) return "[Stopped by user]";
    toolStepCount++;

    if (messages.length > 8) {
      console.log("  [CONTEXT COMPRESSOR] Compressing older tool turns into rolling summary...");
      const preservedInitial = messages[0];
      const recentTurns = messages.slice(-4);
      const intermediateTurns = messages.slice(1, -4);
      let summaryText = intermediateTurns.map(m => {
        if (typeof m.content === "string") return m.content.slice(0, 100);
        if (Array.isArray(m.content)) return m.content.map(b => (b.type === "tool_result" ? `[Tool Result: ${b.tool_name}] ${String(b.content).slice(0, 120)}` : "")).join(" ");
        return "";
      }).filter(Boolean).join(" | ");

      const initialBaseContent = typeof preservedInitial.content === "string"
        ? preservedInitial.content
        : JSON.stringify(preservedInitial.content);

      const mergedInitial = {
        role: "user",
        content: `${initialBaseContent}\n\n[COMPRESSED EXECUTION CONTEXT (Rolling Summary)]: ${summaryText.slice(0, 500)}`
      };
      messages.length = 0;
      messages.push(mergedInitial, ...recentTurns);
    }

    const tLlm0 = Date.now();
    const response = await callLLMWithTools(messages, system, TOOL_DEFINITIONS);
    const llmDuration = Date.now() - tLlm0;
    const contentBlocks = response.content || [];
    messages.push({ role: "assistant", content: contentBlocks });
    const toolUseCalls = contentBlocks.filter(b => b.type === "tool_use");

    if (toolUseCalls.length === 0) {
      const textBlock = contentBlocks.find(b => b.type === "text");
      const finalText = textBlock ? textBlock.text : "[No output]";
      const protocol = parseCompletionProtocol(finalText);
      if (protocol) console.log(`  [COMPLETION] ${protocol} (Step time: ${llmDuration}ms)`);
      return finalText;
    }

    const toolResults = [];
    for (const call of toolUseCalls) {
      console.log(`  [TOOL EXEC] ${call.name}(${JSON.stringify(call.input).slice(0, 100)})`);
      const actionSig = `${call.name}:${JSON.stringify(call.input)}`;
      recentActionSignatures.push(actionSig);

      if (detectRepetitionLoop(recentActionSignatures)) {
        console.warn("🚨 [N-GRAM LOOP DETECTED] Agent repeated identical action 3 times. Forcing variation.");
        messages.push({ role: "user", content: "[SYSTEM ALERT]: You are repeating the exact same action in a loop. Stop and try an alternate method." });
        break;
      }

      const output = await executeTool(call.name, call.input);
      const outputStr = String(output);

      // [SAME-ERROR CIRCUIT BREAKER]
      if (outputStr.startsWith("[TOOL_ERROR]") || outputStr.startsWith("[COMMAND_ERROR]") || outputStr.startsWith("[SECURITY REJECT]")) {
        if (outputStr === lastToolError) {
          consecutiveSameToolErrors++;
          if (consecutiveSameToolErrors >= 2) {
            console.warn("🚨 [CIRCUIT BREAKER] Consecutive identical tool failure detected. Aborting subtask.");
            return `[CIRCUIT_BREAKER_TRIPPED] Identical error repeated: ${outputStr}`;
          }
        } else {
          lastToolError = outputStr;
          consecutiveSameToolErrors = 1;
        }
      } else {
        consecutiveSameToolErrors = 0;
        lastToolError = "";
      }

      checkCanaryLeak(outputStr);
      toolResults.push({ type: "tool_result", tool_name: call.name, tool_use_id: call.id, content: outputStr });
    }
    messages.push({ role: "user", content: toolResults });
  }
  return "[Actor reached max tool steps]";
}

// ===========================================================================
// [10] SUBTASK RUNNER
// ===========================================================================
async function runSubtaskToCompletion(subtask, controlOptions, parentGoal = "") {
  const outcome = await runSubtaskToCompletionInner(subtask, controlOptions, parentGoal);
  // INTELLIGENCE LOOP (JUDGE -> DISTILL -> CONSOLIDATE): record what happened
  // as a "lesson" in RAG memory so a similar future subtask retrieves it via
  // the normal buildRagContext() call above. Never let learning break the
  // actual task outcome.
  try {
    intelligenceLoop.learnFromOutcome(subtask.description, outcome.result || outcome.reason || "", outcome.success);
  } catch (_) {}
  // [SKILL IMPROVEMENT] Track whether the skill matched for this subtask
  // (if any) correlated with success — surfaces underperforming skills for
  // manual review over time via skillImprovement.getUnderperformingSkills().
  try {
    if (currentMatchedSkillTitle) skillImprovement.recordSkillOutcome(currentMatchedSkillTitle, outcome.success);
  } catch (_) {}
  return outcome;
}

async function runSubtaskToCompletionInner(subtask, controlOptions, parentGoal = "") {
  controlOptions = controlOptions || {};
  currentTaskIntent = subtask.description || "";
  const matchedSkill = await findRelevantSkill(subtask.description);
  currentMatchedSkillTitle = matchedSkill ? matchedSkill.title : null;
  if (matchedSkill) console.log(`  [SKILL MATCHED] ${matchedSkill.title}${matchedSkill.isStale ? " STALE" : ""}`);
  
  let ragContext = "";
  try {
    const tRag0 = Date.now();
    ragContext = await buildRagContext(subtask.description, 3);
    const ragTime = Date.now() - tRag0;
    if (ragContext) {
      console.log(`  [RAG MATCHED] Injected knowledge chunks (${ragTime}ms).`);
      // [CORRECTIVE RAG] Grade whether the retrieved context is actually
      // relevant before trusting it as ground truth — a naive RAG pipeline
      // will confidently inject irrelevant context, which makes wrong
      // answers MORE convincing, not less.
      try {
        const rawHits = ragModule.search(subtask.description, 5);
        const grade = await correctiveRag.gradeRelevance(subtask.description, rawHits);
        if (grade.verdict !== "sufficient") {
          ragContext += `\n<rag_reliability_note>${grade.guidance}</rag_reliability_note>\n`;
          console.log(`  [CORRECTIVE RAG] ${grade.verdict}: ${grade.guidance}`);
        }
      } catch (_) {}
    }
  } catch (_) {}

  let attempts = 0, lastResult = null, failureLog = [], rcaContext = "";
  let lastVerdictFeedback = "";

  while (attempts < CONFIG.MAX_SUBTASK_RETRIES) {
    if (controlOptions.isStopRequested && controlOptions.isStopRequested())
      return { success: false, result: lastResult, reason: "Stop requested" };
    if (attempts > 0 && attempts % CONFIG.THREE_STRIKE_THRESHOLD === 0)
      rcaContext = await runRootCauseAnalysis(subtask, failureLog.join("\n"));
    attempts++;
    const result = await runActorWithNativeTools(subtask, readMemory(), matchedSkill, ragContext, controlOptions, rcaContext, parentGoal);
    lastResult = result;

    if (String(result).includes("[CIRCUIT_BREAKER_TRIPPED]")) {
      return { success: false, result, reason: "Circuit breaker tripped (repeated error)" };
    }

    const verdict = await criticStep(subtask, result);
    console.log(`  [Subtask ${subtask.id}] attempt ${attempts} -> ${verdict.pass ? "PASS" : "FAIL"}`);
    if (verdict.pass) { await saveSkill(subtask, result); return { success: true, result }; }

    if (verdict.feedback === lastVerdictFeedback && attempts >= 2) {
      console.warn("  [SAME-CRITIC ERROR] Critic returned identical feedback twice. Triggering rapid RCA.");
      rcaContext = await runRootCauseAnalysis(subtask, failureLog.join("\n") + "\n" + verdict.feedback);
    }
    lastVerdictFeedback = verdict.feedback;

    const failNote = `Attempt ${attempts}: ${verdict.feedback.replace(/\n/g, " ")}`;
    failureLog.push(failNote);
    appendMemory(`Subtask ${subtask.id} attempt ${attempts} REJECTED: ${verdict.feedback.replace(/\n/g, " ")}`);
    if (tokensUsedSoFar >= CONFIG.MAX_TOKENS_TOTAL) return { success: false, result: lastResult, reason: "token budget exhausted" };
  }
  return { success: false, result: lastResult, reason: "max retries exceeded" };
}

// ===========================================================================
// [11] DYNAMIC REPLANNING
// ===========================================================================
async function replanRemaining(goal, completedIds, failureReason) {
  console.log("\n🔀 [DYNAMIC REPLANNING] Re-evaluating remaining subtasks...");
  const system = 'You are a master adaptive project planner. Replan the REMAINING steps to achieve the original goal given recent failures.\nRespond ONLY with JSON:\n{"subtasks":[{"id":...,"description":"...","doneWhen":"..."}]}';
  const prompt = `Goal: ${goal}\nCompleted Subtasks: ${JSON.stringify(completedIds)}\nFailure Reason: ${failureReason}\nGenerate updated remaining subtasks.`;
  try {
    const res = await callLLM([{ role: "user", content: prompt }], system);
    const match = res.text.match(/\{[\s\S]*\}/);
    if (match) {
      const newPlan = JSON.parse(match[0]);
      if (newPlan && Array.isArray(newPlan.subtasks) && newPlan.subtasks.length > 0) {
        const state = readTaskState() || { goal, subtasks: [], completedSubtasks: [] };
        const existingCompleted = state.subtasks.filter(s => completedIds.includes(s.id));
        state.subtasks = [...existingCompleted, ...newPlan.subtasks];
        writeTaskState(state);
        console.log(`✅ [DYNAMIC REPLANNING] Plan updated with ${newPlan.subtasks.length} revised subtasks.`);
        return state;
      }
    }
  } catch (err) {
    console.warn(`[REPLANNING FAILED] ${err.message}`);
  }
  return null;
}

// ===========================================================================
// [12] MAIN AGENT LOOP WITH METRIC & WORKSPACE MUTEX
// ===========================================================================
async function runAgent(goal, controlOptions) {
  controlOptions = controlOptions || {};
  ensureDirs();
  goalContextBudget.reset(); // fresh budget tracking per goal run

  if (!acquireWorkspaceLock(goal)) {
    return { success: false, reason: "Workspace lock busy" };
  }

  const overallStartTime = Date.now();
  try {
    const provider = detectProvider();
    console.log(`[ACTIVE LLM PROVIDER] ${provider.toUpperCase()}`);
    if (FREEZE_DIR) { fs.mkdirSync(FREEZE_DIR.slice(0, -1), { recursive: true }); console.log(`[FREEZE_DIR] Scoped to: ${FREEZE_DIR}`); }
    console.log(`[SESSION CANARY] ${SESSION_CANARY} (leak detection active)`);

    let taskState = readTaskState();
    if (taskState && taskState.goal && taskState.goal !== goal) {
      console.log("[BOOTSTRAP] Existing plan belongs to a different goal; creating a fresh plan.");
      taskState = null;
    }
    if (!taskState) taskState = await bootstrap(goal);

    let outerIteration = 0;
    while (outerIteration < CONFIG.MAX_OUTER_ITERATIONS) {
      if (controlOptions.isStopRequested && controlOptions.isStopRequested()) {
        console.log("\nExecution halted by user.");
        logTaskMetrics(goal, tokensUsedSoFar, Date.now() - overallStartTime, false);
        return { success: false, reason: "Stopped by user", iterations: outerIteration, tokensUsed: tokensUsedSoFar };
      }
      outerIteration++;
      taskState = readTaskState();
      const remaining = taskState.subtasks.filter(t => !taskState.completedSubtasks.includes(t.id));
      
      if (remaining.length === 0) {
        console.log("\nAll subtasks complete!");
        taskState.status = "COMPLETED";
        writeTaskState(taskState);
        logTaskMetrics(goal, tokensUsedSoFar, Date.now() - overallStartTime, true);
        return { success: true, iterations: outerIteration, tokensUsed: tokensUsedSoFar, skillsLearned: listSkills().length };
      }

      console.log(`\n=== Iteration ${outerIteration} - ${remaining.length} subtasks left | tokens: ${tokensUsedSoFar} ===`);
      if (tokensUsedSoFar >= CONFIG.MAX_TOKENS_TOTAL) {
        logTaskMetrics(goal, tokensUsedSoFar, Date.now() - overallStartTime, false);
        return { success: false, reason: "Token budget exhausted", iterations: outerIteration };
      }

      taskState.status = "IN_PROGRESS";
      taskState.activeSubtask = remaining[0];
      writeTaskState(taskState);

      const outcome = await runSubtaskToCompletion(remaining[0], controlOptions, goal);
      if (outcome.success) {
        taskState.completedSubtasks.push(remaining[0].id);
        writeTaskState(taskState);
        noProgressStreak = 0;
      } else {
        noProgressStreak++;
        appendMemory(`Subtask ${remaining[0].id} failed: ${outcome.reason}`);
        appendLearning("decide", `failure:${remaining[0].id}:${Date.now()}`, `Subtask failed: ${outcome.reason}`);
        if (outcome.reason === "Stop requested") {
          logTaskMetrics(goal, tokensUsedSoFar, Date.now() - overallStartTime, false);
          return { success: false, reason: "Stopped by user", iterations: outerIteration, tokensUsed: tokensUsedSoFar };
        }

        if (noProgressStreak === 2) {
          await replanRemaining(goal, taskState.completedSubtasks, outcome.reason);
        }

        if (noProgressStreak >= CONFIG.NO_PROGRESS_LIMIT) {
          logTaskMetrics(goal, tokensUsedSoFar, Date.now() - overallStartTime, false);
          return { success: false, reason: "No progress - halted.", iterations: outerIteration };
        }
      }
    }
    logTaskMetrics(goal, tokensUsedSoFar, Date.now() - overallStartTime, false);
    return { success: false, reason: "Max iterations reached", iterations: outerIteration };
  } finally {
    releaseWorkspaceLock();
  }
}

module.exports = {
  runAgent,
  listSkills,
  TOOL_DEFINITIONS,
  redactSecrets,
  checkCommandSafety,
  acquireWorkspaceLock,
  releaseWorkspaceLock,
  safeEvaluateArithmetic,
  calculateTaskCost
};

if (require.main === module) {
  (async () => {
    const goal = process.argv[2] || "Create a simple portfolio website with HTML, CSS, and JS in a folder named my-portfolio";
    console.log("\n========================================================");
    console.log("AUTONOMOUS AGENT v7 (Universal Free Multi-Provider Edition)");
    console.log("========================================================");
    console.log(`Goal: ${goal}`);
    console.log(`Provider: ${detectProvider().toUpperCase()}`);
    console.log(`Freeze: ${FREEZE_DIR || "(none)"}\n`);
    const result = await runAgent(goal);
    console.log("\n=== FINAL RESULT ===");
    console.log(result);
  })();
}
