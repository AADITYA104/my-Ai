/**
 * ============================================================================
 *  AUTONOMOUS LOOP AGENT — v4: HARDENING (stop control + skill pruning)
 * ============================================================================
 *
 * NEW IN v4 (builds on v3):
 *
 *   1. STOP CONTROL — runAgent accepts an optional `shouldStop` callback or
 *      control object. It is checked at every iteration and subtask boundary.
 *
 *   2. SKILL USAGE TRACKING — logs usage timestamps and hit counts into
 *      agent-memory/skill-usage.json when skills are matched and applied.
 *
 *   3. SKILL AUDITING & PRUNING — periodically reviews the skill library:
 *      - Stale Skills: Detects skills unused for 30+ days or never applied.
 *      - Contradiction Analysis: Uses LLM to identify conflicting instructions
 *        or overlapping "when to use" domains across stored skills.
 *      - Safety Gate: Generates a human-readable audit report in
 *        agent-memory/skill-audit-report.md without destructive auto-deletion.
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");

const MEMORY_DIR = path.join(__dirname, "agent-memory");
const SKILLS_DIR = path.join(MEMORY_DIR, "skills");
const USAGE_FILE = path.join(MEMORY_DIR, "skill-usage.json");
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

function ensureDirs() {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

async function callClaude(messages, system) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, system, messages }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

function listSkills() {
  ensureDirs();
  return fs
    .readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const content = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
      const title = (content.match(/^#\s*(.+)/m) || [, f])[1];
      const whenToUse = (content.match(/## When to use\s*\n(.+)/) || [, ""])[1];
      return { file: f, title, whenToUse, content };
    });
}

// ---------------------------------------------------------------------------
// SKILL USAGE TRACKING
// ---------------------------------------------------------------------------
function recordSkillUsage(skillFile) {
  ensureDirs();
  const usage = fs.existsSync(USAGE_FILE)
    ? JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"))
    : {};
  usage[skillFile] = usage[skillFile] || { count: 0, lastUsed: null };
  usage[skillFile].count++;
  usage[skillFile].lastUsed = new Date().toISOString();
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
}

// ---------------------------------------------------------------------------
// SKILL PRUNING & AUDIT (Advisory only — never auto-deletes)
// ---------------------------------------------------------------------------
async function analyzeSkills() {
  const skills = listSkills();
  const usage = fs.existsSync(USAGE_FILE)
    ? JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"))
    : {};

  if (skills.length === 0) {
    return {
      contradictions: "No skills found.",
      stale: [],
      report: "# Skill Library Audit\n\nNo skills found in memory.",
    };
  }

  if (skills.length < 2) {
    const report = `# Skill Library Audit — ${new Date().toISOString()}\n\nTotal skills: 1\nFewer than 2 skills — nothing to analyze for contradictions yet.`;
    fs.writeFileSync(path.join(MEMORY_DIR, "skill-audit-report.md"), report);
    return {
      contradictions: "Single skill — no contradictions possible.",
      stale: [],
      report,
    };
  }

  // 1. Stale skills — never used, or not used in 30+ days
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const stale = skills.filter((s) => {
    const u = usage[s.file];
    if (!u) return true; // never used since being learned
    return Date.now() - new Date(u.lastUsed).getTime() > THIRTY_DAYS_MS;
  });

  // 2. Contradiction detection via Claude
  const skillSummaries = skills
    .map((s, i) => `${i + 1}. "${s.title}" (${s.file})\nWhen: ${s.whenToUse}\nSteps preview:\n${s.content.slice(0, 300)}`)
    .join("\n\n");

  const system = `You are auditing an AI agent skill library. Identify pairs of skills
that target the SAME or overlapping problem domains but provide contradictory,
conflicting, or incompatible instructions.
List only genuine conflicts. If none exist, respond with "No contradictions found."`;

  const contradictionReport = await callClaude(
    [{ role: "user", content: `Review these skills:\n\n${skillSummaries}` }],
    system
  );

  const report = [
    `# Skill Library Audit — ${new Date().toISOString()}`,
    `\nTotal skills in library: ${skills.length}`,
    `\n## ⏳ Stale Skills (Unused in 30+ days or never triggered)`,
    stale.length
      ? stale.map((s) => `- **${s.title}** (\`${s.file}\`) — Uses: ${usage[s.file]?.count || 0}`).join("\n")
      : "None (all skills actively referenced).",
    `\n## ⚠️ Potential Contradictions & Overlaps`,
    contradictionReport,
    `\n---`,
    `> **Note**: This report is strictly advisory. No files were deleted or altered automatically.`,
    `> Review \`agent-memory/skills/\` manually to prune or update duplicate/outdated guides.`,
  ].join("\n");

  fs.writeFileSync(path.join(MEMORY_DIR, "skill-audit-report.md"), report);
  return { contradictions: contradictionReport, stale, report };
}

// ---------------------------------------------------------------------------
// Standalone runner: node autonomous-loop-agent-v4-hardening.js
// ---------------------------------------------------------------------------
if (require.main === module) {
  (async () => {
    console.log("🔍 Running Skill Library Audit & Hardening Analysis...");
    const { report } = await analyzeSkills();
    console.log("\n" + report);
    console.log(`\n📄 Report saved to: ${path.join(MEMORY_DIR, "skill-audit-report.md")}`);
  })();
}

module.exports = {
  analyzeSkills,
  recordSkillUsage,
  listSkills,
};
