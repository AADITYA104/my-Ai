/**
 * ============================================================================
 *  [10/10] CONFIDENCE-BASED ESCALATION
 *  Production decision-making agents don't treat every answer as equally
 *  certain — they self-rate confidence and escalate to a human (or a
 *  slower/more careful path) when confidence is low, instead of
 *  confidently delivering a guess. This is the same principle behind
 *  "ask for confirmation before destructive actions" but generalized to
 *  any answer/decision.
 * ============================================================================
 */
"use strict";

/**
 * @param {function} callLLM - async (messages, system) => { text }
 * @param {string} question - what's being decided/answered
 * @param {string} proposedAnswer - the answer/decision to rate
 * @returns {Promise<{confidence: number, reasoning: string, escalate: boolean}>}
 */
async function assessConfidence(callLLM, question, proposedAnswer, escalationThreshold = 0.6) {
  const system = `Rate your confidence (0.0 to 1.0) that the proposed answer is correct and complete for the question. Be honest — overconfidence on uncertain answers is the failure mode being checked for here.
Respond ONLY with JSON: {"confidence": 0.0-1.0, "reasoning": "one sentence"}`;
  const userMsg = `QUESTION:\n${question}\n\nPROPOSED ANSWER:\n${String(proposedAnswer).slice(0, 3000)}`;

  try {
    const res = await callLLM([{ role: "user", content: userMsg }], system);
    const text = res?.text || res?.content?.[0]?.text || String(res);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { confidence: 0.7, reasoning: "Could not parse confidence assessment — defaulting to moderate confidence.", escalate: false };
    const parsed = JSON.parse(match[0]);
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7;
    return {
      confidence,
      reasoning: parsed.reasoning || "",
      escalate: confidence < escalationThreshold
    };
  } catch (_) {
    return { confidence: 0.7, reasoning: "Confidence assessment failed — defaulting to moderate confidence.", escalate: false };
  }
}

/** Format a user-facing escalation notice when confidence is low. */
function formatEscalationNotice(assessment, question) {
  return `⚠️ Low-confidence answer (${(assessment.confidence * 100).toFixed(0)}%) for: "${question}"\nReason: ${assessment.reasoning}\nBoss, want me to research further, try a different approach, or proceed anyway?`;
}

module.exports = { assessConfidence, formatEscalationNotice };
