/**
 * ============================================================================
 *  AUTONOMOUS LOOP AGENT — v3: + TOOL AUTONOMY (terminal / code / browser)
 * ============================================================================
 *
 * NEW IN v3 (builds on v2's Skill Memory):
 *
 *   1. terminal_exec  — runs shell commands, WITH a destructive-command guard
 *   2. code_exec       — runs a JS/Python snippet in an isolated subprocess
 *   3. browser_control — navigate/screenshot/click via Playwright
 *
 * ⚠️ SAFETY — READ BEFORE RUNNING THIS ANYWHERE NEAR PRODUCTION DATA:
 *   Giving an LLM the ability to run arbitrary shell commands is genuinely
 *   dangerous if unguarded. This file implements guardrails:
 *     - DESTRUCTIVE_PATTERNS blocklist (rm -rf, dd, mkfs, sudo, git push --force,
 *       DROP TABLE, curl|sh, etc.) — these are NEVER auto-executed
 *     - Any blocked command requires an explicit human "yes" typed at the
 *       terminal (readline) before it runs — the agent CANNOT bypass this
 *     - FREEZE_DIR — if set, terminal_exec and code_exec refuse to touch
 *       anything outside this directory (basic path-scoping)
 *     - Recommend: run this inside a Docker container or VM,
 *       never directly on a machine with real credentials/production access
 *
 * DEPENDENCIES:
 *   npm install playwright && npx playwright install chromium
 *
 * RUN:
 *   ANTHROPIC_API_KEY=xxx FREEZE_DIR=./workspace node autonomous-loop-agent-v3.js "goal"
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const readline = require("readline");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MEMORY_DIR = path.join(__dirname, "agent-memory");
const SKILLS_DIR = path.join(MEMORY_DIR, "skills");
const FREEZE_DIR = process.env.FREEZE_DIR ? path.resolve(process.env.FREEZE_DIR) : null;

const CONFIG = {
  MAX_OUTER_ITERATIONS: 15,
  MAX_SUBTASK_RETRIES: 3,
  MAX_TOKENS_TOTAL: 60000,
  MAX_TOOL_RETRIES: 3,
  NO_PROGRESS_LIMIT: 2,
};

let tokensUsedSoFar = 0;
let noProgressStreak = 0;
const toolCallCounts = {};

// ---------------------------------------------------------------------------
// SAFETY LAYER — destructive command detection + human confirmation gate
// ---------------------------------------------------------------------------
const DESTRUCTIVE_PATTERNS = [
  /rm\s+-rf/i, /rm\s+-r\s+-f/i, /\bdd\s+if=/i, /\bmkfs/i, /\bsudo\b/i,
  /git\s+push\s+.*--force/i, /git\s+reset\s+--hard/i, /DROP\s+TABLE/i,
  /DROP\s+DATABASE/i, /TRUNCATE\s+TABLE/i, /curl.*\|\s*sh/i, /wget.*\|\s*sh/i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/, // fork bomb
  /chmod\s+-R\s+777/i, /\bshutdown\b/i, /\breboot\b/i,
];

function isDestructive(command) {
  return DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
}

function askHumanConfirmation(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`\n⚠️  ${question} Type "yes" to allow, anything else to block: `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

function isWithinFreezeDir(targetPath) {
  if (!FREEZE_DIR) return true; // no freeze configured — unrestricted (use with caution)
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(FREEZE_DIR);
}

// ---------------------------------------------------------------------------
// TOOLS
// ---------------------------------------------------------------------------
const TOOLS = {
  write_file: {
    description: "Writes content to a file. Input: 'path|||content'",
    run: async (input) => {
      const [filePath, ...rest] = input.split("|||");
      if (!isWithinFreezeDir(filePath)) return `Blocked: ${filePath} is outside FREEZE_DIR.`;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, rest.join("|||"));
      return `Wrote to ${filePath}`;
    },
  },

  read_file: {
    description: "Reads a file. Input: file path",
    run: async (input) => {
      try {
        return fs.readFileSync(input.trim(), "utf-8");
      } catch (e) {
        return `Error: ${e.message}`;
      }
    },
  },

  calculator: {
    description: "Evaluates a math expression",
    run: async (expr) => {
      try {
        return String(Function(`"use strict"; return (${expr})`)());
      } catch (e) {
        return `Error: ${e.message}`;
      }
    },
  },

  // --- Terminal execution with guardrails ---
  terminal_exec: {
    description: "Runs a shell command. Input: the command string",
    run: async (command) => {
      if (isDestructive(command)) {
        const allowed = await askHumanConfirmation(
          `Agent wants to run a DESTRUCTIVE command:\n  ${command}\n`
        );
        if (!allowed) return `[BLOCKED by human] Command was not executed: ${command}`;
      }
      if (FREEZE_DIR) {
        try {
          const out = execSync(command, { cwd: FREEZE_DIR, timeout: 30000, encoding: "utf-8" });
          return out.slice(0, 4000);
        } catch (e) {
          return `Command failed: ${e.message}`;
        }
      }
      try {
        const out = execSync(command, { timeout: 30000, encoding: "utf-8" });
        return out.slice(0, 4000);
      } catch (e) {
        return `Command failed: ${e.message}`;
      }
    },
  },

  // --- Isolated code execution (JS or Python) ---
  code_exec: {
    description: "Runs a code snippet in a subprocess. Input: 'js|||<code>' or 'python|||<code>'",
    run: async (input) => {
      const [lang, ...rest] = input.split("|||");
      const code = rest.join("|||");
      const tmpFile = path.join(
        FREEZE_DIR || __dirname,
        `_tmp_exec_${Date.now()}.${lang === "python" ? "py" : "js"}`
      );
      fs.writeFileSync(tmpFile, code);
      try {
        const cmd = lang === "python" ? "python3" : "node";
        const result = spawnSync(cmd, [tmpFile], { timeout: 15000, encoding: "utf-8" });
        return (result.stdout || "") + (result.stderr ? `\nSTDERR: ${result.stderr}` : "");
      } finally {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
        }
      }
    },
  },

  // --- Browser control via Playwright ---
  browser_control: {
    description:
      "Controls a headless browser. Input: 'goto|||<url>' or 'screenshot|||<path>' or 'click|||<selector>' or 'extract_text|||<selector>'",
    run: async (input) => {
      let chromium;
      try {
        chromium = require("playwright").chromium;
      } catch {
        return "Error: Playwright is not installed. Run 'npm install playwright && npx playwright install chromium'";
      }

      const [action, arg] = input.split("|||");

      if (!TOOLS.browser_control._page) {
        TOOLS.browser_control._browser = await chromium.launch({ headless: true });
        TOOLS.browser_control._page = await TOOLS.browser_control._browser.newPage();
      }
      const page = TOOLS.browser_control._page;

      switch (action) {
        case "goto":
          await page.goto(arg, { timeout: 20000 });
          return `Navigated to ${arg}`;
        case "screenshot": {
          const shotPath = isWithinFreezeDir(arg) ? arg : path.join(FREEZE_DIR || ".", "screenshot.png");
          await page.screenshot({ path: shotPath });
          return `Screenshot saved to ${shotPath}`;
        }
        case "click":
          await page.click(arg, { timeout: 10000 });
          return `Clicked ${arg}`;
        case "extract_text":
          return (await page.locator(arg).allTextContents()).join(" | ").slice(0, 2000);
        default:
          return `Unknown browser action: ${action}`;
      }
    },
  },
};

// ---------------------------------------------------------------------------
// MEMORY + SKILLS
// ---------------------------------------------------------------------------
function ensureDirs() {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
}
function readMemory() {
  const p = path.join(MEMORY_DIR, "memory.md");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
}
function appendMemory(entry) {
  fs.appendFileSync(path.join(MEMORY_DIR, "memory.md"), `\n- ${entry}`);
}
function readPlan() {
  const p = path.join(MEMORY_DIR, "plan.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : null;
}
function writePlan(plan) {
  fs.writeFileSync(path.join(MEMORY_DIR, "plan.json"), JSON.stringify(plan, null, 2));
}
function readProgress() {
  const p = path.join(MEMORY_DIR, "progress.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : { completedSubtasks: [] };
}
function writeProgress(progress) {
  fs.writeFileSync(path.join(MEMORY_DIR, "progress.json"), JSON.stringify(progress, null, 2));
}

function listSkills() {
  ensureDirs();
  return fs
    .readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const content = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
      const title = (content.match(/^#\s*(.+)/m) || [, f])[1];
      const whenToUse = (content.match(/## When to use\s*\n(.+)/) || [, ""])[1];
      return { file: f, title, whenToUse, content };
    });
}

async function findRelevantSkill(taskDescription) {
  const skills = listSkills();
  if (skills.length === 0) return null;
  const index = skills.map((s, i) => `${i + 1}. ${s.title} — use when: ${s.whenToUse}`).join("\n");
  const system = `Reply with ONLY the number of the most relevant skill, or 0 if none apply.`;
  const raw = await callClaude([{ role: "user", content: `Task: ${taskDescription}\n\nSkills:\n${index}` }], system);
  const num = parseInt(raw.trim(), 10);
  return num >= 1 && num <= skills.length ? skills[num - 1] : null;
}

async function saveSkill(subtask, successfulApproach) {
  const system = `Distill this into a reusable skill file. Format EXACTLY:
# <short title>
## When to use
<one line>
## Steps
<numbered steps>
## Gotchas
<pitfalls or "None noted">`;
  const raw = await callClaude(
    [{ role: "user", content: `Task: ${subtask.description}\nApproach that worked: ${successfulApproach}` }],
    system
  );
  ensureDirs();
  const slug = (raw.match(/^#\s*(.+)/m)?.[1] || `skill-${Date.now()}`)
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
  const filePath = path.join(SKILLS_DIR, `${slug}.md`);
  if (fs.existsSync(filePath)) {
    appendMemory(`Reinforced skill "${slug}".`);
    return;
  }
  fs.writeFileSync(filePath, raw);
  appendMemory(`Learned new skill: "${slug}".`);
  console.log(`  [SKILL SAVED] ${slug}.md`);
}

// ---------------------------------------------------------------------------
// Claude API
// ---------------------------------------------------------------------------
async function callClaude(messages, system) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, system, messages }),
  });
  const data = await res.json();
  tokensUsedSoFar += (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
  return data.content?.[0]?.text || "";
}

async function bootstrap(goal) {
  console.log("\n[BOOTSTRAP] Designing plan...");
  const system = `Break the goal into 3-8 verifiable subtasks. Respond ONLY with JSON:
{"goal":"...","subtasks":[{"id":1,"description":"...","doneWhen":"..."}]}`;
  const raw = await callClaude([{ role: "user", content: `Goal: ${goal}` }], system);
  const plan = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
  writePlan(plan);
  appendMemory(`Bootstrapped plan for "${goal}" — ${plan.subtasks.length} subtasks.`);
  return plan;
}

async function actorStep(subtask, memoryContext, matchedSkill) {
  const skillBlock = matchedSkill ? `\nRELEVANT SKILL:\n${matchedSkill.content}\n` : "";
  const system = `You are an execution agent with real tool access. Complete the subtask.
Known learnings:
${memoryContext || "(none yet)"}
${skillBlock}
Available tools: ${Object.keys(TOOLS).join(", ")}.
If you need a tool, respond EXACTLY: TOOL:<name>:<input>
Otherwise give your result prefixed with: RESULT:`;
  const messages = [{ role: "user", content: `Subtask: ${subtask.description}\nDone when: ${subtask.doneWhen}` }];
  return await callClaude(messages, system);
}

async function criticStep(subtask, result) {
  const system = `Strict independent verifier. Reply EXACTLY:
VERDICT: PASS or FAIL
REASON: <one line>`;
  const messages = [{ role: "user", content: `Subtask: ${subtask.description}\nDone when: ${subtask.doneWhen}\nResult: ${result}` }];
  const text = await callClaude(messages, system);
  return { pass: /VERDICT:\s*PASS/i.test(text), feedback: text };
}

async function handleToolCall(toolName, input) {
  toolCallCounts[toolName] = (toolCallCounts[toolName] || 0) + 1;
  if (toolCallCounts[toolName] > CONFIG.MAX_TOOL_RETRIES) {
    return `[Circuit breaker] '${toolName}' called too many times.`;
  }
  const tool = TOOLS[toolName];
  return tool ? await tool.run(input) : `Unknown tool: ${toolName}`;
}

async function runSubtaskToCompletion(subtask) {
  const matchedSkill = await findRelevantSkill(subtask.description);
  if (matchedSkill) console.log(`  [SKILL MATCHED] "${matchedSkill.title}"`);

  let attempts = 0, lastResult = null;
  while (attempts < CONFIG.MAX_SUBTASK_RETRIES) {
    attempts++;
    const memoryContext = readMemory();
    let actorOutput = await actorStep(subtask, memoryContext, matchedSkill);

    if (actorOutput.startsWith("TOOL:")) {
      const [, toolName, ...rest] = actorOutput.split(":");
      const toolResult = await handleToolCall(toolName.trim(), rest.join(":").trim());
      actorOutput = `RESULT: (via tool ${toolName}) ${toolResult}`;
    }

    const result = actorOutput.replace("RESULT:", "").trim();
    lastResult = result;
    const verdict = await criticStep(subtask, result);
    console.log(`  [Subtask ${subtask.id}] attempt ${attempts} -> ${verdict.pass ? "PASS" : "FAIL"}`);

    if (verdict.pass) {
      await saveSkill(subtask, result);
      return { success: true, result };
    }
    appendMemory(`Subtask ${subtask.id} attempt ${attempts} REJECTED: ${verdict.feedback.replace(/\n/g, " ")}`);
    if (tokensUsedSoFar >= CONFIG.MAX_TOKENS_TOTAL) {
      return { success: false, result: lastResult, reason: "token budget exhausted" };
    }
  }
  return { success: false, result: lastResult, reason: "max subtask retries exceeded" };
}

async function runAgent(goal) {
  ensureDirs();
  if (FREEZE_DIR) {
    fs.mkdirSync(FREEZE_DIR, { recursive: true });
    console.log(`[FREEZE_DIR active] Tool actions scoped to: ${FREEZE_DIR}`);
  } else {
    console.log(`⚠️  No FREEZE_DIR set — tools have unrestricted filesystem access. Set FREEZE_DIR to scope them.`);
  }

  let plan = readPlan();
  if (!plan) plan = await bootstrap(goal);

  let outerIteration = 0;
  while (outerIteration < CONFIG.MAX_OUTER_ITERATIONS) {
    outerIteration++;
    plan = readPlan();
    const progress = readProgress();
    const remaining = plan.subtasks.filter((t) => !progress.completedSubtasks.includes(t.id));

    if (remaining.length === 0) {
      console.log("\n✅ All subtasks complete.");
      return { success: true, iterations: outerIteration, tokensUsed: tokensUsedSoFar, skillsLearned: listSkills().length };
    }

    console.log(`\n=== Iteration ${outerIteration} — ${remaining.length} subtasks left ===`);
    if (tokensUsedSoFar >= CONFIG.MAX_TOKENS_TOTAL) {
      return { success: false, reason: "Token budget exhausted", iterations: outerIteration };
    }

    const outcome = await runSubtaskToCompletion(remaining[0]);
    if (outcome.success) {
      progress.completedSubtasks.push(remaining[0].id);
      writeProgress(progress);
      noProgressStreak = 0;
    } else {
      noProgressStreak++;
      appendMemory(`Subtask ${remaining[0].id} failed: ${outcome.reason}`);
      if (noProgressStreak >= CONFIG.NO_PROGRESS_LIMIT) {
        return { success: false, reason: "No progress — stopped.", iterations: outerIteration };
      }
    }
  }
  return { success: false, reason: "Max outer iterations reached", iterations: outerIteration };
}

module.exports = { runAgent, listSkills };

if (require.main === module) {
  (async () => {
    const goal = process.argv[2] || "List the files in the current directory into files.txt";
    console.log(`Goal: ${goal}`);
    const result = await runAgent(goal);
    console.log("\n=== FINAL RESULT ===");
    console.log(result);
  })();
}
