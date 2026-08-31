/**
 * ============================================================================
 *  RAG FAILURE DIAGNOSTICS
 *  Adapted (concept-level, original implementation) from awesome-llm-apps'
 *  rag_tutorials/rag_failure_diagnostics_clinic — a small pattern library
 *  for triaging RAG incidents, suggesting a minimal STRUCTURAL fix (not
 *  just "add more context" or "use a bigger model"). Callable directly, or
 *  point it at this project's own rag-memory.js state for a quick self-check.
 * ============================================================================
 */
"use strict";

const rag = require("./rag-memory");

const FAILURE_PATTERNS = [
  {
    id: "empty_retrieval",
    symptom: "Query returns zero or near-zero results.",
    detect: (ctx) => ctx.hitCount === 0,
    fix: "The memory store may be empty for this topic, or the query uses vocabulary that doesn't overlap with anything stored. Try storing more domain content, or broaden the query terms rather than assuming the RAG pipeline itself is broken."
  },
  {
    id: "keyword_mismatch",
    symptom: "Results exist but none are actually relevant (BM25 keyword match with no semantic match).",
    detect: (ctx) => ctx.hitCount > 0 && ctx.avgOverlapRatio < 0.2,
    fix: "Plain keyword search (BM25) can't bridge a vocabulary gap (e.g. query says 'car', memory says 'automobile'). Enable OLLAMA_EMBED_MODEL for semantic search, which handles synonyms/paraphrase that keyword overlap can't."
  },
  {
    id: "context_dilution",
    symptom: "Many near-duplicate chunks returned, crowding out genuinely different information.",
    detect: (ctx) => ctx.duplicateTopicRatio > 0.4,
    fix: "Multiple stored entries cover the same narrow point. Use MMR diversity re-ranking (already available via searchSemantic's mmrRerank) instead of plain top-K, or deduplicate at storage time."
  },
  {
    id: "stale_embeddings",
    symptom: "Semantic search behaves inconsistently after content was edited.",
    detect: (ctx) => ctx.hasStaleEmbeddingRisk,
    fix: "Embeddings are cached per memory entry and never recomputed if the underlying content changes in place. If you edit stored content directly, clear its cached `.embedding` field so it gets re-embedded on next search."
  },
  {
    id: "over_broad_query",
    symptom: "Retrieval returns a wide, unfocused mix of topics.",
    detect: (ctx) => ctx.hitCount > 0 && ctx.topicDiversity > 0.8 && ctx.avgOverlapRatio < 0.4,
    fix: "The query is too generic for the store's contents to disambiguate. Narrow the query with more specific terms, or increase the relevance bar (raise the MMR lambda / require a minimum BM25 score) before injecting context."
  }
];

/** Run the live corpus through the pattern library for a specific query. */
function diagnoseQuery(query, limit = 10) {
  const hits = rag.search(query, limit);
  const queryWords = new Set(String(query).toLowerCase().split(/\W+/).filter(w => w.length > 3));

  const overlaps = hits.map(h => {
    const text = `${h.topic} ${h.content}`.toLowerCase();
    const overlap = [...queryWords].filter(w => text.includes(w)).length;
    return queryWords.size > 0 ? overlap / queryWords.size : 0;
  });
  const avgOverlapRatio = overlaps.length ? overlaps.reduce((a, b) => a + b, 0) / overlaps.length : 0;

  const topics = hits.map(h => h.topic);
  const uniqueTopics = new Set(topics);
  const duplicateTopicRatio = topics.length ? 1 - (uniqueTopics.size / topics.length) : 0;
  const topicDiversity = topics.length ? uniqueTopics.size / topics.length : 0;

  const ctx = {
    hitCount: hits.length,
    avgOverlapRatio,
    duplicateTopicRatio,
    topicDiversity,
    hasStaleEmbeddingRisk: hits.some(h => h.embedding && !process.env.OLLAMA_EMBED_MODEL) // embedding cached but semantic search currently disabled -> likely stale/unused
  };

  const matches = FAILURE_PATTERNS.filter(p => p.detect(ctx));

  return {
    query,
    context: ctx,
    matchedPatterns: matches.map(p => ({ id: p.id, symptom: p.symptom, fix: p.fix })),
    verdict: matches.length === 0 ? "No known failure pattern detected — retrieval looks healthy for this query." : `${matches.length} potential issue(s) found.`
  };
}

module.exports = { diagnoseQuery, FAILURE_PATTERNS };
