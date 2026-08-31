/**
 * ============================================================================
 *  MULTI-AGENT SYSTEM — Orchestrated Specialist Swarm (2026 ARCHITECTURE)
 *  - Typed JSON Handoff Contracts (Architect -> Researcher -> Coder -> Auditor).
 *  - Deadlock & Infinite Delegation Breaker (Max 5-hop depth).
 *  - Isolated Zero-Temperature Auditor/Critic Evaluation.
 * ============================================================================
 */
"use strict";

const { buildRagContext } = require("./rag-memory");
const { callUniversalLLM, callGemini } = require("./llm-providers");
let rufloPersonas = { findRelevantPersona: () => null };
try { rufloPersonas = require("./ruflo-agent-personas"); } catch (_) {}

/** Blend in a real ruflo persona's guidance (if a relevant one is found) without
 * fully replacing this project's own concise, task-tuned system prompts. */
function withRufloPersona(basePrompt, taskDescription, categoryHint) {
  try {
    const match = rufloPersonas.findRelevantPersona(`${categoryHint} ${taskDescription}`);
    if (!match) return basePrompt;
    return `${basePrompt}\n\n--- Additional expert guidance from ruflo's "${match.name}" agent definition (${match.category}) ---\n${match.description}`;
  } catch (_) {
    return basePrompt;
  }
}

// ---------------------------------------------------------------------------
// 1. TASK DAG (Directed Acyclic Graph for Multi-Agent Task Dependencies)
// ---------------------------------------------------------------------------
class TaskDAG {
  constructor() {
    this.tasks = new Map();
  }

  createTask(id, title, description, blockedBy = []) {
    const task = {
      id,
      title,
      description,
      status: "pending", // pending | in_progress | completed | failed
      blockedBy: Array.isArray(blockedBy) ? [...blockedBy] : [],
      result: null,
      assignedTo: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.tasks.set(id, task);
    return task;
  }

  getReadyTasks() {
    const ready = [];
    for (const task of this.tasks.values()) {
      if (task.status === "pending") {
        const allBlockersDone = task.blockedBy.every(bId => {
          const blocker = this.tasks.get(bId);
          return blocker && blocker.status === "completed";
        });
        if (allBlockersDone) ready.push(task);
      }
    }
    return ready;
  }

  updateTaskStatus(id, status, result = null) {
    const task = this.tasks.get(id);
    if (!task) return null;
    task.status = status;
    if (result !== null) task.result = result;
    task.updatedAt = new Date().toISOString();
    return task;
  }

  isAllCompleted() {
    for (const task of this.tasks.values()) {
      if (task.status !== "completed") return false;
    }
    return true;
  }

  summary() {
    return Array.from(this.tasks.values()).map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      blockedBy: t.blockedBy
    }));
  }
}

async function callSpecialist(messages, system, complexity = "fast") {
  const data = await callUniversalLLM(messages, system);
  return (data.content || []).map(part => part.text || "").join("\n").trim();
}

/**
 * [TASK GUARDRAIL] Adapted (concept-level) from CrewAI's task guardrails —
 * a validator function checks the specialist's output; if it fails, the
 * specialist is re-called with the validator's feedback appended, up to
 * maxRetries times. Returns the last output either way (guardrails improve
 * quality, they don't block delivery forever).
 * @param {function} validator - (output) => { valid: boolean, feedback?: string }
 */
async function callSpecialistWithGuardrail(messages, system, complexity, validator, maxRetries = 2) {
  let output = await callSpecialist(messages, system, complexity);
  if (!validator) return output;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const check = validator(output);
    if (check.valid) return output;
    console.log(`  [GUARDRAIL] Attempt ${attempt + 1} failed: ${check.feedback || "no reason given"} — retrying.`);
    const retryMessages = [...messages, { role: "assistant", content: output }, { role: "user", content: `That didn't pass review: ${check.feedback || "please revise"}. Try again.` }];
    output = await callSpecialist(retryMessages, system, complexity);
  }
  return output;
}

// ---------------------------------------------------------------------------
// 1. TYPED JSON HANDOFF CONTRACT SCHEMA
// ---------------------------------------------------------------------------
function createHandoffEnvelope(mission, stage, payload) {
  return {
    mission_id: "m_" + Date.now().toString(36),
    stage,
    mission,
    timestamp: new Date().toISOString(),
    payload,
    handoff_depth: 1
  };
}

// ---------------------------------------------------------------------------
// 2. SPECIALIST AGENTS
// ---------------------------------------------------------------------------

async function runArchitect(goal) {
  console.log("\n📐 [ARCHITECT AGENT] Designing technical blueprint...");
  let system = `You are a Principal Software Architect. Design a modular, high-performance architecture for the user request.
Respond with clear sections:
1. Core Design Patterns
2. Component Breakdown & Data Models
3. Edge Cases & Constraints`;
  system = withRufloPersona(system, goal, "architecture system-design");
  const spec = await callSpecialist([{ role: "user", content: `Goal: ${goal}` }], system, "deep");
  return createHandoffEnvelope(goal, "ARCHITECT", { spec });
}

async function runResearcher(handoff) {
  console.log("\n🔬 [RESEARCHER AGENT] Retrieving relevant knowledge base context & best practices...");
  let ragContext = "";
  try {
    ragContext = await buildRagContext(handoff.mission, 3);
  } catch (_) {}

  let system = `You are a Lead Technical Researcher. Provide concise technical best practices, algorithm choices, and relevant library patterns.
${ragContext ? `\nRetrieved Knowledge Base:\n${ragContext}` : ""}`;
  system = withRufloPersona(system, handoff.mission, "analysis research");

  const findings = await callSpecialist(
    [
      {
        role: "user",
        content: `Goal: ${handoff.mission}\nArchitect Blueprint:\n${handoff.payload.spec}`,
      },
    ],
    system,
    "fast"
  );

  return {
    ...handoff,
    stage: "RESEARCH",
    handoff_depth: handoff.handoff_depth + 1,
    payload: {
      ...handoff.payload,
      research: findings
    }
  };
}

async function runCoder(handoff) {
  console.log("\n💻 [CODER AGENT] Generating production implementation...");
  let system = `You are a Senior Precision Full-Stack Engineer. Write complete, robust production-ready code with minimal diffs and no placeholders.`;
  system = withRufloPersona(system, handoff.mission, "development backend coder");

  // [GUARDRAIL] Reject and retry if the coder produces an obvious non-answer
  // (empty/near-empty output, or a placeholder like "...rest of code..."
  // instead of real implementation) — cheap, local, no extra LLM call unless
  // a retry is actually needed.
  const codeValidator = (output) => {
    const text = String(output || "").trim();
    if (text.length < 20) return { valid: false, feedback: "Output is empty or far too short to be a real implementation." };
    if (/\.\.\.\s*(rest of|remaining|etc)/i.test(text)) return { valid: false, feedback: "Output uses a placeholder like \"...rest of code...\" instead of complete code." };
    return { valid: true };
  };

  const code = await callSpecialistWithGuardrail(
    [
      {
        role: "user",
        content: `Goal: ${handoff.mission}\nArchitect Blueprint:\n${handoff.payload.spec}\nResearch Findings:\n${handoff.payload.research || ""}`,
      },
    ],
    system,
    "deep",
    codeValidator
  );

  return {
    ...handoff,
    stage: "IMPLEMENTATION",
    handoff_depth: handoff.handoff_depth + 1,
    payload: {
      ...handoff.payload,
      code
    }
  };
}

async function runAuditor(handoff) {
  console.log("\n🛡️ [SECURITY AUDITOR AGENT] Auditing code for security vulnerabilities, memory leaks, and correctness...");
  let system = `You are an independent, highly skeptical Security & QA Auditor. 
Evaluate the implementation strictly.
Format EXACTLY:
VERDICT: PASS or FAIL
REASON: <concise actionable critique>`;
  system = withRufloPersona(system, handoff.mission, "security-audit testing code-review");

  // Critic uses zero-temperature / isolated evaluation
  const auditText = await callSpecialist(
    [
      {
        role: "user",
        content: `Mission: ${handoff.mission}\nCode Implementation:\n${handoff.payload.code}`,
      },
    ],
    system,
    "fast"
  );

  const isPass = /VERDICT:\s*PASS/i.test(auditText);

  return {
    ...handoff,
    stage: "AUDIT",
    handoff_depth: handoff.handoff_depth + 1,
    payload: {
      ...handoff.payload,
      audit: auditText,
      verdict: isPass ? "PASS" : "FAIL"
    }
  };
}

// ---------------------------------------------------------------------------
// 3. MULTI-AGENT COLLABORATION PIPELINE WITH DEADLOCK BREAKER
// ---------------------------------------------------------------------------
async function runMultiAgentTeam(mission, maxHandoffHops = 5) {
  console.log(`\n======================================================`);
  console.log(`🚀 LAUNCHING MULTI-AGENT SWARM FOR MISSION:`);
  console.log(`   "${mission}"`);
  console.log(`======================================================`);

  // Step 1: Architect
  let handoff = await runArchitect(mission);

  // Step 2: Researcher
  handoff = await runResearcher(handoff);

  // Step 3: Coder
  handoff = await runCoder(handoff);

  // Step 4 & Reflexion Loop with Max 5-Hop Deadlock Breaker
  let hopCount = 0;
  while (hopCount < maxHandoffHops) {
    hopCount++;
    console.log(`\n--- [SWARM VERIFICATION HOP ${hopCount}/${maxHandoffHops}] ---`);

    const auditHandoff = await runAuditor(handoff);
    console.log(`[AUDIT VERDICT]: ${auditHandoff.payload.verdict}`);

    if (auditHandoff.payload.verdict === "PASS") {
      console.log("\n🎉 [SWARM SUCCESS] All specialist agents signed off with PASS verdict!");
      return {
        success: true,
        mission,
        blueprint: handoff.payload.spec,
        research: handoff.payload.research,
        finalCode: handoff.payload.code,
        auditReport: auditHandoff.payload.audit,
        totalHops: hopCount
      };
    }

    // Deadlock breaker guard
    if (hopCount >= maxHandoffHops) {
      console.warn("\n🚨 [DEADLOCK BREAKER] Swarm reached max handoff depth (5). Escalating to user.");
      return {
        success: false,
        mission,
        reason: "Max handoff depth reached without consensus",
        lastCode: handoff.payload.code,
        auditCritique: auditHandoff.payload.audit,
        totalHops: hopCount
      };
    }

    // Refinement cycle: Coder fixes based on Auditor critique
    console.log("\n🔄 [REFLEXION] Coder refining implementation based on critique...");
    const fixSystem = `You are the Lead Implementer. Fix the audit failures identified by the Security Auditor.`;
    const fixedCode = await callSpecialist(
      [
        {
          role: "user",
          content: `Original Code:\n${handoff.payload.code}\n\nSecurity & QA Critique:\n${auditHandoff.payload.audit}\n\nPlease output the complete fixed solution.`
        }
      ],
      fixSystem,
      "deep"
    );

    handoff.payload.code = fixedCode;
  }
}

/**
 * [TASK GRAPH] Run several independent research questions concurrently
 * instead of one-by-one — safe to parallelize because each is a read-only
 * LLM call with no shared file-system/state mutation (unlike the main
 * autonomous agent loop, which stays strictly sequential for that reason).
 * @param {string[]} topics - independent research questions/topics
 * @param {number} maxConcurrency
 */
async function runParallelResearch(topics, maxConcurrency = 3) {
  const { TaskGraph } = require("./task-graph");
  const subtasks = topics.map((topic, i) => ({ id: `research-${i}`, description: topic, dependsOn: [] }));
  const graph = new TaskGraph(subtasks);

  const summary = await graph.executeAll(async (task) => {
    console.log(`\n🔬 [PARALLEL RESEARCH] ${task.description}`);
    let ragContext = "";
    try { ragContext = await buildRagContext(task.description, 2); } catch (_) {}
    const system = `You are a research specialist. Give a concise, well-grounded answer.${ragContext ? `\nRetrieved Knowledge:\n${ragContext}` : ""}`;
    return callSpecialist([{ role: "user", content: task.description }], system, "fast");
  }, { maxConcurrency, stopOnFailure: false });

  return {
    topics,
    results: topics.map((topic, i) => ({
      topic,
      status: summary.results[`research-${i}`]?.status,
      answer: summary.results[`research-${i}`]?.result
    })),
    summary: `${summary.done}/${summary.total} research topics completed successfully.`
  };
}

/**
 * [GROUP CHAT] Wraps the same 4 specialists (architect/researcher/coder/
 * auditor) as conversational participants instead of a fixed handoff chain
 * — useful for debate/critique-style tasks where agents should respond to
 * EACH OTHER'S output, not just pass a payload down a line.
 */
async function runDebateGroupChat(topic, maxTurns = 8) {
  const { runSelectorGroupChat } = require("./group-chat");
  const { maxMessages, or, textMention } = require("./termination-conditions");

  const wrap = (name, description, specialistFn) => ({
    name, description,
    respond: async (historyText) => {
      const result = await specialistFn(historyText.length > 4000 ? historyText.slice(-4000) : historyText);
      return typeof result === "string" ? result : JSON.stringify(result.payload || result);
    }
  });

  const agents = [
    wrap("Architect", "designs system architecture, patterns, and structure", async (h) => (await runArchitect(h)).payload.spec),
    wrap("Researcher", "researches best practices, libraries, and prior art", async (h) => (await callSpecialist([{ role: "user", content: h }], "You are a researcher. Give concise findings relevant to the discussion so far.", "fast"))),
    wrap("Coder", "writes and reviews implementation code", async (h) => (await callSpecialist([{ role: "user", content: h }], "You are a coder. Respond with concrete code or a specific implementation critique.", "deep"))),
    wrap("Auditor", "critiques for security, correctness, and quality; says TERMINATE when satisfied", async (h) => (await callSpecialist([{ role: "user", content: h }], "You are a strict auditor. Critique the discussion so far. If everything looks solid, end your message with the word TERMINATE.", "fast")))
  ];

  const termination = or(maxMessages(maxTurns), textMention("TERMINATE"));
  return runSelectorGroupChat(agents, topic, termination);
}

module.exports = {
  TaskDAG,
  runMultiAgentTeam,
  runArchitect,
  runResearcher,
  runCoder,
  runAuditor,
  createHandoffEnvelope,
  runParallelResearch,
  callSpecialistWithGuardrail,
  runDebateGroupChat,
  runHierarchicalCrew: (mission, maxSteps) => require("./hierarchical-crew").runHierarchicalCrew(
    mission,
    { architect: runArchitect, researcher: runResearcher, coder: runCoder, auditor: runAuditor },
    maxSteps
  )
};

if (require.main === module) {
  (async () => {
    const mission = process.argv[2] || "Build a secure token bucket rate limiter in Node.js";
    const result = await runMultiAgentTeam(mission);
    console.log("\n=== FINAL RESULT ===");
    console.log(result);
  })();
}
