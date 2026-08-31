/**
 * ============================================================================
 *  CORRECTIVE RAG (CRAG)
 *  Adapted (concept-level, original implementation) from awesome-llm-apps'
 *  rag_tutorials/corrective_rag — a well-known failure mode in naive RAG is
 *  blindly injecting whatever the top-K search returned, even when none of
 *  it is actually relevant, which makes the model MORE likely to produce a
 *  confidently wrong answer (it now has "evidence" to rationalize with).
 *  CRAG grades retrieved results for relevance first: strong -> use as-is,
 *  weak/mixed -> still usable but flagged, none relevant -> signal that the
 *  agent should fall back to a web search or say "I don't know" instead of
 *  forcing an answer from irrelevant context.
 * ============================================================================
 */
"use strict";

/**
 * Grade a set of rag-memory search hits against the query using simple,
 * fast heuristics (no extra LLM call needed for the common case) — falls
 * back to an LLM grading call only when the heuristic is ambiguous and an
 * LLM caller is provided.
 */
function heuristicGrade(query, hits) {
  const queryWords = new Set(String(query).toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (queryWords.size === 0) return hits.map(h => ({ ...h, relevance: "ambiguous" }));

  return hits.map(h => {
    const text = `${h.topic} ${h.content}`.toLowerCase();
    const overlap = [...queryWords].filter(w => text.includes(w)).length;
    const overlapRatio = overlap / queryWords.size;
    let relevance;
    if (overlapRatio >= 0.5) relevance = "strong";
    else if (overlapRatio >= 0.2) relevance = "weak";
    else relevance = "ambiguous"; // heuristic can't confidently say "irrelevant" — could be true semantic match with zero keyword overlap
    return { ...h, relevance, overlapRatio: Number(overlapRatio.toFixed(2)) };
  });
}

/**
 * @param {string} query
 * @param {Array} hits - rag-memory search/searchSemantic results
 * @param {function} [callLLM] - optional async (messages, system) => {text}, used only to
 *   resolve "ambiguous" heuristic grades (e.g. a real semantic match with no shared keywords).
 */
async function gradeRelevance(query, hits, callLLM = null) {
  let graded = heuristicGrade(query, hits);

  const ambiguous = graded.filter(h => h.relevance === "ambiguous");
  if (callLLM && ambiguous.length > 0 && ambiguous.length <= 5) {
    try {
      const system = `Rate whether each numbered excerpt is relevant to the query. Respond ONLY with JSON: {"ratings": ["strong"|"weak"|"irrelevant", ...]} in the same order as the excerpts.`;
      const userMsg = `QUERY: ${query}\n\n` + ambiguous.map((h, i) => `[${i + 1}] ${h.content.slice(0, 300)}`).join("\n\n");
      const res = await callLLM([{ role: "user", content: userMsg }], system);
      const text = res?.text || res?.content?.[0]?.text || String(res);
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        ambiguous.forEach((h, i) => { if (parsed.ratings?.[i]) h.relevance = parsed.ratings[i]; });
      }
    } catch (_) { /* fall back to heuristic ambiguous rating, which downstream treats as weak */ }
  }

  const strong = graded.filter(h => h.relevance === "strong");
  const weak = graded.filter(h => h.relevance === "weak" || h.relevance === "ambiguous");
  const irrelevant = graded.filter(h => h.relevance === "irrelevant");

  let verdict;
  if (strong.length > 0) verdict = "sufficient";
  else if (weak.length > 0) verdict = "partial";
  else verdict = "insufficient";

  return {
    verdict, // "sufficient" | "partial" | "insufficient"
    usableHits: [...strong, ...weak],
    strong, weak, irrelevant,
    guidance: verdict === "insufficient"
      ? "No locally stored knowledge is actually relevant to this query — fall back to a web search or say you don't know instead of guessing from unrelated context."
      : verdict === "partial"
      ? "Only weak/partial matches found — treat retrieved context as a hint, not ground truth, and verify before stating it as fact."
      : "Strong relevant matches found — safe to use as grounding context."
  };
}

module.exports = { gradeRelevance, heuristicGrade };
