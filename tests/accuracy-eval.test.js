/**
 * ============================================================================
 *  ULTRON ACCURACY EVAL HARNESS (golden-set regression suite)
 * ----------------------------------------------------------------------------
 *  agent-reliability.test.js checks INFRASTRUCTURE (locks, redaction, pruning).
 *  This file checks ACCURACY: does the critic actually catch wrong answers,
 *  does it admit uncertainty instead of guessing, does the task classifier
 *  route tasks correctly. This is what should fail loudly before a prompt
 *  change silently makes the agent worse.
 *
 *  OPT-IN / LLM-BACKED: criticStep makes real LLM calls (via callUniversalLLM),
 *  so this suite costs tokens and needs GEMINI_API_KEY or a running Ollama.
 *  Run explicitly:  npm run test:accuracy
 *  Do not add this to the default `npm test` chain if you want CI to stay
 *  free/offline-safe -- wire it into a scheduled or manual CI job instead.
 * ============================================================================
 */
"use strict";

const assert = require("assert");
const { criticStep } = require("../autonomous-loop-agent-v7-free");
const taskClassifier = require("../task-classifier");
const ragMemory = require("../rag-memory");

console.log("========================================================");
console.log("ULTRON ACCURACY EVAL -- golden-set regression suite");
console.log("========================================================\n");

let passed = 0;
let failed = 0;
const results = [];

async function runEval(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
    results.push({ name, ok: true });
  } catch (err) {
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
    failed++;
    results.push({ name, ok: false, reason: err.message });
  }
}

// ---------------------------------------------------------------------------
// GOLDEN SET 1: Critic must catch an obviously wrong result, not rubber-stamp it.
// ---------------------------------------------------------------------------
const CRITIC_GOLDEN_CASES = [
  {
    label: "clearly correct result -> PASS with real confidence",
    subtask: { id: "g1", description: "Write a function that returns the sum of two numbers", doneWhen: "A function exists that adds two numbers and returns the result" },
    result: "function sum(a, b) { return a + b; }",
    expect: (v) => v.verdict === "PASS" && v.confidence >= 0.6,
  },
  {
    label: "clearly wrong result -> FAIL, never PASS",
    subtask: { id: "g2", description: "Write a function that returns the sum of two numbers", doneWhen: "A function exists that adds two numbers and returns the result" },
    result: "function sum(a, b) { return a - b; } // subtracts instead of adding",
    expect: (v) => v.verdict === "FAIL" || v.uncertain,
    // never PASS on a result that visibly contradicts its own done-criteria
    hardFail: (v) => v.verdict === "PASS" && v.confidence >= CriticFloor(),
  },
  {
    label: "ambiguous / unverifiable result -> UNCERTAIN, not a guessed PASS",
    subtask: { id: "g3", description: "Confirm the production database migration completed successfully", doneWhen: "Migration ran with zero errors on the prod DB" },
    result: "I ran the migration command. It printed some output.",
    expect: (v) => v.uncertain === true,
  },
];

function CriticFloor() {
  return 0.6; // mirrors CONFIG.CRITIC_CONFIDENCE_FLOOR in autonomous-loop-agent-v7-free.js
}

// (evals for this set are run sequentially inside main(), below)

// ---------------------------------------------------------------------------
// GOLDEN SET 2: Task classifier routes to the right lane. Add a row every
// time a misroute ships in production -- that's the whole point of a
// regression suite.
// ---------------------------------------------------------------------------
const CLASSIFIER_GOLDEN_CASES = [
  { query: "Write a binary search tree in TypeScript", expectType: "coding" },
  { query: "Perform a security audit for SQL injection vulnerabilities", expectType: "audit" },
  { query: "Design a landing page story and branding concept", expectType: "creative" },
  { query: "What's the weather like in Ahmedabad today", expectType: "general" }, // verified against actual task-classifier.js output
];

// (evals for this set are run sequentially inside main(), below)

// ---------------------------------------------------------------------------
// GOLDEN SET 3: RAG retrieval returns the right document on top, not just
// "some" result. Extend this list as your knowledge base grows -- a doc
// that stops surfacing for its own canonical query is a silent regression.
// ---------------------------------------------------------------------------
const RAG_GOLDEN_CASES = [
  { seedTopic: "Deployment Rollback Procedure", seedContent: "How to roll back a failed production deployment using the previous Docker image tag", tags: ["ops", "deploy"], query: "rollback a bad production deploy", expectTopic: "Deployment Rollback Procedure" },
];

// ---------------------------------------------------------------------------
// MAIN: run every golden set sequentially (each criticStep call is a real
// LLM round trip, so we deliberately don't parallelize -- easier to read
// failures in order, and gentler on rate limits).
// ---------------------------------------------------------------------------
async function main() {
  for (const c of CRITIC_GOLDEN_CASES) {
    await runEval(`[critic] ${c.label}`, async () => {
      const verdict = await criticStep(c.subtask, c.result);
      if (c.hardFail && c.hardFail(verdict)) {
        throw new Error(`Critic accepted a self-contradicting result as PASS (confidence ${verdict.confidence}). This is the exact failure mode confidence scoring exists to prevent.`);
      }
      assert.ok(c.expect(verdict), `Got verdict=${verdict.verdict} confidence=${verdict.confidence}. Raw: ${verdict.feedback.slice(0, 200)}`);
    });
  }

  for (const c of CLASSIFIER_GOLDEN_CASES) {
    if (!c.expectType) continue; // placeholder row, skip until filled in
    await runEval(`[classifier] "${c.query}" -> ${c.expectType}`, async () => {
      const cfg = taskClassifier.getTaskConfig(c.query);
      assert.strictEqual(cfg.taskType, c.expectType);
    });
  }

  for (const c of RAG_GOLDEN_CASES) {
    await runEval(`[rag] top result for "${c.query}"`, async () => {
      ragMemory.store(c.seedTopic, c.seedContent, c.tags, "guide");
      try {
        const results = ragMemory.search(c.query);
        assert.ok(results.length > 0, "must return at least one result");
        assert.strictEqual(results[0].topic, c.expectTopic, `top result was "${results[0].topic}", expected "${c.expectTopic}"`);
      } finally {
        // Cleanup: this test writes into the SAME production memory store
        // the real agent uses (rag-memory.js only exports a singleton, no
        // isolated test instance available) -- remove what we added so
        // repeated test runs don't accumulate stale entries in
        // agent-memory/agentdb_memory.json.
        ragMemory.memories = ragMemory.memories.filter(m => m.topic !== c.seedTopic);
        ragMemory.save();
      }
    });
  }

  console.log(`\n========================================================`);
  console.log(`ACCURACY EVAL RESULTS: ${passed} PASSED, ${failed} FAILED (of ${passed + failed})`);
  console.log(`========================================================\n`);
  if (failed > 0) {
    console.log("Failing cases:");
    for (const r of results.filter((r) => !r.ok)) console.log(`  - ${r.name}: ${r.reason}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
} else {
  // Required as a module (e.g. by tests/deep_file_audit.js's blanket
  // require-scan) rather than run directly -- do NOT auto-fire real LLM
  // calls or process.exit() in that case. Export main() so a caller can
  // opt in explicitly if they want to.
  module.exports = { main };
}
