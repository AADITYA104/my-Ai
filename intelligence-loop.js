/**
 * ============================================================================
 *  INTELLIGENCE LOOP — self-learning from past task outcomes
 *  Adapted (concept-level, original implementation) from ruflo-intelligence's
 *  canonical 4-step pipeline: RETRIEVE -> JUDGE -> DISTILL -> CONSOLIDATE.
 * ============================================================================
 */
"use strict";

const rag = require("./rag-memory");

function retrieveLessons(query, limit = 3) {
  const hits = rag.search(query, limit * 3);
  return hits.filter(h => (h.tags || []).includes("lesson")).slice(0, limit);
}

function judgeOutcome(subtaskDescription, result, success) {
  return {
    subtaskDescription: String(subtaskDescription || "").slice(0, 300),
    success: !!success,
    resultSummary: String(result || "").slice(0, 300),
    judgedAt: new Date().toISOString()
  };
}

function distillLesson(judged) {
  const verdict = judged.success ? "worked" : "failed";
  return `Task "${judged.subtaskDescription}" ${verdict}. Result: ${judged.resultSummary}`;
}

function consolidate(judged) {
  const lesson = distillLesson(judged);
  const tags = ["lesson", judged.success ? "success-pattern" : "failure-pattern"];
  return rag.store(`Lesson: ${judged.subtaskDescription.slice(0, 60)}`, lesson, tags, "intelligence-loop");
}

function learnFromOutcome(subtaskDescription, result, success) {
  const judged = judgeOutcome(subtaskDescription, result, success);
  return consolidate(judged);
}

module.exports = { retrieveLessons, judgeOutcome, distillLesson, consolidate, learnFromOutcome };
