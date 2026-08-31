/**
 * ============================================================================
 *  SKILL IMPROVEMENT TRACKER
 *  Adapted (concept-level, original implementation) from awesome-llm-apps'
 *  agent_skills/self-improving-agent-skills — that project runs a full
 *  ADK multi-agent optimization loop (execute -> score -> diagnose ->
 *  mutate) against uploaded skills. This project's 717-skill registry is
 *  static reference material rather than executable prompts, so the
 *  directly-portable piece is the MEASUREMENT half: track how often each
 *  matched skill actually correlates with a successful subtask outcome
 *  (via intelligence-loop.js's existing lesson records), and surface which
 *  skills look unhelpful so they can be reviewed/edited manually.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

const STATS_FILE = path.join(__dirname, "agent-memory", "skill-effectiveness.json");

function load() {
  try {
    if (fs.existsSync(STATS_FILE)) return JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
  } catch (_) {}
  return {};
}

function save(stats) {
  try {
    fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), "utf-8");
  } catch (_) {}
}

/** Call this whenever a subtask that had a matched skill completes. */
function recordSkillOutcome(skillName, success) {
  if (!skillName) return;
  const stats = load();
  if (!stats[skillName]) stats[skillName] = { uses: 0, successes: 0, failures: 0 };
  stats[skillName].uses++;
  if (success) stats[skillName].successes++;
  else stats[skillName].failures++;
  save(stats);
}

/** Skills with a poor track record (below threshold success rate, with
 * enough samples to be meaningful) — candidates for manual review/edit. */
function getUnderperformingSkills(minUses = 3, successRateThreshold = 0.4) {
  const stats = load();
  return Object.entries(stats)
    .filter(([, s]) => s.uses >= minUses && (s.successes / s.uses) < successRateThreshold)
    .map(([name, s]) => ({ name, uses: s.uses, successRate: Number((s.successes / s.uses).toFixed(2)) }))
    .sort((a, b) => a.successRate - b.successRate);
}

function getStats(skillName) {
  const stats = load();
  return stats[skillName] || { uses: 0, successes: 0, failures: 0 };
}

function getAllStats() {
  return load();
}

module.exports = { recordSkillOutcome, getUnderperformingSkills, getStats, getAllStats };
