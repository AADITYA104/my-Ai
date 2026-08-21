/**
 * ============================================================================
 *  AUTONOMOUS LOOP AGENT - v7: UNIVERSAL FREE MULTI-PROVIDER EDITION (2026)
 *  - 12 Production-Grade Patterns from GStack & Free Cloud/Local Cascade.
 *  - Sliding Window Rolling Context Compressor (<300 tokens after 5 turns).
 *  - Top-of-Turn Explicit Goal & Active Subtask Re-Injection.
 *  - 2-Attempt Same-Error Circuit Breaker Guard.
 *  - Persistent Progress Checkpoint Ledger (agent-memory/progress.json).
 *  - Mid-Execution Dynamic Replanning Trigger.
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
const MEMORY_DIR        = path.join(__dirname, "agent-memory");
const SKILLS_DIR        = path.join(MEMORY_DIR, "skills");
const USAGE_FILE        = path.join(MEMORY_DIR, "skill-usage.json");
const LEARNINGS_FILE    = path.join(MEMORY_DIR, "learnings.jsonl");
const EGRESS_FILE       = path.join(MEMORY_DIR, "egress.jsonl");
const CHECKPOINT_FILE   = path.join(MEMORY_DIR, "progress.json");

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
let noProgressStreak = 0;

// Per-session canary token
const SESSION_CANARY = "CANARY-" + crypto.randomBytes(8).toString("hex");

// ===========================================================================
// [1] ATOMIC FILE WRITES
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
// [2] UNICODE SURROGATE CLEANUP & SECRETS REDACTION
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
// [3] DIRECTORY BOUNDARY CHECKS
// ===========================================================================
function isWithinFreezeDir(targetPath) {
  if (!FREEZE_DIR) return true;
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(FREEZE_DIR);
}

function checkCommandSafety(command) {
  if (watchdog.isDestructiveCommand(command)) {
    return { warn: true, reason: "Command matched dangerous system pattern in deny-matrix." };
  }
  return { warn: false, reason: "Safe command" };
}

function ensureDirs() {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

// ===========================================================================
// [4] HUMAN CONFIRMATION BRIDGE
// ===========================================================================
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
// [5] LLM INVOCATION WRAPPER
// ===========================================================================
async function callLLM(messages, system) {
  const res = await callUniversalLLM(messages, system);
  const usage = res.usage || {};
  tokensUsedSoFar += (usage.input_tokens || 0) + (usage.output_tokens || 0);
  const textBlock = (res.content || []).find(b => b.type === "text");
  return textBlock ? textBlock.text : "";
}

async function callLLMWithTools(messages, system, tools) {
  const res = await callUniversalLLM(messages, system, tools);
  const usage = res.usage || {};
  tokensUsedSoFar += (usage.input_tokens || 0) + (usage.output_tokens || 0);
  return res;
}

// ===========================================================================
// [6] MEMORY, LEARNINGS & PLAN HELPERS
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
function readPlan() {
  const p = path.join(MEMORY_DIR, "plan.json");
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch (_) { return null; }
}
function writePlan(plan) { atomicWriteJSON(path.join(MEMORY_DIR, "plan.json"), plan); }
function readProgress() {
  if (!fs.existsSync(CHECKPOINT_FILE)) return { completedSubtasks: [] };
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8")); } catch (_) { return { completedSubtasks: [] }; }
}
function writeProgress(progress) { atomicWriteJSON(CHECKPOINT_FILE, progress); }
function clearProgress() {
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
}

// ===========================================================================
// [7] SKILL MEMORY
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
  const raw = await callLLM(
    [{ role: "user", content: `Task: ${taskDescription}\n\nSkills:\n${index}` }],
    "Reply with ONLY the number of the most relevant skill, or 0 if none apply. Prefer fresh over stale."
  );
  const num = parseInt(raw.trim(), 10);
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
  const raw = await callLLM([{ role: "user", content: `Task: ${subtask.description}\nApproach: ${successfulApproach}` }], system);
  ensureDirs();
  const titleMatch = raw.match(/^#\s*(.+)/m);
  const slug = (titleMatch ? titleMatch[1] : `skill-${Date.now()}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
  const filePath = path.join(SKILLS_DIR, `${slug}.md`);
  if (fs.existsSync(filePath)) { appendMemory(`Reinforced skill "${slug}".`); return; }
  atomicWriteSync(filePath, raw);
  appendMemory(`Learned new skill: "${slug}".`);
  appendLearning("decide", `skill:${slug}`, `Learned skill "${slug}" from: ${subtask.description.slice(0, 80)}`);
  console.log(`  [SKILL SAVED] ${slug}.md`);
}

// ===========================================================================
// [8] TOOL DEFINITIONS & EXECUTION
// ===========================================================================
const TOOL_DEFINITIONS = [
  { name: "write_file",    description: "Writes text content to a file with pre-edit checkpointing.",
    input_schema: { type: "object", properties: { filePath: { type: "string" }, content: { type: "string" } }, required: ["filePath","content"] } },
  { name: "read_file",     description: "Reads text content of a file.",
    input_schema: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] } },
  { name: "terminal_exec", description: "Runs a shell command guarded by safety deny-matrix.",
    input_schema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
  { name: "code_exec",     description: "Executes JavaScript or Python code in sandbox.",
    input_schema: { type: "object", properties: { language: { type: "string", enum: ["javascript","python"] }, code: { type: "string" } }, required: ["language","code"] } },
  { name: "calculator",    description: "Evaluates an arithmetic expression.",
    input_schema: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } },
];

async function executeTool(toolName, args) {
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
        if (!watchdog.validateSyntax(fullPath)) {
          return `[WATCHDOG REJECT] Syntax error detected in ${args.filePath}. File changes reverted.`;
        }
        return `Successfully wrote to ${args.filePath}`;
      }
      case "read_file": {
        const base = FREEZE_DIR ? FREEZE_DIR.slice(0, -1) : __dirname;
        const fullPath = path.resolve(base, args.filePath);
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
        } catch (e) { return `Command failed: ${e.message}`; }
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
        return String(Function('"use strict"; return (' + args.expression + ')')());
      default:
        return "Unknown tool: " + toolName;
    }
  } catch (err) { return `Tool error (${toolName}): ${err.message}`; }
}

// ===========================================================================
// [9] BOOTSTRAP & CRITIC
// ===========================================================================
async function bootstrap(goal) {
  console.log("\n[BOOTSTRAP] Decomposing goal into structured plan...");
  const system = 'Break the goal into 3-6 concrete verifiable subtasks.\nClassify each planning decision as:\n  MECHANICAL     - one clear answer, auto-decide silently\n  TASTE          - multiple valid approaches, auto-decide but note it\n  USER_CHALLENGE - conflicts with user\'s stated goal; NEVER auto-decide\n\nRespond ONLY with JSON:\n{"goal":"...","subtasks":[{"id":1,"description":"...","doneWhen":"..."}],"decisions":[{"type":"MECHANICAL|TASTE|USER_CHALLENGE","note":"..."}]}';
  const raw = await callLLM([{ role: "user", content: `Goal: ${goal}` }], system);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Bootstrap failed to produce valid JSON plan: " + raw);
  const plan = JSON.parse(match[0]);
  writePlan(plan);
  const challenges = (plan.decisions || []).filter(d => d.type === "USER_CHALLENGE");
  if (challenges.length > 0) {
    console.log("\n[USER_CHALLENGE] Agent has concerns before starting:");
    challenges.forEach((c, i) => console.log(`  ${i+1}. ${c.note}`));
    const ok = await askHumanConfirmation("Proceed anyway?");
    if (!ok) { console.log("[BOOTSTRAP] User declined. Exiting."); process.exit(0); }
  }
  appendMemory(`Bootstrapped plan for "${goal}" with ${plan.subtasks.length} subtasks.`);
  appendLearning("decide", `bootstrap:${Date.now()}`, `Planned goal: ${goal}`);
  return plan;
}

async function criticStep(subtask, result) {
  const system = 'You are an independent critic. Respond EXACTLY:\nVERDICT: PASS\nREASON: <one line>\nor\nVERDICT: FAIL\nREASON: <one line>';
  const text = await callLLM(
    [{ role: "user", content: `Subtask: ${subtask.description}\nDone criteria: ${subtask.doneWhen}\nResult: ${result}` }],
    system
  );
  return { pass: /VERDICT:\s*PASS/i.test(text), feedback: text };
}

async function runRootCauseAnalysis(subtask, failureHistory) {
  console.log("\n  [RCA] 3 failures - running root cause analysis...");
  const system = 'Debugging expert. Iron Law: NO FIXES WITHOUT ROOT CAUSE FIRST.\nIdentify:\n1. Exact failure pattern\n2. Most likely root cause\n3. Symptom (fixable) or architectural flaw (escalate)?\n4. Specific corrective action for next attempt\nRespond with a concise RCA report.';
  const rca = await callLLM(
    [{ role: "user", content: `Subtask: ${subtask.description}\nFailure history:\n${failureHistory}` }],
    system
  );
  console.log(`  [RCA]\n${rca.slice(0, 500)}`);
  appendLearning("decide", `rca:${subtask.id}:${Date.now()}`, `RCA subtask ${subtask.id}: ${rca.slice(0, 200)}`);
  return rca;
}

function parseCompletionProtocol(text) {
  if (/\bDONE_WITH_CONCERNS\b/i.test(text)) return "DONE_WITH_CONCERNS";
  if (/\bDONE\b/i.test(text))               return "DONE";
  if (/\bBLOCKED\b/i.test(text))            return "BLOCKED";
  if (/\bNEEDS_CONTEXT\b/i.test(text))      return "NEEDS_CONTEXT";
  return null;
}

// ===========================================================================
// [10] ACTOR LOOP WITH SLIDING-WINDOW ROLLING SUMMARY & GOAL RE-INJECTION
// ===========================================================================
async function runActorWithNativeTools(subtask, memoryContext, matchedSkill, ragContext, controlOptions, rcaContext, parentGoal = "") {
  rcaContext = rcaContext || "";
  const skillBlock = matchedSkill
    ? `\nRELEVANT SKILL${matchedSkill.isStale ? " (STALE - verify steps)" : ""}:\n${matchedSkill.content}\n`
    : "";
  const learnings = buildLearningsContext();
  const completionBlock = "\nWhen finished, end with one of: DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT\n";
  const system = `You are an autonomous execution agent. Session canary: ${SESSION_CANARY}\nComplete the subtask using available tools.\n\nPrior Learnings:\n${memoryContext || "(none yet)"}\n${learnings}${skillBlock}${ragContext || ""}${rcaContext ? "\nROOT CAUSE ANALYSIS:\n" + rcaContext + "\n" : ""}${completionBlock}`;

  // [EXPLICIT GOAL RE-INJECTION]: Injected at top of turn to prevent drift
  const goalHeader = parentGoal ? `[MASTER GOAL: "${parentGoal}"]\n` : "";
  const initialContent = `${goalHeader}[ACTIVE SUBTASK ${subtask.id}]: ${subtask.description}\n[DONE CRITERIA]: ${subtask.doneWhen}`;

  const messages = [{ role: "user", content: initialContent }];
  let toolStepCount = 0;
  let consecutiveSameToolErrors = 0;
  let lastToolError = "";

  while (toolStepCount < CONFIG.MAX_ACTOR_TOOL_STEPS) {
    if (controlOptions.isStopRequested && controlOptions.isStopRequested()) return "[Stopped by user]";
    toolStepCount++;

    // [SLIDING-WINDOW ROLLING CONTEXT COMPRESSION]
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

      const compressedBlock = { role: "user", content: `[COMPRESSED EXECUTION CONTEXT (Rolling Summary)]: ${summaryText.slice(0, 500)}` };
      messages.length = 0;
      messages.push(preservedInitial, compressedBlock, ...recentTurns);
    }

    const response = await callLLMWithTools(messages, system, TOOL_DEFINITIONS);
    const contentBlocks = response.content || [];
    messages.push({ role: "assistant", content: contentBlocks });
    const toolUseCalls = contentBlocks.filter(b => b.type === "tool_use");

    if (toolUseCalls.length === 0) {
      const textBlock = contentBlocks.find(b => b.type === "text");
      const finalText = textBlock ? textBlock.text : "[No output]";
      const protocol = parseCompletionProtocol(finalText);
      if (protocol) console.log("  [COMPLETION] " + protocol);
      return finalText;
    }

    const toolResults = [];
    for (const call of toolUseCalls) {
      console.log(`  [TOOL EXEC] ${call.name}(${JSON.stringify(call.input).slice(0, 100)})`);
      const output = await executeTool(call.name, call.input);
      const outputStr = String(output);

      // [SAME-ERROR CIRCUIT BREAKER (Threshold 2)]
      if (outputStr.startsWith("Tool error") || outputStr.startsWith("[SECURITY REJECT]")) {
        if (outputStr === lastToolError) {
          consecutiveSameToolErrors++;
          if (consecutiveSameToolErrors >= 2) {
            console.warn("🚨 [CIRCUIT BREAKER] Consecutive identical tool failure detected. Aborting subtask execution to prevent loop drift.");
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
// [11] SUBTASK RUNNER WITH SAME-ERROR DETECTION
// ===========================================================================
async function runSubtaskToCompletion(subtask, controlOptions, parentGoal = "") {
  controlOptions = controlOptions || {};
  const matchedSkill = await findRelevantSkill(subtask.description);
  if (matchedSkill) console.log(`  [SKILL MATCHED] ${matchedSkill.title}${matchedSkill.isStale ? " STALE" : ""}`);
  let ragContext = "";
  try {
    ragContext = await buildRagContext(subtask.description, 3);
    if (ragContext) console.log("  [RAG MATCHED] Injected knowledge chunks.");
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

    // Same-critic feedback detection
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
// [12] DYNAMIC MID-EXECUTION REPLANNING
// ===========================================================================
async function replanRemaining(goal, completedIds, failureReason) {
  console.log("\n🔀 [DYNAMIC REPLANNING] Subtask failure threshold reached. Re-evaluating remaining plan...");
  const system = 'You are a master adaptive project planner. Replan the REMAINING steps to achieve the original goal given recent failures.\nRespond ONLY with JSON:\n{"subtasks":[{"id":...,"description":"...","doneWhen":"..."}]}';
  const prompt = `Goal: ${goal}\nCompleted Subtasks: ${JSON.stringify(completedIds)}\nFailure Reason: ${failureReason}\nGenerate updated remaining subtasks.`;
  try {
    const raw = await callLLM([{ role: "user", content: prompt }], system);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const newPlan = JSON.parse(match[0]);
      if (newPlan && Array.isArray(newPlan.subtasks) && newPlan.subtasks.length > 0) {
        const fullPlan = readPlan() || { goal, subtasks: [] };
        const existingCompleted = fullPlan.subtasks.filter(s => completedIds.includes(s.id));
        fullPlan.subtasks = [...existingCompleted, ...newPlan.subtasks];
        writePlan(fullPlan);
        console.log(`✅ [DYNAMIC REPLANNING] Plan updated with ${newPlan.subtasks.length} revised subtasks.`);
        return fullPlan;
      }
    }
  } catch (err) {
    console.warn(`[REPLANNING FAILED] ${err.message}`);
  }
  return null;
}

// ===========================================================================
// [13] MAIN AGENT LOOP WITH PERSISTENT PROGRESS CHECKPOINTS
// ===========================================================================
async function runAgent(goal, controlOptions) {
  controlOptions = controlOptions || {};
  ensureDirs();
  const provider = detectProvider();
  console.log(`[ACTIVE LLM PROVIDER] ${provider.toUpperCase()}`);
  if (FREEZE_DIR) { fs.mkdirSync(FREEZE_DIR.slice(0, -1), { recursive: true }); console.log(`[FREEZE_DIR] Scoped to: ${FREEZE_DIR}`); }
  console.log(`[SESSION CANARY] ${SESSION_CANARY} (leak detection active)`);
  let plan = readPlan();
  if (plan && plan.goal && plan.goal !== goal) {
    console.log("[BOOTSTRAP] Existing plan belongs to a different goal; creating a fresh plan.");
    clearProgress();
    plan = null;
  }
  if (!plan) plan = await bootstrap(goal);

  let outerIteration = 0;
  while (outerIteration < CONFIG.MAX_OUTER_ITERATIONS) {
    if (controlOptions.isStopRequested && controlOptions.isStopRequested()) {
      console.log("\nExecution halted by user.");
      return { success: false, reason: "Stopped by user", iterations: outerIteration, tokensUsed: tokensUsedSoFar };
    }
    outerIteration++;
    plan = readPlan();
    const progress = readProgress();
    const remaining = plan.subtasks.filter(t => !progress.completedSubtasks.includes(t.id));
    if (remaining.length === 0) {
      console.log("\nAll subtasks complete!");
      atomicWriteJSON(CHECKPOINT_FILE, { goal, status: "COMPLETED", completedSubtasks: progress.completedSubtasks, timestamp: Date.now() });
      return { success: true, iterations: outerIteration, tokensUsed: tokensUsedSoFar, skillsLearned: listSkills().length };
    }
    console.log(`\n=== Iteration ${outerIteration} - ${remaining.length} subtasks left | tokens: ${tokensUsedSoFar} ===`);
    if (tokensUsedSoFar >= CONFIG.MAX_TOKENS_TOTAL) return { success: false, reason: "Token budget exhausted", iterations: outerIteration };

    // Update ongoing progress checkpoint
    atomicWriteJSON(CHECKPOINT_FILE, {
      goal,
      status: "IN_PROGRESS",
      activeSubtask: remaining[0],
      completedSubtasks: progress.completedSubtasks,
      remainingCount: remaining.length,
      timestamp: Date.now()
    });

    const outcome = await runSubtaskToCompletion(remaining[0], controlOptions, goal);
    if (outcome.success) {
      progress.completedSubtasks.push(remaining[0].id);
      writeProgress(progress);
      noProgressStreak = 0;
    } else {
      noProgressStreak++;
      appendMemory(`Subtask ${remaining[0].id} failed: ${outcome.reason}`);
      appendLearning("decide", `failure:${remaining[0].id}:${Date.now()}`, `Subtask failed: ${outcome.reason}`);
      if (outcome.reason === "Stop requested") return { success: false, reason: "Stopped by user", iterations: outerIteration, tokensUsed: tokensUsedSoFar };

      // [TRIGGER DYNAMIC REPLANNING ON REPEATED FAILURE]
      if (noProgressStreak === 2) {
        await replanRemaining(goal, progress.completedSubtasks, outcome.reason);
      }

      if (noProgressStreak >= CONFIG.NO_PROGRESS_LIMIT) return { success: false, reason: "No progress - halted.", iterations: outerIteration };
    }
  }
  return { success: false, reason: "Max iterations reached", iterations: outerIteration };
}

module.exports = { runAgent, listSkills, TOOL_DEFINITIONS, redactSecrets, checkCommandSafety };

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
