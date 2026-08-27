/**
 * ============================================================================
 *  TREE-OF-THOUGHT (ToT) COGNITIVE REFLEXION CORE (2026 ARCHITECTURE)
 *  Ported from DeepSeek Advanced Reasoning & Cognitive Swarm Harness
 *  - 3-Branch Parallel Hypothesis Generation (Architectural exploration)
 *  - Adversarial Critic Scoring (0-100) on Correctness, Safety & Simplicity
 *  - Optimal Branch Synthesis with Ponytail Minimal-Diff Grounding
 * ============================================================================
 */
"use strict";

const { callUniversalLLM } = require("./llm-providers");
const skillEngine = require("./unified-skill-engine");
const { sessionStore } = require("./session-store");

/**
 * Executes a 3-Branch Tree-of-Thought reasoning cycle
 *
 * @param {string} problem - The task, architectural question, or complex bug
 * @param {Object} options - { maxTokens, temperature }
 * @returns {Promise<{ success: boolean, bestBranch: Object, allBranches: Array, finalSolution: string }>}
 */
async function solveWithTreeOfThought(problem, options = {}) {
  console.log(`\n🌲 [TREE-OF-THOUGHT] Exploring hypothesis tree for: "${problem.slice(0, 80)}..."`);

  // Enrich with top skills
  const matchedSkills = skillEngine.routeTask(problem, 3);
  const skillSnippet = matchedSkills.length > 0 
    ? `\n<relevant_skills>\n${matchedSkills.map(s => `[${s.name.toUpperCase()}]: ${s.content_preview}`).join("\n\n")}\n</relevant_skills>`
    : "";

  // -------------------------------------------------------------------------
  // PHASE 1: GENERATE 3 DIVERGENT CANDIDATE APPROACHES
  // -------------------------------------------------------------------------
  const branchPrompt = `You are a Principal Multi-Disciplinary AI Architect.
Explore exactly 3 distinct, high-leverage candidate approaches to solve this problem:
Problem: ${problem}
${skillSnippet}

Format your response strictly as JSON with this exact schema:
{
  "branches": [
    {
      "id": "A",
      "strategy_name": "...",
      "key_mechanism": "...",
      "pros": ["..."],
      "cons": ["..."],
      "preliminary_code_sketch": "..."
    },
    {
      "id": "B",
      "strategy_name": "...",
      "key_mechanism": "...",
      "pros": ["..."],
      "cons": ["..."],
      "preliminary_code_sketch": "..."
    },
    {
      "id": "C",
      "strategy_name": "...",
      "key_mechanism": "...",
      "pros": ["..."],
      "cons": ["..."],
      "preliminary_code_sketch": "..."
    }
  ]
}`;

  console.log("🌱 [ToT PHASE 1] Generating 3 divergent hypothesis branches...");
  const branchRes = await callUniversalLLM(
    [{ role: "user", content: "Generate 3 hypothesis branches." }],
    branchPrompt
  );

  let rawBranchText = (branchRes.content || []).map(p => p.text || "").join("\n");
  let branches = [];

  try {
    const jsonMatch = rawBranchText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, rawBranchText];
    const parsed = JSON.parse(jsonMatch[1].trim());
    branches = parsed.branches || [];
  } catch (_) {
    console.warn("⚠️ [ToT] JSON parsing fallback. Using heuristic branch split.");
    branches = [
      { id: "A", strategy_name: "Direct Optimal Implementation", key_mechanism: rawBranchText.slice(0, 300) }
    ];
  }

  // -------------------------------------------------------------------------
  // PHASE 2: ADVERSARIAL CRITIC SCORING & PRUNING
  // -------------------------------------------------------------------------
  console.log(`⚖️ [ToT PHASE 2] Evaluating ${branches.length} branches with adversarial scoring...`);
  const scoredBranches = [];

  for (const b of branches) {
    const criticPrompt = `You are a Skeptical Lead QA, Security & Performance Auditor.
Evaluate Candidate Branch [${b.id}]: "${b.strategy_name}".
Problem: ${problem}
Proposed Mechanism: ${b.key_mechanism}
Sketch: ${b.preliminary_code_sketch || "N/A"}

Score the candidate strictly out of 100 on:
1. Correctness (0-40)
2. Security & Edge-Case Resilience (0-30)
3. Simplicity & Maintainability (0-30)

Respond in this exact JSON format:
{
  "total_score": 85,
  "verdict": "STRONG CANDIDATE",
  "critique": "..."
}`;

    const criticRes = await callUniversalLLM(
      [{ role: "user", content: `Evaluate branch ${b.id}` }],
      criticPrompt
    );

    const criticRaw = (criticRes.content || []).map(p => p.text || "").join("\n");
    let score = 75;
    let critique = "Evaluated OK";

    try {
      const cMatch = criticRaw.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, criticRaw];
      const cParsed = JSON.parse(cMatch[1].trim());
      score = cParsed.total_score || 75;
      critique = cParsed.critique || critique;
    } catch (_) {}

    console.log(`  -> Branch [${b.id}] (${b.strategy_name}): Score ${score}/100`);
    scoredBranches.push({ ...b, score, critique });
  }

  // Sort by score descending
  scoredBranches.sort((a, b) => b.score - a.score);
  const bestBranch = scoredBranches[0] || { strategy_name: "Direct Solution", id: "A" };

  // -------------------------------------------------------------------------
  // PHASE 3: OPTIMAL SOLUTION SYNTHESIS
  // -------------------------------------------------------------------------
  console.log(`🏆 [ToT PHASE 3] Synthesizing optimal solution from Branch [${bestBranch.id}] (Score: ${bestBranch.score}/100)...`);
  const synthPrompt = `You are ULTRON, the supreme autonomous engineering core.
Synthesize the final, 100% complete production solution for Boss.
Winning Strategy: [${bestBranch.id}] "${bestBranch.strategy_name}" (Score: ${bestBranch.score}/100)
Auditor Recommendations: ${bestBranch.critique}
Original Problem: ${problem}

Rules:
- Deliver complete, production-ready code or plan with zero placeholders.
- Follow Ponytail Minimal-Diff principles.
- Address user strictly as "Boss".`;

  const finalRes = await callUniversalLLM(
    [{ role: "user", content: `Execute winning branch: ${problem}` }],
    synthPrompt
  );

  const finalSolution = (finalRes.content || []).map(p => p.text || "").join("\n").trim();

  // Log ToT milestone to session store
  try {
    sessionStore.logEvent("tot_reflexion_session", {
      role: "assistant",
      content: `ToT Solved: "${problem.slice(0, 60)}" (Winner: Branch ${bestBranch.id} - ${bestBranch.strategy_name})`,
      reasoning: `Selected Branch ${bestBranch.id} with score ${bestBranch.score}/100. Key critique handled: ${bestBranch.critique}`
    });
  } catch (_) {}

  return {
    success: true,
    bestBranch,
    allBranches: scoredBranches,
    finalSolution,
    modelUsed: finalRes.modelUsed
  };
}

module.exports = {
  solveWithTreeOfThought
};
