/**
 * ============================================================================
 *  ADVANCED REASONING AGENT — Core Actor + Critic Architecture
 * ============================================================================
 *
 * Demonstrates the foundation pattern of multi-turn autonomous reasoning:
 *   1. Actor: Proposes an implementation, plan, or answer.
 *   2. Critic: Evaluates strict correctness, edge cases, and done-criteria.
 *   3. Refinement Loop: Iterates until verdict is PASS or max retries exceeded.
 * ============================================================================
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

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
  return data.content?.[0]?.text || "";
}

async function solveWithCritic(prompt, doneCriteria, maxAttempts = 3) {
  console.log(`\n🎯 Task: ${prompt}`);
  console.log(`✅ Criteria: ${doneCriteria}`);

  let attempts = 0;
  let feedback = "";
  let lastSolution = "";

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`\n--- Attempt ${attempts}/${maxAttempts} ---`);

    const actorSystem = `You are a precision problem solver. Provide a complete, production-ready solution.
${feedback ? `\nPrevious attempt failed with critique:\n${feedback}\nFix these issues carefully.` : ""}`;

    lastSolution = await callClaude([{ role: "user", content: prompt }], actorSystem);
    console.log(`[Actor Proposed Solution]:\n${lastSolution.slice(0, 300)}...`);

    const criticSystem = `You are a strict, skeptical QA auditor. Verify if the proposed solution satisfies the criteria.
Respond ONLY with:
VERDICT: PASS or FAIL
REASON: <concise actionable critique>`;

    const critique = await callClaude(
      [
        {
          role: "user",
          content: `Task: ${prompt}\nCriteria: ${doneCriteria}\nProposed Solution:\n${lastSolution}`,
        },
      ],
      criticSystem
    );

    const isPass = /VERDICT:\s*PASS/i.test(critique);
    console.log(`[Critic Verdict]: ${isPass ? "✅ PASS" : "❌ FAIL"}\n${critique}`);

    if (isPass) {
      return { success: true, attempts, solution: lastSolution };
    }

    feedback = critique;
  }

  return { success: false, attempts, solution: lastSolution, reason: "Max attempts exceeded" };
}

module.exports = { solveWithCritic };

if (require.main === module) {
  (async () => {
    const task = process.argv[2] || "Write a robust JavaScript regex that validates ISO-8601 UTC timestamps";
    const criteria = process.argv[3] || "Must handle YYYY-MM-DDTHH:mm:ss.sssZ and reject invalid months or days";
    const result = await solveWithCritic(task, criteria);
    console.log("\n=== FINAL RESULT ===");
    console.log(result);
  })();
}
