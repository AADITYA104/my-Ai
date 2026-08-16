/**
 * ============================================================================
 *  AUTONOMOUS LOOP AGENT — v1: Self-Bootstrapping Planner & Actor-Critic Loop
 * ============================================================================
 *
 * Core Architecture:
 *   1. Bootstrap: Decomposes human goal into atomic, verifiable subtasks (plan.json).
 *   2. State Persistence: Tracks progress across iterations in progress.json & memory.md.
 *   3. Fresh Execution: Reads disk on every iteration to avoid context window degradation.
 *   4. Actor-Critic: Subtasks only marked complete when an independent critic gives PASS.
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MEMORY_DIR = path.join(__dirname, "agent-memory");

const CONFIG = {
  MAX_OUTER_ITERATIONS: 12,
  MAX_SUBTASK_RETRIES: 3,
  MAX_TOKENS_TOTAL: 50000,
  NO_PROGRESS_LIMIT: 2,
};

let tokensUsedSoFar = 0;
let noProgressStreak = 0;

function ensureDirs() {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
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
  console.log("\n[BOOTSTRAP] Formulating verifiable subtasks...");
  const system = `Break the user goal into 3-6 discrete, testable subtasks. Respond ONLY with JSON:
{"goal":"...","subtasks":[{"id":1,"description":"...","doneWhen":"..."}]}`;
  const raw = await callClaude([{ role: "user", content: `Goal: ${goal}` }], system);
  const plan = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
  writePlan(plan);
  appendMemory(`Bootstrapped plan for "${goal}" (${plan.subtasks.length} subtasks).`);
  return plan;
}

async function actorStep(subtask, memoryContext) {
  const system = `You are an execution agent. Complete the subtask.
Learn from past feedback:
${memoryContext || "(none yet)"}
Provide your solution prefixed with: RESULT:`;
  const messages = [{ role: "user", content: `Subtask: ${subtask.description}\nDone when: ${subtask.doneWhen}` }];
  return await callClaude(messages, system);
}

async function criticStep(subtask, result) {
  const system = `You are an independent strict critic. Respond ONLY with:
VERDICT: PASS or FAIL
REASON: <one line>`;
  const messages = [
    { role: "user", content: `Subtask: ${subtask.description}\nDone when: ${subtask.doneWhen}\nResult: ${result}` },
  ];
  const text = await callClaude(messages, system);
  return { pass: /VERDICT:\s*PASS/i.test(text), feedback: text };
}

async function runSubtask(subtask) {
  let attempts = 0;
  let lastResult = null;

  while (attempts < CONFIG.MAX_SUBTASK_RETRIES) {
    attempts++;
    const memory = readMemory();
    const output = await actorStep(subtask, memory);
    const result = output.replace("RESULT:", "").trim();
    lastResult = result;

    const verdict = await criticStep(subtask, result);
    console.log(`  [Subtask ${subtask.id}] Attempt ${attempts} -> ${verdict.pass ? "PASS" : "FAIL"}`);

    if (verdict.pass) {
      appendMemory(`Subtask ${subtask.id} PASSED on attempt ${attempts}.`);
      return { success: true, result };
    }
    appendMemory(`Subtask ${subtask.id} attempt ${attempts} FAILED: ${verdict.feedback.replace(/\n/g, " ")}`);
    if (tokensUsedSoFar >= CONFIG.MAX_TOKENS_TOTAL) {
      return { success: false, result: lastResult, reason: "Token budget exceeded" };
    }
  }

  return { success: false, result: lastResult, reason: "Max subtask retries reached" };
}

async function runAgent(goal) {
  ensureDirs();
  let plan = readPlan() || (await bootstrap(goal));
  let outerIteration = 0;

  while (outerIteration < CONFIG.MAX_OUTER_ITERATIONS) {
    outerIteration++;
    plan = readPlan();
    const progress = readProgress();
    const remaining = plan.subtasks.filter((t) => !progress.completedSubtasks.includes(t.id));

    if (remaining.length === 0) {
      console.log("\n✅ All subtasks successfully finished!");
      return { success: true, iterations: outerIteration, tokensUsed: tokensUsedSoFar };
    }

    console.log(`\n=== Iteration ${outerIteration} (${remaining.length} subtasks remaining) ===`);
    const outcome = await runSubtask(remaining[0]);

    if (outcome.success) {
      progress.completedSubtasks.push(remaining[0].id);
      writeProgress(progress);
      noProgressStreak = 0;
    } else {
      noProgressStreak++;
      if (noProgressStreak >= CONFIG.NO_PROGRESS_LIMIT) {
        return { success: false, reason: "No progress limit reached", iterations: outerIteration };
      }
    }
  }

  return { success: false, reason: "Max outer iterations reached", iterations: outerIteration };
}

module.exports = { runAgent };

if (require.main === module) {
  (async () => {
    const goal = process.argv[2] || "Draft a production deployment readiness checklist";
    console.log(`Goal: ${goal}`);
    const result = await runAgent(goal);
    console.log("\n=== FINAL RESULT ===");
    console.log(result);
  })();
}
