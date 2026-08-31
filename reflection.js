/**
 * ============================================================================
 *  [4/10] REFLECTION / SELF-CRITIQUE (Reflexion pattern)
 *  Used in AutoGPT, Reflexion-paper-style agents, and most serious
 *  production agents: before handing a final answer back, the agent
 *  critiques its own work against the original goal and either approves it
 *  or flags specific problems. This catches silent failures (wrong
 *  assumption, skipped requirement, hallucinated fact) that a single
 *  generation pass won't self-notice.
 * ============================================================================
 */
"use strict";

/**
 * @param {function} callLLM - an async (messages, system) => { text } function,
 *   e.g. wired to this project's callUniversalLLM/callGemini/callOllama.
 * @param {string} goal - the original task/goal the answer is supposed to satisfy.
 * @param {string} candidateAnswer - the answer/result to critique.
 * @returns {Promise<{approved: boolean, issues: string[], revisedGuidance: string}>}
 */
async function reflect(callLLM, goal, candidateAnswer) {
  const system = `You are a strict, independent reviewer. You did NOT write the candidate answer below — you are checking someone else's work against the stated goal.
Check for: (1) does it actually satisfy the goal, (2) any unstated assumptions, (3) any factual claims that look unverified/hallucinated, (4) anything the goal asked for that's missing.
Respond ONLY with JSON: {"approved": true|false, "issues": ["...", ...], "revisedGuidance": "one sentence on what to fix, or empty string if approved"}`;

  const userMsg = `GOAL:\n${goal}\n\nCANDIDATE ANSWER:\n${String(candidateAnswer).slice(0, 4000)}`;

  try {
    const res = await callLLM([{ role: "user", content: userMsg }], system);
    const text = res?.text || res?.content?.[0]?.text || String(res);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { approved: true, issues: [], revisedGuidance: "" }; // fail open on parse issues — reflection is a bonus check, not a gate that should block delivery on its own error
    const parsed = JSON.parse(match[0]);
    return {
      approved: parsed.approved !== false,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      revisedGuidance: parsed.revisedGuidance || ""
    };
  } catch (_) {
    return { approved: true, issues: [], revisedGuidance: "" };
  }
}

/**
 * Run up to maxRounds of generate -> reflect -> (if rejected) regenerate.
 * @param {function} generate - async (guidance) => string, produces a candidate answer.
 *   `guidance` is "" on the first call, then the reflection's revisedGuidance on retries.
 */
async function reflectAndRefine(callLLM, goal, generate, maxRounds = 2) {
  let guidance = "";
  let answer = await generate(guidance);
  for (let round = 0; round < maxRounds; round++) {
    const verdict = await reflect(callLLM, goal, answer);
    if (verdict.approved) return { answer, rounds: round + 1, issues: [] };
    guidance = verdict.revisedGuidance;
    answer = await generate(guidance);
  }
  return { answer, rounds: maxRounds, issues: ["Max reflection rounds reached without full approval."] };
}

module.exports = { reflect, reflectAndRefine };
