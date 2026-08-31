/**
 * ============================================================================
 *  [1/10] SEMANTIC RESPONSE CACHE
 *  Production agents (and API gateways in front of them) cache LLM
 *  responses keyed by prompt similarity, not just exact string match —
 *  "what's the weather in Ahmedabad" and "weather in Ahmedabad?" should hit
 *  the same cache entry. Falls back to exact-match hashing when no
 *  embedding model is configured (still saves repeated identical calls).
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CACHE_FILE = path.join(__dirname, "agent-memory", "semantic-cache.json");
const MAX_ENTRIES = 500;
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — LLM answers can go stale

let cache = [];
try {
  if (fs.existsSync(CACHE_FILE)) cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
} catch (_) { cache = []; }

function save() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache.slice(-MAX_ENTRIES)), "utf-8");
  } catch (_) {}
}

function hashKey(prompt) {
  return crypto.createHash("sha256").update(String(prompt).trim().toLowerCase()).digest("hex");
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na === 0 || nb === 0) ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Look up a cached response. Pass an embedding for fuzzy/semantic matching,
 * or omit it for exact-match-only lookup. */
function get(prompt, embedding = null, similarityThreshold = 0.96) {
  const now = Date.now();
  const exactHash = hashKey(prompt);

  // Exact match first (cheap, always tried)
  const exact = cache.find(e => e.hash === exactHash && (now - e.ts) < e.ttlMs);
  if (exact) { exact.hits = (exact.hits || 0) + 1; return { hit: true, response: exact.response, type: "exact" }; }

  // Fuzzy semantic match (only if an embedding was supplied)
  if (embedding) {
    let best = null, bestSim = 0;
    for (const e of cache) {
      if (!e.embedding || (now - e.ts) >= e.ttlMs) continue;
      const sim = cosineSimilarity(embedding, e.embedding);
      if (sim > bestSim) { bestSim = sim; best = e; }
    }
    if (best && bestSim >= similarityThreshold) {
      best.hits = (best.hits || 0) + 1;
      return { hit: true, response: best.response, type: "semantic", similarity: bestSim };
    }
  }

  return { hit: false };
}

/** Store a response. Pass an embedding to enable fuzzy matching for it later. */
function set(prompt, response, embedding = null, ttlMs = DEFAULT_TTL_MS) {
  cache.push({ hash: hashKey(prompt), embedding, response, ts: Date.now(), ttlMs, hits: 0 });
  if (cache.length > MAX_ENTRIES) cache = cache.slice(-MAX_ENTRIES);
  save();
}

function stats() {
  const now = Date.now();
  const alive = cache.filter(e => (now - e.ts) < e.ttlMs);
  return {
    totalEntries: cache.length,
    liveEntries: alive.length,
    totalHits: cache.reduce((s, e) => s + (e.hits || 0), 0)
  };
}

function clear() {
  cache = [];
  save();
}

module.exports = { get, set, stats, clear };
