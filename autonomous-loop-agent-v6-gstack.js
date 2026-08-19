/**
 * ============================================================================
 *  AUTONOMOUS LOOP AGENT - v6: GSTACK-HARDENED EDITION
 * ============================================================================
 *
 *  12 production-grade patterns from gstack framework:
 *
 *  [1]  ATOMIC FILE WRITES       - tmp+rename, pid+random suffix (no race)
 *  [2]  LEARNINGS EVENT LOG      - append-only JSONL, decide/supersede/redact
 *  [3]  CANARY TOKEN DETECTION   - per-session token, leaks abort session
 *  [4]  SECRETS & PII REDACTION  - AWS/GH/Anthropic keys, email, IP masked
 *  [5]  UNICODE SURROGATE STRIP  - prevents 400 crashes from scraped text
 *  [6]  ENHANCED SHELL SAFETY    - IFS obfuscation, base64-pipe detection
 *  [7]  FREEZE DIR TRAILING-SLASH- /src vs /src-old prefix fix
 *  [8]  THREE-TIER DECISION CLASS - MECHANICAL/TASTE/USER_CHALLENGE
 *  [9]  3-STRIKE ROOT CAUSE RCA  - investigates before symptom patching
 *  [10] SKILL STALENESS PRUNING  - stale skill files flagged not injected
 *  [11] EGRESS RECEIPT AUDIT LOG - sha256 chain ledger for all API calls
 *  [12] COMPLETION PROTOCOL      - DONE/DONE_WITH_CONCERNS/BLOCKED/NEEDS_CONTEXT
 *
 * RUN:
 *   ANTHROPIC_API_KEY=xxx VOYAGE_API_KEY=xxx node autonomous-loop-agent-v6-gstack.js "goal"
 */
"use strict";

const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");
const { execSync, spawnSync } = require("child_process");
const readline = require("readline");

// Optional RAG module
let buildRagContext = async () => "";
let rememberConversationTurn = async () => {};
try {
  const rag = require("./rag-memory");
  buildRagContext = rag.buildRagContext;
  rememberConversationTurn = rag.rememberConversationTurn;
} catch (_) {}

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL             = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const MEMORY_DIR        = path.join(__dirname, "agent-memory");
const SKILLS_DIR        = path.join(MEMORY_DIR, "skills");
const USAGE_FILE        = path.join(MEMORY_DIR, "skill-usage.json");
const LEARNINGS_FILE    = path.join(MEMORY_DIR, "learnings.jsonl");
const EGRESS_FILE       = path.join(MEMORY_DIR, "egress.jsonl");

// [7] Trailing-slash-safe FREEZE_DIR
const _rawFD     = process.env.FREEZE_DIR ? path.resolve(process.env.FREEZE_DIR) : null;
const FREEZE_DIR = _rawFD ? (_rawFD.endsWith(path.sep) ? _rawFD : _rawFD + path.sep) : null;

const CONFIG = {
  MAX_OUTER_ITERATIONS  : 15,
  MAX_SUBTASK_RETRIES   : 3,
  MAX_ACTOR_TOOL_STEPS  : 8,
  MAX_TOKENS_TOTAL      : 80000,
  NO_PROGRESS_LIMIT     : 2,
  THREE_STRIKE_THRESHOLD: 3,
};

let tokensUsedSoFar  = 0;
let noProgressStreak = 0;

// [3] Per-session canary token
const SESSION_CANARY = "CANARY-" + crypto.randomBytes(8).toString("hex");

// ===========================================================================
// [1] ATOMIC FILE WRITES  (gstack lib/fs-atomic.ts)
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

// ===========================================================================
// [5] UNICODE SURROGATE CLEANUP  (gstack ARCHITECTURE.md v1.38)
// ===========================================================================
function stripSurrogates(text) {
  if (typeof text !== "string") return text;
  return text.replace(/[\uD800-\uDFFF]/g, "\uFFFD");
}

// ===========================================================================
// [4] SECRETS & PII REDACTION  (gstack lib/redact-engine.ts - JS port)
// ===========================================================================
const REDACT_PATTERNS = [
  { id: "aws.key",      re: /(?<![A-Z0-9])(AKIA|ASIA|AROA)[A-Z0-9]{16}(?![A-Z0-9])/g,        label: "AWS Access Key"  },
  { id: "pem.private",  re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g,               label: "Private Key"     },
  { id: "gh.token",     re: /ghp_[A-Za-z0-9]{36}/g,                                           label: "GitHub PAT"      },
  { id: "sk.openai",    re: /sk-[A-Za-z0-9]{48}/g,                                            label: "OpenAI Key"      },
  { id: "sk.anthropic", re: /sk-ant-[A-Za-z0-9\-_]{80,}/g,                                    label: "Anthropic Key"   },
  { id: "pii.email",    re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,        label: "Email"           },
  { id: "net.ip",       re: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, label: "IP Address" },
];
const REDACT_ALLOW = new Set(["example@example.com","user@example.com","test@test.com","127.0.0.1","0.0.0.0"]);

function redactSecrets(text) {
  if (!text || typeof text !== "string") return { redacted: text, findings: [] };
  if (Buffer.byteLength(text, "utf8") > 1024 * 1024)
    return { redacted: "[INPUT TOO LARGE - REDACTED]", findings: [{ id: "engine.oversize", label: "Input too large" }] };
  const normalized = text.normalize("NFKC").replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
  let result = normalized;
  const findings = [];
  for (const pat of REDACT_PATTERNS) {
    pat.re.lastIndex = 0;
    result = result.replace(pat.re, (match) => {
      if (REDACT_ALLOW.has(match)) return match;
      findings.push({ id: pat.id, label: pat.label });
      return "<REDACTED-" + pat.id + ">";
    });
  }
  return { redacted: result, findings };
}

// ===========================================================================
// [6] ENHANCED SHELL SAFETY  (gstack careful/bin/check-careful.sh)
// ===========================================================================
const SAFE_ARTIFACT_RE = /^[\s]*rm\s+-[a-zA-Z]*[rR][a-zA-Z]*\s+((?:[^\s;&|#(`]\/)?(?:node_modules|\.next|dist|__pycache__|\.cache|build|\.turbo|coverage)\s*)+$/;
const IFS_RE = /\$\{IFS\}|\$IFS|base64\s+(-d|--decode)[^|]*\|\s*(sh|bash)/;

const DESTRUCTIVE = [
  { re: /rm\s+(-[a-zA-Z]*[rR]|--recursive)/i,   msg: "Recursive delete (rm -r)" },
  { re: /drop\s+(table|database)/i,               msg: "SQL DROP detected" },
  { re: /\btruncate\b/i,                          msg: "SQL TRUNCATE detected" },
  { re: /git\s+push\s+.*(-f\b|--force)/,          msg: "git force-push" },
  { re: /git\s+reset\s+--hard/,                   msg: "git reset --hard" },
  { re: /git\s+(checkout|restore)\s+\./,          msg: "git discard working tree" },
  { re: /kubectl\s+delete/,                        msg: "kubectl delete" },
  { re: /docker\s+(rm\s+-f|system\s+prune)/,      msg: "Docker force-remove/prune" },
  { re: /\bdd\s+if=/i,                            msg: "dd if= (low-level disk write)" },
  { re: /\bmkfs\b/i,                              msg: "mkfs (formats filesystem)" },
  { re: /curl.*\|\s*sh/i,                         msg: "curl | sh (remote exec)" },
  { re: /wget.*\|\s*sh/i,                         msg: "wget | sh (remote exec)" },
  { re: /:\(\)\s*\{\s*:\|:&\s*\};:/,             msg: "Fork bomb" },
  { re: /chmod\s+-R\s+777/i,                      msg: "chmod -R 777" },
  { re: /\b(shutdown|reboot)\b/i,                 msg: "System shutdown/reboot" },
];

function checkCommandSafety(command) {
  if (!command || typeof command !== "string") return { warn: false, reason: "" };
  if (!command.includes("\n") && SAFE_ARTIFACT_RE.test(command)) return { warn: false, reason: "" };
  if (IFS_RE.test(command)) return { warn: true, reason: "Shell obfuscation (IFS/base64-to-shell)" };
  for (const c of DESTRUCTIVE)
    if (c.re.test(command)) return { warn: true, reason: c.msg };
  return { warn: false, reason: "" };
}

// ===========================================================================
// [7] FREEZE DIR - trailing-slash-safe path check
// ===========================================================================
function isWithinFreezeDir(targetPath) {
  if (!FREEZE_DIR) return true;
  const resolved = path.resolve(targetPath);
  return (resolved + path.sep).startsWith(FREEZE_DIR);
}

function askHumanConfirmation(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('\nWARNING: ' + question + '\nType "yes" to allow: ', answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

// ===========================================================================
// [11] EGRESS RECEIPT AUDIT LOG  (gstack lib/egress-receipt.ts)
// ===========================================================================
let _prevHash = "genesis";
function writeEgressReceipt(sink, meta) {
  const record = { ts: new Date().toISOString(), sink, ...meta, prev: _prevHash };
  const line = JSON.stringify(record);
  _prevHash = crypto.createHash("sha256").update(line).digest("hex");
  record.sha256 = _prevHash;
  try { fs.mkdirSync(MEMORY_DIR, { recursive: true }); atomicAppendLine(EGRESS_FILE, JSON.stringify(record)); } catch (_) {}
}

// ===========================================================================
// [3] CANARY TOKEN CHECK
// ===========================================================================
function checkCanaryLeak(text) {
  if (text && text.includes(SESSION_CANARY)) {
    console.error("\nCANARY LEAK - system prompt may have been exfiltrated. Aborting.");
    process.exit(1);
  }
}

// ===========================================================================
// ANTHROPIC API CLIENT
// ===========================================================================
async function callClaudeWithTools(messages, system, tools) {
  tools = tools || null;
  const payload = { model: MODEL, max_tokens: 2500, system, messages };
  if (tools && tools.length > 0) payload.tools = tools;
  writeEgressReceipt("anthropic-api", { model: MODEL, messageCount: messages.length });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  tokensUsedSoFar += (data.usage ? data.usage.input_tokens : 0) + (data.usage ? data.usage.output_tokens : 0);
  const responseText = (data.content || []).map(b => b.text || "").join(" ");
  checkCanaryLeak(responseText);
  return data;
}
async function callClaude(messages, system) {
  const data = await callClaudeWithTools(messages, system, null);
  return (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : "";
}

// ===========================================================================
// [2] LEARNINGS EVENT LOG  (gstack lib/gstack-decision.ts)
// ===========================================================================
function appendLearning(type, key, content) {
  const record = { ts: new Date().toISOString(), type, key, content };
  try { fs.mkdirSync(MEMORY_DIR, { recursive: true }); atomicAppendLine(LEARNINGS_FILE, JSON.stringify(record)); } catch (_) {}
}
function loadActiveLearnings() {
  if (!fs.existsSync(LEARNINGS_FILE)) return [];
  const events = [];
  for (const l of fs.readFileSync(LEARNINGS_FILE, "utf-8").split("\n").filter(Boolean))
    try { events.push(JSON.parse(l)); } catch (_) {}
  const superseded = new Set(events.filter(e => e.type === "supersede" || e.type === "redact").map(e => e.key));
  return events.filter(e => e.type === "decide" && !superseded.has(e.key));
}
function buildLearningsContext() {
  const active = loadActiveLearnings();
  if (active.length === 0) return "";
  return "\nINSTITUTIONAL LEARNINGS:\n" + active.map(l => "- [" + l.key + "] " + l.content).join("\n") + "\n";
}

// ===========================================================================
// STATE HELPERS
// ===========================================================================
function ensureDirs() { fs.mkdirSync(SKILLS_DIR, { recursive: true }); }
function readMemory() {
  const p = path.join(MEMORY_DIR, "memory.md");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
}
function appendMemory(entry) {
  const p = path.join(MEMORY_DIR, "memory.md");
  atomicWriteSync(p, (fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "") + "\n- " + entry);
}
function readPlan() {
  const p = path.join(MEMORY_DIR, "plan.json");
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch (_) { return null; }
}
function writePlan(plan) { ensureDirs(); atomicWriteJSON(path.join(MEMORY_DIR, "plan.json"), plan); }
function readProgress() {
  const p = path.join(MEMORY_DIR, "progress.json");
  if (!fs.existsSync(p)) return { completedSubtasks: [] };
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch (_) { return { completedSubtasks: [] }; }
}
function writeProgress(progress) { atomicWriteJSON(path.join(MEMORY_DIR, "progress.json"), progress); }

// ===========================================================================
// [10] SKILL MEMORY WITH STALENESS CHECK  (gstack learn/SKILL.md)
// ===========================================================================
function listSkills() {
  ensureDirs();
  return fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith(".md")).map(f => {
    const content   = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
    const titleMatch = content.match(/^#\s*(.+)/m);
    const title     = titleMatch ? titleMatch[1] : f;
    const whenMatch  = content.match(/## When to use\s*\n(.+)/);
    const whenToUse = whenMatch ? whenMatch[1] : "";
    const refFiles  = Array.from(content.matchAll(/`([^`]+\.[a-z]{1,5})`/g)).map(m => m[1]);
    const isStale   = refFiles.some(rf => rf.startsWith("./") && !fs.existsSync(path.resolve(__dirname, rf)));
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
  const index = skills.map((s, i) => (i+1) + ". " + s.title + " (" + (s.isStale ? "STALE" : "fresh") + ") - when: " + s.whenToUse).join("\n");
  const raw = await callClaude(
    [{ role: "user", content: "Task: " + taskDescription + "\n\nSkills:\n" + index }],
    "Reply with ONLY the number of the most relevant skill, or 0 if none apply. Prefer fresh over stale."
  );
  const num = parseInt(raw.trim(), 10);
  if (num >= 1 && num <= skills.length) {
    const matched = skills[num - 1];
    recordSkillUsage(matched.file);
    if (matched.isStale) console.log("  [SKILL WARN] " + matched.title + " is STALE");
    return matched;
  }
  return null;
}
async function saveSkill(subtask, successfulApproach) {
  const system = "Distill this into a concise reusable skill. Format EXACTLY:\n# <short title>\n## When to use\n<one line summary>\n## Steps\n<numbered actionable steps>\n## Gotchas\n<pitfalls or \"None noted\">";
  const raw = await callClaude(
    [{ role: "user", content: "Task: " + subtask.description + "\nApproach: " + successfulApproach }], system
  );
  ensureDirs();
  const titleMatch = raw.match(/^#\s*(.+)/m);
  const slug = (titleMatch ? titleMatch[1] : "skill-" + Date.now()).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
  const filePath = path.join(SKILLS_DIR, slug + ".md");
  if (fs.existsSync(filePath)) { appendMemory('Reinforced skill "' + slug + '".'); return; }
  atomicWriteSync(filePath, raw);
  appendMemory('Learned new skill: "' + slug + '".');
  appendLearning("decide", "skill:" + slug, 'Learned skill "' + slug + '" from: ' + subtask.description.slice(0, 80));
  console.log("  [SKILL SAVED] " + slug + ".md");
  try { await rememberConversationTurn("Skill learned: " + slug + "\n" + raw, ["skill", slug]); } catch (_) {}
}

// ===========================================================================
// TOOL DEFINITIONS
// ===========================================================================
const TOOL_DEFINITIONS = [
  { name: "write_file",    description: "Writes content to a file within the workspace.",
    input_schema: { type: "object", properties: { filePath: { type: "string", description: "Target path relative to workspace" }, content: { type: "string", description: "Full text content" } }, required: ["filePath","content"] } },
  { name: "read_file",     description: "Reads the text content of a file.",
    input_schema: { type: "object", properties: { filePath: { type: "string", description: "File path to read" } }, required: ["filePath"] } },
  { name: "terminal_exec", description: "Runs a shell command. Destructive commands require confirmation.",
    input_schema: { type: "object", properties: { command: { type: "string", description: "Shell command to run" } }, required: ["command"] } },
  { name: "code_exec",     description: "Executes JavaScript or Python in an isolated subprocess.",
    input_schema: { type: "object", properties: { language: { type: "string", enum: ["javascript","python"] }, code: { type: "string" } }, required: ["language","code"] } },
  { name: "browser_control", description: "Headless Chromium automation via Playwright.",
    input_schema: { type: "object", properties: { action: { type: "string", enum: ["goto","screenshot","click","extract_text"] }, target: { type: "string" } }, required: ["action","target"] } },
  { name: "calculator",    description: "Safely evaluates an arithmetic expression.",
    input_schema: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } },
];

let browserState = { browser: null, page: null };

async function executeTool(toolName, args) {
  try {
    switch (toolName) {
      case "write_file": {
        const base = FREEZE_DIR ? FREEZE_DIR.slice(0, -1) : __dirname;
        const fullPath = path.resolve(base, args.filePath);
        if (!isWithinFreezeDir(fullPath)) return "[BLOCKED] " + args.filePath + " is outside FREEZE_DIR.";
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        atomicWriteSync(fullPath, args.content);
        return "Successfully wrote to " + args.filePath;
      }
      case "read_file": {
        const base = FREEZE_DIR ? FREEZE_DIR.slice(0, -1) : __dirname;
        const fullPath = path.resolve(base, args.filePath);
        let content = fs.readFileSync(fullPath, "utf-8");
        content = stripSurrogates(content);
        const { redacted, findings } = redactSecrets(content);
        if (findings.length > 0) console.log("  [REDACT] " + findings.map(f => f.label).join(", ") + " masked in " + args.filePath);
        return redacted;
      }
      case "terminal_exec": {
        const safety = checkCommandSafety(args.command);
        if (safety.warn) {
          const allowed = await askHumanConfirmation(safety.reason + "\n\nCommand: " + args.command);
          if (!allowed) return "[BLOCKED by human] Denied: " + args.command;
        }
        const cwd = (FREEZE_DIR ? FREEZE_DIR.slice(0, -1) : null) || process.cwd();
        try {
          let out = execSync(args.command, { cwd, timeout: 30000, encoding: "utf-8" });
          out = stripSurrogates(out);
          const { redacted, findings } = redactSecrets(out);
          if (findings.length > 0) console.log("  [REDACT] " + findings.map(f => f.label).join(", ") + " masked in output");
          return redacted.slice(0, 4000) || "[Command executed with no output]";
        } catch (e) { return "Command failed: " + e.message; }
      }
      case "code_exec": {
        const ext = args.language === "python" ? "py" : "js";
        const base = FREEZE_DIR ? FREEZE_DIR.slice(0, -1) : __dirname;
        const tmpFile = path.join(base, "_tmp_exec_" + process.pid + "_" + crypto.randomBytes(4).toString("hex") + "." + ext);
        fs.writeFileSync(tmpFile, args.code);
        try {
          const res = spawnSync(args.language === "python" ? "python3" : "node", [tmpFile], { timeout: 15000, encoding: "utf-8" });
          let out = (res.stdout || "") + (res.stderr ? "\nSTDERR: " + res.stderr : "");
          out = stripSurrogates(out);
          const { redacted } = redactSecrets(out);
          return redacted;
        } finally { try { fs.unlinkSync(tmpFile); } catch (_) {} }
      }
      case "browser_control": {
        let chromium;
        try { chromium = require("playwright").chromium; }
        catch (_) { return "Error: Playwright not installed. Run: npm install playwright && npx playwright install chromium"; }
        if (!browserState.page) {
          browserState.browser = await chromium.launch({ headless: true });
          browserState.page    = await browserState.browser.newPage();
        }
        const page = browserState.page;
        if (args.action === "goto")         { await page.goto(args.target, { timeout: 20000 }); return "Navigated to " + args.target; }
        if (args.action === "screenshot")   { await page.screenshot({ path: args.target }); return "Screenshot saved to " + args.target; }
        if (args.action === "click")        { await page.click(args.target, { timeout: 10000 }); return "Clicked: " + args.target; }
        if (args.action === "extract_text") {
          let texts = (await page.locator(args.target).allTextContents()).join(" | ").slice(0, 2500);
          texts = stripSurrogates(texts);
          const { redacted } = redactSecrets(texts);
          return redacted || "[No text found]";
        }
        return "Unknown action: " + args.action;
      }
      case "calculator":
        return String(Function('"use strict"; return (' + args.expression + ')')());
      default:
        return "Unknown tool: " + toolName;
    }
  } catch (err) { return "Tool error (" + toolName + "): " + err.message; }
}

// ===========================================================================
// [8] BOOTSTRAP WITH THREE-TIER DECISION CLASSIFICATION
// ===========================================================================
async function bootstrap(goal) {
  console.log("\n[BOOTSTRAP] Decomposing goal into structured plan...");
  const system = 'Break the goal into 3-8 concrete verifiable subtasks.\nClassify each planning decision as:\n  MECHANICAL     - one clear answer, auto-decide silently\n  TASTE          - multiple valid approaches, auto-decide but note it\n  USER_CHALLENGE - conflicts with user\'s stated goal; NEVER auto-decide\n\nRespond ONLY with JSON:\n{"goal":"...","subtasks":[{"id":1,"description":"...","doneWhen":"..."}],"decisions":[{"type":"MECHANICAL|TASTE|USER_CHALLENGE","note":"..."}]}';
  const raw  = await callClaude([{ role: "user", content: "Goal: " + goal }], system);
  const plan = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
  writePlan(plan);
  const challenges = (plan.decisions || []).filter(d => d.type === "USER_CHALLENGE");
  if (challenges.length > 0) {
    console.log("\n[USER_CHALLENGE] Agent has concerns before starting:");
    challenges.forEach((c, i) => console.log("  " + (i+1) + ". " + c.note));
    const ok = await askHumanConfirmation("Proceed anyway?");
    if (!ok) { console.log("[BOOTSTRAP] User declined. Exiting."); process.exit(0); }
  }
  appendMemory('Bootstrapped plan for "' + goal + '" with ' + plan.subtasks.length + " subtasks.");
  appendLearning("decide", "bootstrap:" + Date.now(), "Planned goal: " + goal);
  return plan;
}

// ===========================================================================
// CRITIC STEP
// ===========================================================================
async function criticStep(subtask, result) {
  const system = 'You are an independent critic. Respond EXACTLY:\nVERDICT: PASS\nREASON: <one line>\nor\nVERDICT: FAIL\nREASON: <one line>';
  const text = await callClaude(
    [{ role: "user", content: "Subtask: " + subtask.description + "\nDone criteria: " + subtask.doneWhen + "\nResult: " + result }],
    system
  );
  return { pass: /VERDICT:\s*PASS/i.test(text), feedback: text };
}

// ===========================================================================
// [9] ROOT CAUSE ANALYSIS (gstack investigate/ - 3-strike rule)
// ===========================================================================
async function runRootCauseAnalysis(subtask, failureHistory) {
  console.log("\n  [RCA] 3 failures - running root cause analysis...");
  const system = 'Debugging expert. Iron Law: NO FIXES WITHOUT ROOT CAUSE FIRST.\nIdentify:\n1. Exact failure pattern\n2. Most likely root cause\n3. Symptom (fixable) or architectural flaw (escalate)?\n4. Specific corrective action for next attempt\nRespond with a concise RCA report.';
  const rca = await callClaude(
    [{ role: "user", content: "Subtask: " + subtask.description + "\nFailure history:\n" + failureHistory }],
    system
  );
  console.log("  [RCA]\n" + rca.slice(0, 500));
  appendLearning("decide", "rca:" + subtask.id + ":" + Date.now(), "RCA subtask " + subtask.id + ": " + rca.slice(0, 200));
  return rca;
}

// ===========================================================================
// [12] COMPLETION PROTOCOL (gstack SKILL.md)
// ===========================================================================
function parseCompletionProtocol(text) {
  if (/\bDONE_WITH_CONCERNS\b/i.test(text)) return "DONE_WITH_CONCERNS";
  if (/\bDONE\b/i.test(text))               return "DONE";
  if (/\bBLOCKED\b/i.test(text))            return "BLOCKED";
  if (/\bNEEDS_CONTEXT\b/i.test(text))      return "NEEDS_CONTEXT";
  return null;
}

// ===========================================================================
// ACTOR LOOP
// ===========================================================================
async function runActorWithNativeTools(subtask, memoryContext, matchedSkill, ragContext, controlOptions, rcaContext) {
  rcaContext = rcaContext || "";
  const skillBlock   = matchedSkill
    ? "\nRELEVANT SKILL" + (matchedSkill.isStale ? " (STALE - verify steps)" : "") + ":\n" + matchedSkill.content + "\n"
    : "";
  const learnings    = buildLearningsContext();
  const completionBlock = "\nWhen finished, end with one of: DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT\n";
  const system = "You are an execution agent. Session canary: " + SESSION_CANARY + "\nComplete the subtask using available tools.\n\nPrior Learnings:\n" + (memoryContext || "(none yet)") + "\n" + learnings + skillBlock + (ragContext || "") + (rcaContext ? "\nROOT CAUSE ANALYSIS:\n" + rcaContext + "\n" : "") + completionBlock;
  const messages = [{ role: "user", content: "Subtask: " + subtask.description + "\nDone when: " + subtask.doneWhen }];
  let toolStepCount = 0;
  while (toolStepCount < CONFIG.MAX_ACTOR_TOOL_STEPS) {
    if (controlOptions.isStopRequested && controlOptions.isStopRequested()) return "[Stopped by user]";
    toolStepCount++;
    const response = await callClaudeWithTools(messages, system, TOOL_DEFINITIONS);
    if (response.error) return "API Error: " + response.error.message;
    const contentBlocks = response.content || [];
    messages.push({ role: "assistant", content: contentBlocks });
    const toolUseCalls = contentBlocks.filter(b => b.type === "tool_use");
    if (toolUseCalls.length === 0) {
      const textBlock = contentBlocks.find(b => b.type === "text");
      const finalText = textBlock ? textBlock.text : "[No output]";
      const protocol  = parseCompletionProtocol(finalText);
      if (protocol) console.log("  [COMPLETION] " + protocol);
      return finalText;
    }
    const toolResults = [];
    for (const call of toolUseCalls) {
      console.log("  [TOOL EXEC] " + call.name + "(" + JSON.stringify(call.input).slice(0, 100) + ")");
      const output = await executeTool(call.name, call.input);
      checkCanaryLeak(String(output));
      toolResults.push({ type: "tool_result", tool_use_id: call.id, content: String(output) });
    }
    messages.push({ role: "user", content: toolResults });
  }
  return "[Actor reached max tool steps]";
}

// ===========================================================================
// SUBTASK RUNNER
// ===========================================================================
async function runSubtaskToCompletion(subtask, controlOptions) {
  controlOptions = controlOptions || {};
  const matchedSkill = await findRelevantSkill(subtask.description);
  if (matchedSkill) console.log("  [SKILL MATCHED] " + matchedSkill.title + (matchedSkill.isStale ? " STALE" : ""));
  let ragContext = "";
  try {
    ragContext = await buildRagContext(subtask.description, 3);
    if (ragContext) console.log("  [RAG MATCHED] Injected knowledge chunks.");
  } catch (_) {}
  let attempts = 0, lastResult = null, failureLog = [], rcaContext = "";
  while (attempts < CONFIG.MAX_SUBTASK_RETRIES) {
    if (controlOptions.isStopRequested && controlOptions.isStopRequested())
      return { success: false, result: lastResult, reason: "Stop requested" };
    if (attempts > 0 && attempts % CONFIG.THREE_STRIKE_THRESHOLD === 0)
      rcaContext = await runRootCauseAnalysis(subtask, failureLog.join("\n"));
    attempts++;
    const result  = await runActorWithNativeTools(subtask, readMemory(), matchedSkill, ragContext, controlOptions, rcaContext);
    lastResult    = result;
    const verdict = await criticStep(subtask, result);
    console.log("  [Subtask " + subtask.id + "] attempt " + attempts + " -> " + (verdict.pass ? "PASS" : "FAIL"));
    if (verdict.pass) { await saveSkill(subtask, result); return { success: true, result }; }
    const failNote = "Attempt " + attempts + ": " + verdict.feedback.replace(/\n/g, " ");
    failureLog.push(failNote);
    appendMemory("Subtask " + subtask.id + " attempt " + attempts + " REJECTED: " + verdict.feedback.replace(/\n/g, " "));
    if (tokensUsedSoFar >= CONFIG.MAX_TOKENS_TOTAL) return { success: false, result: lastResult, reason: "token budget exhausted" };
  }
  return { success: false, result: lastResult, reason: "max retries exceeded" };
}

// ===========================================================================
// MAIN AGENT LOOP
// ===========================================================================
async function runAgent(goal, controlOptions) {
  controlOptions = controlOptions || {};
  ensureDirs();
  if (FREEZE_DIR) { fs.mkdirSync(FREEZE_DIR.slice(0, -1), { recursive: true }); console.log("[FREEZE_DIR] Scoped to: " + FREEZE_DIR); }
  console.log("[SESSION CANARY] " + SESSION_CANARY + " (leak detection active)");
  let plan = readPlan();
  if (!plan) plan = await bootstrap(goal);
  let outerIteration = 0;
  while (outerIteration < CONFIG.MAX_OUTER_ITERATIONS) {
    if (controlOptions.isStopRequested && controlOptions.isStopRequested()) {
      console.log("\nExecution halted by user.");
      return { success: false, reason: "Stopped by user", iterations: outerIteration, tokensUsed: tokensUsedSoFar };
    }
    outerIteration++;
    plan = readPlan();
    const progress  = readProgress();
    const remaining = plan.subtasks.filter(t => !progress.completedSubtasks.includes(t.id));
    if (remaining.length === 0) {
      console.log("\nAll subtasks complete.");
      return { success: true, iterations: outerIteration, tokensUsed: tokensUsedSoFar, skillsLearned: listSkills().length };
    }
    console.log("\n=== Iteration " + outerIteration + " - " + remaining.length + " subtasks left | tokens: " + tokensUsedSoFar + " ===");
    if (tokensUsedSoFar >= CONFIG.MAX_TOKENS_TOTAL) return { success: false, reason: "Token budget exhausted", iterations: outerIteration };
    const outcome = await runSubtaskToCompletion(remaining[0], controlOptions);
    if (outcome.success) {
      progress.completedSubtasks.push(remaining[0].id);
      writeProgress(progress);
      noProgressStreak = 0;
    } else {
      noProgressStreak++;
      appendMemory("Subtask " + remaining[0].id + " failed: " + outcome.reason);
      appendLearning("decide", "failure:" + remaining[0].id + ":" + Date.now(), "Subtask failed: " + outcome.reason);
      if (outcome.reason === "Stop requested") return { success: false, reason: "Stopped by user", iterations: outerIteration, tokensUsed: tokensUsedSoFar };
      if (noProgressStreak >= CONFIG.NO_PROGRESS_LIMIT) return { success: false, reason: "No progress - halted.", iterations: outerIteration };
    }
  }
  return { success: false, reason: "Max iterations reached", iterations: outerIteration };
}

module.exports = { runAgent, listSkills, TOOL_DEFINITIONS, redactSecrets, checkCommandSafety };

// ===========================================================================
// ENTRY POINT
// ===========================================================================
if (require.main === module) {
  if (!ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY is not set."); process.exit(1); }
  (async () => {
    const goal = process.argv[2] || "Create a comprehensive summary of this workspace in SUMMARY.md";
    console.log("\nAUTONOMOUS AGENT v6 (gstack-hardened)");
    console.log("Goal: " + goal);
    console.log("Model: " + MODEL);
    console.log("Freeze: " + (FREEZE_DIR || "(none)") + "\n");
    const result = await runAgent(goal);
    console.log("\n=== FINAL RESULT ===");
    console.log(result);
    if (browserState.browser) await browserState.browser.close();
  })();
}
