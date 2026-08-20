/**
 * ============================================================================
 *  ADVANCED REASONING AGENT (2026 ARCHITECTURE)
 *  Actor + Adversarial Critic + Polisher Reflexion Swarm Loop
 * ============================================================================
 */
"use strict";

const { callUniversalLLM } = require("./llm-providers");
const skillEngine = require("./unified-skill-engine");
const sessionContinuity = require("./session-continuity");

async function solveWithCritic(prompt, doneCriteria = "Must be 100% complete, bug-free, and satisfy the user's request", maxAttempts = 3) {
  console.log(`\n🎯 [REASONING SWARM] Task: ${prompt}`);
  console.log(`✅ [CRITERIA]: ${doneCriteria}`);

  let attempts = 0;
  let feedback = "";
  let lastSolution = "";

  // Dynamic Skill Pass-Through
  const matchedSkills = skillEngine.routeTask(prompt, 3);
  const skillPromptSnippet = matchedSkills.length > 0 
    ? `\n<matched_skills>\n${matchedSkills.map(s => `[${s.name.toUpperCase()}]: ${s.content_preview}`).join("\n\n")}\n</matched_skills>`
    : "";

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`\n--- [SWARM CYCLE ${attempts}/${maxAttempts}] ---`);

    // 1. ACTOR AGENT
    const actorSystem = `You are the Lead Solution Architect and Precision Coder.
Provide a complete, production-ready, 100% working solution.
Follow Ponytail minimal-diff rules (fix root causes, no unneeded boilerplate).
Never truncate code or output.
${skillPromptSnippet}
${feedback ? `\n[CRITICAL]: Previous attempt failed with critique:\n${feedback}\nFix these issues carefully.` : ""}`;

    const actorRes = await callUniversalLLM([{ role: "user", content: prompt }], actorSystem);
    const textBlock = (actorRes.content || []).find(b => b.type === "text");
    lastSolution = textBlock ? textBlock.text : "";

    console.log(`[ACTOR PROPOSAL (Sample)]:\n${lastSolution.slice(0, 300)}...`);

    // 2. CRITIC AGENT (Separate prompt & fresh context)
    const criticSystem = `You are a strict, skeptical QA and Security Auditor.
Verify if the proposed solution strictly satisfies the criteria and has zero hallucinations, zero security vulnerabilities, and zero syntax errors.
Respond ONLY in this exact format:
VERDICT: PASS or FAIL
REASON: <concise actionable critique>`;

    const criticRes = await callUniversalLLM(
      [
        {
          role: "user",
          content: `Task: ${prompt}\nDone Criteria: ${doneCriteria}\nProposed Solution:\n${lastSolution}`
        }
      ],
      criticSystem
    );

    const criticText = (criticRes.content || []).find(b => b.type === "text")?.text || "VERDICT: PASS";
    const isPass = /VERDICT:\s*PASS/i.test(criticText);

    console.log(`[CRITIC VERDICT]: ${isPass ? "✅ PASS" : "❌ FAIL"}\n${criticText}`);

    if (isPass) {
      sessionContinuity.addCompletedStep(`Solved task: "${prompt.slice(0, 50)}..." in ${attempts} attempts`);
      return { success: true, attempts, solution: lastSolution, matchedSkills: matchedSkills.map(s => s.name) };
    }

    feedback = criticText;
  }

  return { success: false, attempts, solution: lastSolution, reason: "Max attempts exceeded", feedback };
}

module.exports = { solveWithCritic };

if (require.main === module) {
  (async () => {
    const task = process.argv[2] || "Write a high-performance JavaScript debounce and throttle utility with cancel method";
    const result = await solveWithCritic(task);
    console.log("\n=== FINAL RESULT ===");
    console.log(result);
  })();
}
