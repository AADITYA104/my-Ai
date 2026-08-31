/**
 * ============================================================================
 *  RUFLO AGENT PERSONAS
 *  Indexes the REAL, unmodified ruflo agent-definition markdown files
 *  (copied verbatim into ./ruflo-agents/ from ruflo's .claude/agents/ tree —
 *  108 files across categories: swarm, consensus, github, sparc, testing,
 *  neural, optimization, architecture, devops, etc). These are plain-text
 *  persona/instruction documents — no Claude-Code-specific runtime
 *  dependency — so they can be used as a system prompt by ANY agent loop,
 *  including this project's own multi-agent-system.js.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

const AGENTS_DIR = path.join(__dirname, "ruflo-agents");
let cache = null;

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { name: null, description: null, body: raw };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { name: meta.name || null, description: meta.description || null, body: m[2].trim() };
}

function walk(dir, category) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, entry.name));
    } else if (entry.name.endsWith(".md")) {
      const raw = fs.readFileSync(full, "utf-8");
      const { name, description, body } = parseFrontmatter(raw);
      out.push({
        file: entry.name.replace(".md", ""),
        name: name || entry.name.replace(".md", ""),
        description: description || "",
        category,
        path: path.relative(__dirname, full),
        body
      });
    }
  }
  return out;
}

function loadAll() {
  if (cache) return cache;
  cache = walk(AGENTS_DIR, "root");
  return cache;
}

function listPersonas() {
  return loadAll().map(({ body, ...meta }) => meta);
}

function getPersona(nameOrFile) {
  return loadAll().find(a => a.name === nameOrFile || a.file === nameOrFile) || null;
}

/** Keyword-overlap match against task description, same simple approach as unified-skill-engine.js. */
function findRelevantPersona(taskDescription) {
  const all = loadAll();
  const taskWords = new Set(String(taskDescription || "").toLowerCase().split(/\W+/).filter(w => w.length > 3));
  let best = null, bestScore = 0;
  for (const a of all) {
    const haystack = `${a.name} ${a.description} ${a.category}`.toLowerCase();
    let score = 0;
    for (const w of taskWords) if (haystack.includes(w)) score++;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return bestScore > 0 ? best : null;
}

/** Build a usable system-prompt string from a persona's real, unmodified body. */
function buildPersonaPrompt(nameOrFile) {
  const p = getPersona(nameOrFile);
  if (!p) return null;
  return `You are the "${p.name}" agent (${p.category} category). Follow this role definition:\n\n${p.body}`;
}

module.exports = { listPersonas, getPersona, findRelevantPersona, buildPersonaPrompt };
