/**
 * ============================================================================
 *  [6/10] MEMORY SCORING (importance + recency + relevance)
 *  The "Generative Agents" (Park et al.) / MemGPT pattern used by advanced
 *  agent memory systems: which memory to surface isn't just "most similar
 *  text" — it's a blend of how RELEVANT it is to the current query, how
 *  RECENT it is (fresher matters more), and how IMPORTANT it was judged to
 *  be when stored (a stored "lesson" or explicit fact outranks a passing
 *  mention). This re-scores rag-memory.js search results with that blend.
 * ============================================================================
 */
"use strict";

// How important each category/tag is by default — tune freely.
const IMPORTANCE_BY_TAG = {
  lesson: 0.9,
  "success-pattern": 0.85,
  "failure-pattern": 0.85,
  fact: 0.8,
  code: 0.6,
  conversation: 0.4,
  "health-check": 0.2
};

function importanceOf(entry) {
  const tags = entry.tags || [];
  const scores = tags.map(t => IMPORTANCE_BY_TAG[t]).filter(s => s !== undefined);
  if (scores.length === 0) return 0.5; // neutral default
  return Math.max(...scores);
}

function recencyOf(entry, halfLifeHours = 72) {
  const ageHours = (Date.now() - new Date(entry.timestamp).getTime()) / 3600000;
  // Exponential decay — score halves every `halfLifeHours`.
  return Math.pow(0.5, ageHours / halfLifeHours);
}

/**
 * Re-rank a list of rag-memory search hits (each with a `.score` field for
 * relevance already computed by BM25/cosine) using the blended formula.
 * Weights sum to 1.0 by default but don't have to.
 */
function rescore(hits, { relevanceWeight = 0.5, recencyWeight = 0.25, importanceWeight = 0.25, halfLifeHours = 72 } = {}) {
  if (!hits.length) return hits;
  const maxRelevance = Math.max(1e-9, ...hits.map(h => h.score || 0));
  return hits
    .map(h => {
      const relevance = (h.score || 0) / maxRelevance;
      const recency = recencyOf(h, halfLifeHours);
      const importance = importanceOf(h);
      const blended = relevanceWeight * relevance + recencyWeight * recency + importanceWeight * importance;
      return { ...h, blendedScore: blended, _components: { relevance, recency, importance } };
    })
    .sort((a, b) => b.blendedScore - a.blendedScore);
}

module.exports = { rescore, importanceOf, recencyOf, IMPORTANCE_BY_TAG };
