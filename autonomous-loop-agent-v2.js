/**
 * ============================================================================
 *  AUTONOMOUS LOOP AGENT — v2: + SKILL MEMORY SYSTEM
 * ============================================================================
 *
 * NEW IN v2 (builds on autonomous-loop-agent.js):
 *
 *   SKILL MEMORY — This is the Hermes-style "gets smarter over time" feature.
 *
 *   How it works:
 *     1. BEFORE working a subtask, the agent scans its skill library
 *        (agent-memory/skills/*.md) and asks: "is any existing skill
 *        relevant to this task?" If yes, that skill's content is injected
 *        into the Actor's context — so it doesn't rediscover the approach
 *        from scratch.
 *     2. AFTER a subtask PASSES the critic, the agent writes a new skill
 *        file distilling what worked: title, when to use it, the steps,
 *        and gotchas to avoid. This is NOT the raw transcript — it's a
 *        compressed, reusable "how-to" the same way a human would write
 *        documentation after solving something the hard way once.
 *     3. Skills accumulate over time. Task #50 in a familiar domain runs
 *        faster and more reliably than task #1, because the agent is
 *        reading its own accumulated know-how, not starting cold.
 *
 *   Honest limits:
 *     - Skill matching here uses a cheap LLM call over skill TITLES only
 *       (not full embeddings/vector search) — fine for tens of skills,
 *       will need a real vector store (e.g. pgvector, Chroma) past ~200 skills.
 *     - A bad skill (learned from a fluke pass) can mislead future runs.
 *       Consider periodic skill review/pruning — see pruneSkills() stub below.
 *
 * RUN:
 *   ANTHROPIC_API_KEY=xxx node autonomous-loop-agent-v2.js "your goal"
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MEMORY_DIR = path.join(__dirname, "agent-memory");
const SKILLS_DIR = path.join(MEMORY_DIR, "skills");

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

const TOOLS = {
  write_file: {
    description: "Writes content to a file. Input: 'path|||content'",
    run: async (input) => {
      const [filePath, ...rest] = input.split("|||");
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
};

// ---------------------------------------------------------------------------
// MEMORY (plan / progress / mistakes)
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
  return fs.existsSync(p)
    ? JSON.parse(fs.readFileSync(p, "utf-8"))
    : { completedSubtasks: [] };
}
function writeProgress(progress) {
  fs.writeFileSync(path.join(MEMORY_DIR, "progress.json"), JSON.stringify(progress, null, 2));
}

// ---------------------------------------------------------------------------
// SKILL MEMORY SYSTEM
// ---------------------------------------------------------------------------
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

// Cheap relevance check: send only titles+when-to-use (not full content) to keep it fast/cheap
async function findRelevantSkill(taskDescription) {
  const skills = listSkills();
  if (skills.length === 0) return null;

  const index = skills
    .map((s, i) => `${i + 1}. ${s.title} — use when: ${s.whenToUse}`)
    .join("\n");

  const system = `Given a task and a numbered list of available skills, reply with ONLY
the number of the single most relevant skill, or 0 if none genuinely apply.
No explanation, just the number.`;

  const raw = await callClaude(
    [{ role: "user", content: `Task: ${taskDescription}\n\nSkills:\n${index}` }],
    system
  );
  const num = parseInt(raw.trim(), 10);
  if (!num || num < 1 || num > skills.length) return null;
  return skills[num - 1];
}

async function saveSkill(subtask, successfulApproach) {
  const system = `Distill the following successful task completion into a reusable
skill file. Be concise — this will be re-read before similar future tasks.
Format EXACTLY:
# <short skill title>
## When to use
<one line: what kind of task this applies to>
## Steps
<numbered steps that worked>
## Gotchas
<pitfalls to avoid, if any — else write "None noted">`;

  const raw = await callClaude(
    [
      {
        role: "user",
        content: `Task that was completed: ${subtask.description}\nSuccessful approach/result: ${successfulApproach}`,
      },
    ],
    system
  );

  ensureDirs();
  const slug = (raw.match(/^#\s*(.+)/m)?.[1] || `skill-${Date.now()}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);
  const filePath = path.join(SKILLS_DIR, `${slug}.md`);

  // Don't overwrite an existing skill blindly — merge signal into memory instead
  if (fs.existsSync(filePath)) {
    appendMemory(`Reinforced existing skill "${slug}" (used successfully again).`);
    return;
  }
  fs.writeFileSync(filePath, raw);
  appendMemory(`Learned new skill: "${slug}" from subtask "${subtask.description}".`);
  console.log(`  [SKILL SAVED] ${slug}.md`);
}

// Stub — run this periodically (e.g. weekly) to remove skills that keep
// getting contradicted by newer, better approaches. Not wired into the main
// loop by default — call manually: node -e "require('./v2').pruneSkills()"
function pruneSkills() {
  console.log("[pruneSkills] Not yet implemented — review agent-memory/skills/ manually for now.");
}

// ---------------------------------------------------------------------------
// Claude API call
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

// ---------------------------------------------------------------------------
// BOOTSTRAP
// ---------------------------------------------------------------------------
async function bootstrap(goal) {
  console.log("\n[BOOTSTRAP] Designing plan for goal...");
  const system = `Break the goal into 3-8 concrete, verifiable subtasks. Respond ONLY
with JSON: {"goal":"...","subtasks":[{"id":1,"description":"...","doneWhen":"..."}]}`;
  const raw = await callClaude([{ role: "user", content: `Goal: ${goal}` }], system);
  const plan = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
  writePlan(plan);
  appendMemory(`Bootstrapped plan for "${goal}" — ${plan.subtasks.length} subtasks.`);
  return plan;
}

// ---------------------------------------------------------------------------
// ACTOR — now receives an optional matched skill as extra context
// ---------------------------------------------------------------------------
async function actorStep(subtask, memoryContext, matchedSkill) {
  const skillBlock = matchedSkill
    ? `\nRELEVANT SKILL FOUND (apply this — it worked before):\n${matchedSkill.content}\n`
    : "";

  const system = `You are an execution agent. Complete the subtask below.
Known learnings from previous attempts:
${memoryContext || "(none yet)"}
${skillBlock}
Available tools: ${Object.keys(TOOLS).join(", ")}.
If you need a tool, respond EXACTLY: TOOL:<name>:<input>
Otherwise give your result prefixed with: RESULT:`;

  const messages = [
    { role: "user", content: `Subtask: ${subtask.description}\nDone when: ${subtask.doneWhen}` },
  ];
  return await callClaude(messages, system);
}

async function criticStep(subtask, result) {
  const system = `You are a strict, independent verifier. Reply EXACTLY:
VERDICT: PASS or FAIL
REASON: <one line>`;
  const messages = [
    { role: "user", content: `Subtask: ${subtask.description}\nDone when: ${subtask.doneWhen}\nResult: ${result}` },
  ];
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

// ---------------------------------------------------------------------------
// Subtask runner — checks skill memory FIRST, saves a skill on success
// ---------------------------------------------------------------------------
async function runSubtaskToCompletion(subtask) {
  const matchedSkill = await findRelevantSkill(subtask.description);
  if (matchedSkill) console.log(`  [SKILL MATCHED] Using "${matchedSkill.title}"`);

  let attempts = 0;
  let lastResult = null;

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
      await saveSkill(subtask, result); // learn from this success
      return { success: true, result };
    } else {
      appendMemory(`Subtask ${subtask.id} attempt ${attempts} REJECTED: ${verdict.feedback.replace(/\n/g, " ")}`);
    }

    if (tokensUsedSoFar >= CONFIG.MAX_TOKENS_TOTAL) {
      return { success: false, result: lastResult, reason: "token budget exhausted" };
    }
  }
  return { success: false, result: lastResult, reason: "max subtask retries exceeded" };
}

// ---------------------------------------------------------------------------
// MAIN LOOP
// ---------------------------------------------------------------------------
async function runAgent(goal) {
  ensureDirs();
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
        return { success: false, reason: "No progress — stopped to avoid runaway loop.", iterations: outerIteration };
      }
    }
  }
  return { success: false, reason: "Max outer iterations reached", iterations: outerIteration };
}

module.exports = { runAgent, pruneSkills, listSkills };

if (require.main === module) {
  (async () => {
    const goal = process.argv[2] || "Write a summary of what this repo does into SUMMARY.md";
    console.log(`Goal: ${goal}`);
    console.log(`Existing skills in memory: ${listSkills().length}`);
    const result = await runAgent(goal);
    console.log("\n=== FINAL RESULT ===");
    console.log(result);
  })();
}
