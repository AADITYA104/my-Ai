/**
 * ============================================================================
 *  PONYTAIL INSTRUCTIONS — mode-filtered instruction builder
 *  Ported directly from ponytail's hooks/ponytail-instructions.js. Reads the
 *  real skill body from .agents/skills/ponytail/SKILL.md (the exact file
 *  fixed earlier this session) and filters the intensity table + worked
 *  examples down to just the requested mode — this is real token savings
 *  over injecting all three intensity levels every time, which is why
 *  ponytail built this filter instead of just dumping the whole file.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { DEFAULT_MODE, normalizeMode } = require("./ponytail-mode");

const SKILL_PATH = path.join(__dirname, ".agents", "skills", "ponytail", "SKILL.md");

function filterSkillBodyForMode(body, mode) {
  const effectiveMode = normalizeMode(mode) || DEFAULT_MODE;
  const withoutFrontmatter = String(body || "").replace(/^---[\s\S]*?---\s*/, "");

  return withoutFrontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
      if (tableLabel) {
        const labelMode = normalizeMode(tableLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }
      const exampleLabel = line.match(/^-\s*([^:]+):\s*"/);
      if (exampleLabel) {
        const labelMode = normalizeMode(exampleLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }
      return true;
    })
    .join("\n");
}

function getFallbackInstructions(mode) {
  return `PONYTAIL MODE ACTIVE — level: ${mode}\n\n` +
    "You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.\n\n" +
    "Stop at the first rung that holds: (1) does this need to exist at all — YAGNI, (2) already in this codebase, (3) stdlib does it, " +
    "(4) native platform feature covers it, (5) already-installed dependency solves it, (6) can it be one line, (7) minimum code that works.\n\n" +
    "No unrequested abstractions, no boilerplate, fewest files possible. Never simplify away input validation, error handling, or security.";
}

/** The real entry point: mode-filtered Ponytail instructions, sourced from
 * this project's own skill file so a fix there (or an upstream update) is
 * automatically reflected here too — no content duplicated/hardcoded. */
function getPonytailInstructions(mode) {
  const effectiveMode = normalizeMode(mode) || DEFAULT_MODE;
  try {
    const raw = fs.readFileSync(SKILL_PATH, "utf8");
    return filterSkillBodyForMode(raw, effectiveMode).trim();
  } catch (_) {
    return getFallbackInstructions(effectiveMode);
  }
}

module.exports = { getPonytailInstructions, filterSkillBodyForMode, getFallbackInstructions };
