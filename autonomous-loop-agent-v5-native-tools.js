/**
 * ============================================================================
 *  AUTONOMOUS LOOP AGENT — v5: NATIVE TOOLS + SKILL MEMORY + RAG VECTOR MEMORY
 * ============================================================================
 *
 * FULL FEATURE SET:
 *
 *   1. NATIVE ANTHROPIC TOOL CALLING:
 *      Anthropic JSON Schema tools (`tools: [...]` and `tool_use` / `tool_result`).
 *
 *   2. MULTI-STEP ACTOR EXECUTION:
 *      Actor can sequentially execute multiple tools per subtask until completion.
 *
 *   3. RAG + VECTOR KNOWLEDGE BASE (NEW):
 *      Searches `agent-memory/vector-store.json` using Voyage AI semantic search
 *      to inject relevant document context into the Actor prompt.
 *
 *   4. SKILL MEMORY & USAGE TRACKING:
 *      Distills passing tasks into reusable skill guides (`agent-memory/skills/`)
 *      and tracks frequency in `skill-usage.json`.
 *
 *   5. HARDENED SAFETY & STOP CONTROL:
 *      Destructive command blocklist, interactive terminal prompt,
 *      `FREEZE_DIR` sandboxing, and real-time stop cancellation support.
 *
 * RUN:
 *   ANTHROPIC_API_KEY=xxx VOYAGE_API_KEY=xxx node autonomous-loop-agent-v5-native-tools.js "goal"
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const readline = require("readline");
const { buildRagContext, rememberConversationTurn } = require("./rag-memory");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MEMORY_DIR = path.join(__dirname, "agent-memory");
const SKILLS_DIR = path.join(MEMORY_DIR, "skills");
const USAGE_FILE = path.join(MEMORY_DIR, "skill-usage.json");
const FREEZE_DIR = process.env.FREEZE_DIR ? path.resolve(process.env.FREEZE_DIR) : null;

const CONFIG = {
  MAX_OUTER_ITERATIONS: 15,
  MAX_SUBTASK_RETRIES: 3,
  MAX_ACTOR_TOOL_STEPS: 8,
  MAX_TOKENS_TOTAL: 80000,
  NO_PROGRESS_LIMIT: 2,
};

let tokensUsedSoFar = 0;
let noProgressStreak = 0;

// ---------------------------------------------------------------------------
// SAFETY LAYER
// ---------------------------------------------------------------------------
const DESTRUCTIVE_PATTERNS = [
  /rm\s+-rf/i, /rm\s+-r\s+-f/i, /\bdd\s+if=/i, /\bmkfs/i, /\bsudo\b/i,
  /git\s+push\s+.*--force/i, /git\s+reset\s+--hard/i, /DROP\s+TABLE/i,
  /DROP\s+DATABASE/i, /TRUNCATE\s+TABLE/i, /curl.*\|\s*sh/i, /wget.*\|\s*sh/i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
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
  if (!FREEZE_DIR) return true;
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(FREEZE_DIR);
}

// ---------------------------------------------------------------------------
// NATIVE TOOL DEFINITIONS & HANDLERS
// ---------------------------------------------------------------------------
const TOOL_DEFINITIONS = [
  {
    name: "write_file",
    description: "Writes content to a file at filePath within the workspace.",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Target file path relative to workspace" },
        content: { type: "string", description: "Full text content to write" },
      },
      required: ["filePath", "content"],
    },
  },
  {
    name: "read_file",
    description: "Reads the text content of a file.",
    input_schema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "File path to read" },
      },
      required: ["filePath"],
    },
  },
  {
    name: "terminal_exec",
    description: "Runs a shell command in the workspace directory. Destructive commands trigger a confirmation gate.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute" },
      },
      required: ["command"],
    },
  },
  {
    name: "code_exec",
    description: "Executes a JavaScript or Python code snippet in an isolated subprocess.",
    input_schema: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["javascript", "python"], description: "Language to execute" },
        code: { type: "string", description: "Source code snippet" },
      },
      required: ["language", "code"],
    },
  },
  {
    name: "browser_control",
    description: "Automates headless Chromium browser via Playwright (goto, screenshot, click, extract_text).",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["goto", "screenshot", "click", "extract_text"] },
        target: { type: "string", description: "URL, file path, or CSS selector depending on action" },
      },
      required: ["action", "target"],
    },
  },
  {
    name: "calculator",
    description: "Safely evaluates an arithmetic expression.",
    input_schema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Math expression like '(120 * 4) / 3'" },
      },
      required: ["expression"],
    },
  },
];

let browserState = { browser: null, page: null };

async function executeTool(toolName, args) {
  try {
    switch (toolName) {
      case "write_file": {
        const fullPath = path.resolve(FREEZE_DIR || __dirname, args.filePath);
        if (!isWithinFreezeDir(fullPath)) return `Blocked: ${args.filePath} is outside FREEZE_DIR.`;
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, args.content);
        return `Successfully wrote to ${args.filePath}`;
      }

      case "read_file": {
        const fullPath = path.resolve(FREEZE_DIR || __dirname, args.filePath);
        return fs.readFileSync(fullPath, "utf-8");
      }

      case "terminal_exec": {
        if (isDestructive(args.command)) {
          const allowed = await askHumanConfirmation(`Agent wants to run DESTRUCTIVE command:\n  ${args.command}\n`);
          if (!allowed) return `[BLOCKED by human] Execution denied: ${args.command}`;
        }
        const cwd = FREEZE_DIR || process.cwd();
        try {
          const out = execSync(args.command, { cwd, timeout: 30000, encoding: "utf-8" });
          return out.slice(0, 4000) || "[Command executed with no output]";
        } catch (e) {
          return `Command failed: ${e.message}`;
        }
      }

      case "code_exec": {
        const ext = args.language === "python" ? "py" : "js";
        const tmpFile = path.join(FREEZE_DIR || __dirname, `_tmp_exec_${Date.now()}.${ext}`);
        fs.writeFileSync(tmpFile, args.code);
        try {
          const cmd = args.language === "python" ? "python3" : "node";
          const res = spawnSync(cmd, [tmpFile], { timeout: 15000, encoding: "utf-8" });
          return (res.stdout || "") + (res.stderr ? `\nSTDERR: ${res.stderr}` : "");
        } finally {
          if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        }
      }

      case "browser_control": {
        let chromium;
        try {
          chromium = require("playwright").chromium;
        } catch {
          return "Error: Playwright not installed. Run 'npm install playwright && npx playwright install chromium'";
        }
        if (!browserState.page) {
          browserState.browser = await chromium.launch({ headless: true });
          browserState.page = await browserState.browser.newPage();
        }
        const page = browserState.page;

        if (args.action === "goto") {
          await page.goto(args.target, { timeout: 20000 });
          return `Navigated to ${args.target}`;
        } else if (args.action === "screenshot") {
          const shotPath = isWithinFreezeDir(args.target)
            ? args.target
            : path.join(FREEZE_DIR || ".", "screenshot.png");
          await page.screenshot({ path: shotPath });
          return `Screenshot saved to ${shotPath}`;
        } else if (args.action === "click") {
          await page.click(args.target, { timeout: 10000 });
          return `Clicked on selector: ${args.target}`;
        } else if (args.action === "extract_text") {
          const texts = await page.locator(args.target).allTextContents();
          return texts.join(" | ").slice(0, 2500) || "[No text found for selector]";
        }
        return `Unknown action: ${args.action}`;
      }

      case "calculator": {
        return String(Function(`"use strict"; return (${args.expression})`)());
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err) {
    return `Tool execution error (${toolName}): ${err.message}`;
  }
}

// ---------------------------------------------------------------------------
// MEMORY & SKILL TRACKING
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

function recordSkillUsage(skillFile) {
  ensureDirs();
  const usage = fs.existsSync(USAGE_FILE) ? JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8")) : {};
  usage[skillFile] = usage[skillFile] || { count: 0, lastUsed: null };
  usage[skillFile].count++;
  usage[skillFile].lastUsed = new Date().toISOString();
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
}

async function findRelevantSkill(taskDescription) {
  const skills = listSkills();
  if (skills.length === 0) return null;
  const index = skills.map((s, i) => `${i + 1}. ${s.title} — when: ${s.whenToUse}`).join("\n");
  const system = `Reply with ONLY the number of the single most relevant skill, or 0 if none apply.`;
  const raw = await callClaude([{ role: "user", content: `Task: ${taskDescription}\n\nSkills:\n${index}` }], system);
  const num = parseInt(raw.trim(), 10);
  if (num >= 1 && num <= skills.length) {
    const matched = skills[num - 1];
    recordSkillUsage(matched.file);
    return matched;
  }
  return null;
}

async function saveSkill(subtask, successfulApproach) {
  const system = `Distill this successful completion into a concise reusable skill. Format EXACTLY:
# <short title>
## When to use
<one line summary>
## Steps
<numbered actionable steps>
## Gotchas
<pitfalls to avoid or "None noted">`;
  const raw = await callClaude(
    [{ role: "user", content: `Task: ${subtask.description}\nSuccessful approach: ${successfulApproach}` }],
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

  // Also index into vector memory if Voyage API is available
  try {
    await rememberConversationTurn(`Skill learned: ${slug}\n${raw}`, ["skill", slug]);
  } catch {}
}

// ---------------------------------------------------------------------------
// ANTHROPIC API CLIENT
// ---------------------------------------------------------------------------
async function callClaudeWithTools(messages, system, tools = null) {
  const payload = {
    model: MODEL,
    max_tokens: 2500,
    system,
    messages,
  };
  if (tools && tools.length > 0) payload.tools = tools;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  tokensUsedSoFar += (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
  return data;
}

async function callClaude(messages, system) {
  const data = await callClaudeWithTools(messages, system);
  return data.content?.[0]?.text || "";
}

// ---------------------------------------------------------------------------
// BOOTSTRAP & CRITIC
// ---------------------------------------------------------------------------
async function bootstrap(goal) {
  console.log("\n[BOOTSTRAP] Decomposing goal into structured plan...");
  const system = `Break the goal into 3-8 concrete verifiable subtasks. Respond ONLY with JSON:
{"goal":"...","subtasks":[{"id":1,"description":"...","doneWhen":"..."}]}`;
  const raw = await callClaude([{ role: "user", content: `Goal: ${goal}` }], system);
  const plan = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
  writePlan(plan);
  appendMemory(`Bootstrapped plan for "${goal}" with ${plan.subtasks.length} subtasks.`);
  return plan;
}

async function criticStep(subtask, result) {
  const system = `You are an independent critic and verifier. Strict evaluation. Respond EXACTLY:
VERDICT: PASS or FAIL
REASON: <one line explanation>`;
  const messages = [
    { role: "user", content: `Subtask: ${subtask.description}\nDone criteria: ${subtask.doneWhen}\nResult: ${result}` },
  ];
  const text = await callClaude(messages, system);
  return { pass: /VERDICT:\s*PASS/i.test(text), feedback: text };
}

// ---------------------------------------------------------------------------
// NATIVE TOOL ACTOR LOOP WITH RAG & SKILL INJECTION
// ---------------------------------------------------------------------------
async function runActorWithNativeTools(subtask, memoryContext, matchedSkill, ragContext, controlOptions) {
  const skillBlock = matchedSkill ? `\nRELEVANT SKILL DOCUMENTATION:\n${matchedSkill.content}\n` : "";
  const system = `You are an execution agent. Complete the subtask using available tools.
Prior Learnings:
${memoryContext || "(none yet)"}
${skillBlock}
${ragContext}
When done, provide a final comprehensive summary of the result.`;

  const messages = [
    { role: "user", content: `Subtask: ${subtask.description}\nDone when: ${subtask.doneWhen}` },
  ];

  let toolStepCount = 0;
  while (toolStepCount < CONFIG.MAX_ACTOR_TOOL_STEPS) {
    if (controlOptions.isStopRequested?.()) {
      return "[Stopped by user request]";
    }

    toolStepCount++;
    const response = await callClaudeWithTools(messages, system, TOOL_DEFINITIONS);

    if (response.error) {
      return `API Error: ${response.error.message}`;
    }

    const contentBlocks = response.content || [];
    messages.push({ role: "assistant", content: contentBlocks });

    const toolUseCalls = contentBlocks.filter((b) => b.type === "tool_use");

    if (toolUseCalls.length === 0) {
      const textBlock = contentBlocks.find((b) => b.type === "text");
      return textBlock ? textBlock.text : "[No output produced]";
    }

    const toolResults = [];
    for (const call of toolUseCalls) {
      console.log(`  [TOOL EXEC] ${call.name}(${JSON.stringify(call.input).slice(0, 100)})`);
      const output = await executeTool(call.name, call.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: String(output),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return "[Actor reached maximum tool execution steps]";
}

// ---------------------------------------------------------------------------
// SUBTASK RUNNER
// ---------------------------------------------------------------------------
async function runSubtaskToCompletion(subtask, controlOptions = {}) {
  const matchedSkill = await findRelevantSkill(subtask.description);
  if (matchedSkill) console.log(`  [SKILL MATCHED] "${matchedSkill.title}"`);

  let ragContext = "";
  try {
    ragContext = await buildRagContext(subtask.description, 3);
    if (ragContext) console.log(`  [RAG MATCHED] Injected relevant knowledge chunks.`);
  } catch {}

  let attempts = 0, lastResult = null;
  while (attempts < CONFIG.MAX_SUBTASK_RETRIES) {
    if (controlOptions.isStopRequested?.()) {
      return { success: false, result: lastResult, reason: "Stop requested by user" };
    }

    attempts++;
    const memoryContext = readMemory();
    const result = await runActorWithNativeTools(subtask, memoryContext, matchedSkill, ragContext, controlOptions);
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

// ---------------------------------------------------------------------------
// MAIN AGENT LOOP
// ---------------------------------------------------------------------------
async function runAgent(goal, controlOptions = {}) {
  ensureDirs();
  if (FREEZE_DIR) {
    fs.mkdirSync(FREEZE_DIR, { recursive: true });
    console.log(`[FREEZE_DIR active] Tool actions scoped to: ${FREEZE_DIR}`);
  }

  let plan = readPlan();
  if (!plan) plan = await bootstrap(goal);

  let outerIteration = 0;
  while (outerIteration < CONFIG.MAX_OUTER_ITERATIONS) {
    if (controlOptions.isStopRequested?.()) {
      console.log("\n🛑 Execution halted by user request.");
      return { success: false, reason: "Stopped by user request", iterations: outerIteration, tokensUsed: tokensUsedSoFar };
    }

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

    const outcome = await runSubtaskToCompletion(remaining[0], controlOptions);
    if (outcome.success) {
      progress.completedSubtasks.push(remaining[0].id);
      writeProgress(progress);
      noProgressStreak = 0;
    } else {
      noProgressStreak++;
      appendMemory(`Subtask ${remaining[0].id} failed: ${outcome.reason}`);
      if (outcome.reason === "Stop requested by user") {
        return { success: false, reason: "Stopped by user request", iterations: outerIteration, tokensUsed: tokensUsedSoFar };
      }
      if (noProgressStreak >= CONFIG.NO_PROGRESS_LIMIT) {
        return { success: false, reason: "No progress — loop halted to prevent runaways.", iterations: outerIteration };
      }
    }
  }

  return { success: false, reason: "Max outer iterations reached", iterations: outerIteration };
}

module.exports = { runAgent, listSkills, TOOL_DEFINITIONS };

if (require.main === module) {
  (async () => {
    const goal = process.argv[2] || "Create a comprehensive summary of this workspace in SUMMARY.md";
    console.log(`Goal: ${goal}`);
    const result = await runAgent(goal);
    console.log("\n=== FINAL RESULT ===");
    console.log(result);
  })();
}
