/**
 * ============================================================================
 *  SCOPE CREEP DETECTOR
 *  Adapted (concept-level, original implementation) from awesome-llm-apps'
 *  agent_skills/scope-creep-detector — checks a proposed file change against
 *  the one-line task intent and flags unrelated paths, new dependency
 *  edits, config/CI edits, or subsystem spread the task never asked for.
 *  Useful because an autonomous coding agent can silently touch far more
 *  than it was asked to (e.g. "fix the login button color" ending up also
 *  editing package.json or .env).
 * ============================================================================
 */
"use strict";

const SENSITIVE_PATTERNS = [
  { re: /package\.json$/, label: "dependency manifest" },
  { re: /package-lock\.json$/, label: "dependency lockfile" },
  { re: /\.env(\.|$)/, label: "environment/secrets config" },
  { re: /\.github\/workflows\//, label: "CI/CD workflow" },
  { re: /Dockerfile$/, label: "container build config" },
  { re: /\.gitignore$/, label: "VCS ignore rules" },
  { re: /tsconfig\.json$|\.eslintrc/, label: "build/lint config" }
];

function extractKeywords(text) {
  return new Set(String(text || "").toLowerCase().split(/\W+/).filter(w => w.length > 3));
}

/**
 * @param {string} taskIntent - one-line description of what the subtask is supposed to do
 * @param {string} filePath - the file being written/modified
 * @param {string} [fileContentPreview] - optional snippet of the new content, for keyword overlap
 */
function checkScope(taskIntent, filePath, fileContentPreview = "") {
  const flags = [];

  const sensitive = SENSITIVE_PATTERNS.find(p => p.re.test(filePath));
  if (sensitive) {
    flags.push(`Touches a ${sensitive.label} (${filePath}) — confirm the task actually requires this.`);
  }

  const intentWords = extractKeywords(taskIntent);
  const pathWords = extractKeywords(filePath.replace(/[\\/]/g, " ").replace(/\.\w+$/, ""));
  const contentWords = extractKeywords(fileContentPreview.slice(0, 500));

  const pathOverlap = [...intentWords].some(w => pathWords.has(w) || filePath.toLowerCase().includes(w));
  const contentOverlap = fileContentPreview ? [...intentWords].some(w => contentWords.has(w)) : true; // no preview -> don't penalize

  if (!pathOverlap && !contentOverlap && intentWords.size > 0) {
    flags.push(`File path/content shares no obvious keyword overlap with the task intent ("${taskIntent.slice(0, 80)}") — possible scope drift.`);
  }

  return {
    inScope: flags.length === 0,
    flags,
    verdict: flags.length === 0 ? "OK" : (sensitive ? "REVIEW_RECOMMENDED" : "POSSIBLE_DRIFT")
  };
}

/** Batch-check a set of file writes from one subtask/session against its intent. */
function checkScopeForChangeset(taskIntent, changedFiles) {
  const results = changedFiles.map(f => ({ file: f.filePath, ...checkScope(taskIntent, f.filePath, f.contentPreview) }));
  const flagged = results.filter(r => !r.inScope);
  return {
    totalFiles: results.length,
    flaggedFiles: flagged.length,
    results,
    summary: flagged.length === 0
      ? "All changes are within the stated scope."
      : `${flagged.length}/${results.length} file(s) look like they may exceed the stated task scope — review before committing.`
  };
}

module.exports = { checkScope, checkScopeForChangeset };
