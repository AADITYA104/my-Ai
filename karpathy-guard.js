/**
 * ============================================================================
 *  KARPATHY COGNITIVE GUARD (karpathy-guard.js)
 *  Runtime enforcement of Andrej Karpathy's 4 principles:
 *    1. THINK BEFORE CODING — surface assumptions, don't guess
 *    2. SIMPLICITY FIRST — minimum code, nothing speculative
 *    3. SURGICAL CHANGES — only touch what you must
 *    4. GOAL-DRIVEN EXECUTION — define success criteria, loop until verified
 *
 *  Injected into: Actor prompts, Critic prompts, Bootstrap planner,
 *                 Tree-of-Thought synthesis, and Brain dispatch.
 * ============================================================================
 */
"use strict";

// ---------------------------------------------------------------------------
// Karpathy Principle Prompt Blocks (reusable across all agent personalities)
// ---------------------------------------------------------------------------

const KARPATHY_THINK_BEFORE_CODING = `
## THINK BEFORE CODING (Karpathy Principle 1)
Don't assume. Don't hide confusion. Surface tradeoffs.
- State assumptions explicitly. If uncertain, ASK — never guess.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, STOP. Name what's confusing. Ask.`;

const KARPATHY_SIMPLICITY_FIRST = `
## SIMPLICITY FIRST (Karpathy Principle 2)
Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
Test: Would a senior engineer say this is overcomplicated? If yes, simplify.`;

const KARPATHY_SURGICAL_CHANGES = `
## SURGICAL CHANGES (Karpathy Principle 3)
Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.
Test: Every changed line should trace directly to the user's request.`;

const KARPATHY_GOAL_DRIVEN = `
## GOAL-DRIVEN EXECUTION (Karpathy Principle 4)
Define success criteria. Loop until verified.
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:
  1. [Step] → verify: [check]
  2. [Step] → verify: [check]
Strong success criteria let you loop independently.`;

// ---------------------------------------------------------------------------
// Combined Karpathy Injection (for system prompts)
// ---------------------------------------------------------------------------

const KARPATHY_FULL_BLOCK = `
╔══════════════════════════════════════════════════════════╗
║  KARPATHY COGNITIVE GUARD — ACTIVE FOR ALL AGENT WORK   ║
╚══════════════════════════════════════════════════════════╝
${KARPATHY_THINK_BEFORE_CODING}
${KARPATHY_SIMPLICITY_FIRST}
${KARPATHY_SURGICAL_CHANGES}
${KARPATHY_GOAL_DRIVEN}

These guidelines bias toward caution over speed. For trivial tasks, use judgment.`;

// ---------------------------------------------------------------------------
// Smart Injection — only adds relevant principles based on task type
// ---------------------------------------------------------------------------

function getKarpathyGuidance(taskType) {
  switch (taskType) {
    case "coding":
    case "debug":
    case "refactor":
      return `${KARPATHY_THINK_BEFORE_CODING}\n${KARPATHY_SIMPLICITY_FIRST}\n${KARPATHY_SURGICAL_CHANGES}\n${KARPATHY_GOAL_DRIVEN}`;

    case "architecture":
    case "design":
    case "planning":
      return `${KARPATHY_THINK_BEFORE_CODING}\n${KARPATHY_SIMPLICITY_FIRST}\n${KARPATHY_GOAL_DRIVEN}`;

    case "review":
    case "audit":
      return `${KARPATHY_SURGICAL_CHANGES}\n${KARPATHY_GOAL_DRIVEN}`;

    case "research":
    case "investigation":
      return `${KARPATHY_THINK_BEFORE_CODING}\n${KARPATHY_GOAL_DRIVEN}`;

    default:
      return KARPATHY_FULL_BLOCK;
  }
}

// ---------------------------------------------------------------------------
// Assumption Detector — flags when the agent might be silently assuming
// ---------------------------------------------------------------------------

const AMBIGUITY_SIGNALS = [
  /export|import|migration/i,          // scope ambiguity
  /fix|improve|make.*better/i,         // vague intent
  /fast|slow|performance|optimize/i,   // multi-interpretation
  /add.*feature|implement/i,           // missing specs
  /refactor|clean\s*up|restructure/i,  // scope creep risk
];

function detectAmbiguity(userInput) {
  const flags = [];
  for (const pattern of AMBIGUITY_SIGNALS) {
    if (pattern.test(userInput)) {
      flags.push(pattern.source);
    }
  }
  return {
    isAmbiguous: flags.length >= 2,
    flagCount: flags.length,
    flags,
    recommendation: flags.length >= 2
      ? "⚠️ [KARPATHY GUARD] Multiple ambiguity signals detected. Surface assumptions before coding."
      : null
  };
}

// ---------------------------------------------------------------------------
// Complexity Estimator — warns if a solution looks overcomplicated
// ---------------------------------------------------------------------------

function estimateComplexity(codeOrPlan) {
  if (!codeOrPlan || typeof codeOrPlan !== "string") return { score: 0, warning: null };

  const lines = codeOrPlan.split("\n").length;
  const classCount = (codeOrPlan.match(/\bclass\s+\w+/g) || []).length;
  const abstractionCount = (codeOrPlan.match(/\b(abstract|interface|factory|strategy|builder|decorator|observer|singleton)\b/gi) || []).length;
  const importCount = (codeOrPlan.match(/^(import |const .* = require|from )/gm) || []).length;

  let score = 0;
  score += Math.min(lines / 50, 5);           // 1 point per 50 lines, max 5
  score += classCount * 2;                      // 2 points per class
  score += abstractionCount * 3;                // 3 points per design pattern keyword
  score += Math.max(0, importCount - 5) * 0.5;  // 0.5 per import beyond 5

  const warning = score > 8
    ? `⚠️ [KARPATHY SIMPLICITY CHECK] Complexity score: ${score.toFixed(1)}/10+. ${classCount} classes, ${abstractionCount} design patterns. Consider: would a senior engineer say this is overcomplicated?`
    : null;

  return { score: Math.round(score * 10) / 10, warning, lines, classCount, abstractionCount };
}

// ---------------------------------------------------------------------------
// Surgical Change Validator — checks if a diff touches more than it should
// ---------------------------------------------------------------------------

function validateSurgicalChange(diffText, requestedScope) {
  if (!diffText) return { clean: true };

  const changedFiles = (diffText.match(/^\+\+\+ b\/.*/gm) || []).length;
  const addedLines = (diffText.match(/^\+[^+]/gm) || []).length;
  const removedLines = (diffText.match(/^-[^-]/gm) || []).length;
  const commentChanges = (diffText.match(/^\+\s*\/\/|^\+\s*\/\*|^\+\s*\*|^-\s*\/\/|^-\s*\/\*/gm) || []).length;
  const formattingOnly = (diffText.match(/^\+\s*$|^-\s*$/gm) || []).length;

  const warnings = [];
  if (changedFiles > 5) warnings.push(`Touched ${changedFiles} files — is this all necessary?`);
  if (commentChanges > 3) warnings.push(`${commentChanges} comment changes — are these related to the request?`);
  if (formattingOnly > 5) warnings.push(`${formattingOnly} whitespace-only changes — unnecessary churn`);

  return {
    clean: warnings.length === 0,
    changedFiles,
    addedLines,
    removedLines,
    warnings
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Prompt blocks
  KARPATHY_THINK_BEFORE_CODING,
  KARPATHY_SIMPLICITY_FIRST,
  KARPATHY_SURGICAL_CHANGES,
  KARPATHY_GOAL_DRIVEN,
  KARPATHY_FULL_BLOCK,

  // Smart injection
  getKarpathyGuidance,

  // Runtime guards
  detectAmbiguity,
  estimateComplexity,
  validateSurgicalChange,
};
