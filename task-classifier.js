/**
 * ============================================================================
 *  TASK CLASSIFIER & PROMPT ADAPTATION ENGINE (2026 ARCHITECTURE)
 *  - Dynamic Task Classification (coding, research, file_ops, creative, audit).
 *  - Tailored Dynamic System Prompts & Recency Bias Injection.
 *  - Task-Specific Temperature & Explicit Verbosity Constraints.
 * ============================================================================
 */
"use strict";

const TASK_TYPES = {
  CODING: "coding",
  RESEARCH: "research",
  FILE_OPS: "file_ops",
  CREATIVE: "creative",
  AUDIT: "audit",
  GENERAL: "general"
};

const TASK_CONFIGS = {
  [TASK_TYPES.CODING]: {
    temperature: 0.15,
    repeatPenalty: 1.15,
    maxTokens: 4096,
    verbosity: "Concise, precise, and completely functional. No placeholders, TODOs, or conversational filler.",
    systemPrompt: `You are an elite Senior Systems and Software Engineer.
Your code must be complete, production-ready, fully typed/commented where necessary, and adhere strictly to project conventions.
NEVER truncate functions, omit critical imports, or leave "// implement here" placeholders.
Always verify code syntax and dependencies before concluding.`
  },
  [TASK_TYPES.RESEARCH]: {
    temperature: 0.25,
    repeatPenalty: 1.12,
    maxTokens: 3000,
    verbosity: "Structured bullet points with explicit citations, architectural trade-offs, and actionable findings.",
    systemPrompt: `You are a Principal AI and Systems Researcher.
Provide deeply researched, verifiable facts, architectural patterns, and algorithmic choices.
Prioritize official documentation, benchmark comparisons, and security implications.`
  },
  [TASK_TYPES.FILE_OPS]: {
    temperature: 0.1,
    repeatPenalty: 1.1,
    maxTokens: 2048,
    verbosity: "Minimal, atomic execution logs. Only state actions taken and verification status.",
    systemPrompt: `You are a High-Reliability File System and Automation Operator.
Execute file reads, writes, moves, and diffs with atomic safety.
Always double-check file paths, ensure directory existence, and avoid destructive overwrites.`
  },
  [TASK_TYPES.CREATIVE]: {
    temperature: 0.7,
    repeatPenalty: 1.05,
    maxTokens: 4096,
    verbosity: "Rich, engaging, well-formatted markdown with compelling structure and design aesthetics.",
    systemPrompt: `You are a Master Creative Technologist and UI/UX Designer.
Craft high-fidelity designs, thoughtful narratives, and engaging user experiences.`
  },
  [TASK_TYPES.AUDIT]: {
    temperature: 0.05,
    repeatPenalty: 1.15,
    maxTokens: 3000,
    verbosity: "Rigorous, prioritized vulnerability and correctness scorecard with line-by-line findings.",
    systemPrompt: `You are a Skeptical Lead Security and QA Auditor.
Analyze code and architecture for memory leaks, injection attacks, race conditions, and unhandled edge cases.
Format all findings as VERDICT (PASS/FAIL) with severity ratings (Critical, High, Medium, Low).`
  },
  [TASK_TYPES.GENERAL]: {
    temperature: 0.3,
    repeatPenalty: 1.1,
    maxTokens: 2048,
    verbosity: "Direct, helpful, and concise.",
    systemPrompt: `You are Ultron, a sovereign autonomous assistant. Address the user strictly as 'Boss'. Be efficient, accurate, and proactive.`
  }
};

/**
 * Classifies task based on prompt intent and keywords
 */
function classifyTask(prompt) {
  if (!prompt || typeof prompt !== "string") return TASK_TYPES.GENERAL;
  const p = prompt.toLowerCase();

  if (/(audit|vulnerability|security|critique|reentrancy|leak|review|verify|check safety)/i.test(p)) {
    return TASK_TYPES.AUDIT;
  }
  if (/(code|build|implement|function|class|refactor|component|api|backend|frontend|script|bug fix|fix)/i.test(p)) {
    return TASK_TYPES.CODING;
  }
  if (/(research|investigate|search|compare|benchmark|literature|find|explain|architecture)/i.test(p)) {
    return TASK_TYPES.RESEARCH;
  }
  if (/(file|read|write|delete|directory|mkdir|move|copy|backup|clean|organize)/i.test(p)) {
    return TASK_TYPES.FILE_OPS;
  }
  if (/(story|design|ui|ux|brand|creative|marketing|essay|theme|copywrite)/i.test(p)) {
    return TASK_TYPES.CREATIVE;
  }
  return TASK_TYPES.GENERAL;
}

/**
 * Gets prompt configuration and tailored instructions for a given task
 */
function getTaskConfig(prompt) {
  const taskType = classifyTask(prompt);
  const cfg = TASK_CONFIGS[taskType] || TASK_CONFIGS[TASK_TYPES.GENERAL];
  return {
    taskType,
    ...cfg
  };
}

/**
 * Injects tail recency constraints into prompt to prevent instruction degradation
 */
function injectRecencyConstraints(baseSystem, taskConfig) {
  const tailConstraint = `\n\n[MANDATORY OPERATIONAL CONSTRAINTS - RECENCY EMPHASIS]:\n- Task Type: ${taskConfig.taskType.toUpperCase()}\n- Verbosity Requirement: ${taskConfig.verbosity}\n- Strict Policy: Address user as 'Boss'. Do NOT omit critical code lines or hallucinate non-existent files.`;
  return baseSystem + tailConstraint;
}

module.exports = {
  TASK_TYPES,
  classifyTask,
  getTaskConfig,
  injectRecencyConstraints
};
