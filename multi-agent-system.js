/**
 * ============================================================================
 *  MULTI-AGENT SYSTEM — Orchestrated Specialist Swarm (2026 ARCHITECTURE)
 *  Ported & Enhanced from deepseek-harness-master/packages/subagent & agent-team
 *  - Spawn vs Fork Subagent Execution Models
 *  - Shared Task DAG Board with Dependency Edges (blockedBy)
 *  - Typed JSON Handoff Contracts (Architect -> Researcher -> Coder -> Auditor)
 *  - Deadlock & Infinite Delegation Breaker (Max 5-hop depth)
 *  - DeepSeek Reasoning / CoT Trace Preservation
 * ============================================================================
 */
"use strict";

const { buildRagContext } = require("./rag-memory");
const { callUniversalLLM, callDeepSeek } = require("./llm-providers");
const { sessionStore } = require("./session-store");

// ---------------------------------------------------------------------------
// 1. TASK DAG BOARD (Ported from dsh-experimental-agent-team)
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

// ---------------------------------------------------------------------------
// 2. SUBAGENT EXECUTION (SPAWN vs FORK)
// ---------------------------------------------------------------------------

/**
 * Spawns an isolated child subagent with clean context.
 */
async function spawnSubagent(roleName, prompt, systemPrompt, tools = null) {
  console.log(`\n🌱 [SPAWN SUBAGENT: ${roleName}] Executing clean-context task...`);
  const response = await callUniversalLLM(
    [{ role: "user", content: prompt }],
    systemPrompt || `You are the ${roleName} specialist. Fulfill the user request with highest accuracy.`
  );
  const text = (response.content || []).map(p => p.text || "").join("\n").trim();
  return {
    role: roleName,
    mode: "spawn",
    output: text,
    reasoning: response.reasoning || null,
    modelUsed: response.modelUsed
  };
}

/**
 * Forks a subagent seeded with completed parent dialogue history.
 */
async function forkSubagent(roleName, prompt, systemPrompt, parentHistory = []) {
  console.log(`\n🌿 [FORK SUBAGENT: ${roleName}] Executing seeded-context task (${parentHistory.length} parent turns)...`);
  const messages = [...parentHistory, { role: "user", content: prompt }];
  const response = await callUniversalLLM(
    messages,
    systemPrompt || `You are the ${roleName} specialist. You inherit the full workspace context.`
  );
  const text = (response.content || []).map(p => p.text || "").join("\n").trim();
  return {
    role: roleName,
    mode: "fork",
    output: text,
    reasoning: response.reasoning || null,
    modelUsed: response.modelUsed
  };
}

// ---------------------------------------------------------------------------
// 3. TYPED JSON HANDOFF CONTRACT SCHEMA
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

async function callSpecialist(messages, system, complexity = "fast") {
  const data = await callUniversalLLM(messages, system);
  const text = (data.content || []).map(part => part.text || "").join("\n").trim();
  return { text, reasoning: data.reasoning || null, modelUsed: data.modelUsed };
}

// ---------------------------------------------------------------------------
// 4. SPECIALIST AGENTS
// ---------------------------------------------------------------------------

async function runArchitect(goal) {
  console.log("\n📐 [ARCHITECT AGENT] Designing technical blueprint...");
  const system = `You are a Principal Software Architect. Design a modular, high-performance architecture for the user request.
Respond with clear sections:
1. Core Design Patterns
2. Component Breakdown & Data Models
3. Edge Cases & Constraints`;
  const res = await callSpecialist([{ role: "user", content: `Goal: ${goal}` }], system, "deep");
  return createHandoffEnvelope(goal, "ARCHITECT", { spec: res.text, reasoning: res.reasoning });
}

async function runResearcher(handoff) {
  console.log("\n🔬 [RESEARCHER AGENT] Retrieving relevant knowledge base context & best practices...");
  let ragContext = "";
  try {
    ragContext = await buildRagContext(handoff.mission, 3);
  } catch (_) {}

  const system = `You are a Lead Technical Researcher. Provide concise technical best practices, algorithm choices, and relevant library patterns.
${ragContext ? `\nRetrieved Knowledge Base:\n${ragContext}` : ""}`;

  const res = await callSpecialist(
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
      research: res.text,
      researchReasoning: res.reasoning
    }
  };
}

async function runCoder(handoff) {
  console.log("\n💻 [CODER AGENT] Generating production implementation...");
  const system = `You are a Senior Precision Full-Stack Engineer. Write complete, robust production-ready code with minimal diffs and no placeholders.`;
  const res = await callSpecialist(
    [
      {
        role: "user",
        content: `Goal: ${handoff.mission}\nArchitect Blueprint:\n${handoff.payload.spec}\nResearch Findings:\n${handoff.payload.research || ""}`,
      },
    ],
    system,
    "deep"
  );

  return {
    ...handoff,
    stage: "IMPLEMENTATION",
    handoff_depth: handoff.handoff_depth + 1,
    payload: {
      ...handoff.payload,
      code: res.text,
      coderReasoning: res.reasoning
    }
  };
}

async function runAuditor(handoff) {
  console.log("\n🛡️ [SECURITY AUDITOR AGENT] Auditing code for security vulnerabilities, memory leaks, and correctness...");
  const system = `You are an independent, highly skeptical Security & QA Auditor. 
Evaluate the implementation strictly.
Format EXACTLY:
VERDICT: PASS or FAIL
REASON: <concise actionable critique>`;

  const res = await callSpecialist(
    [
      {
        role: "user",
        content: `Mission: ${handoff.mission}\nCode Implementation:\n${handoff.payload.code}`,
      },
    ],
    system,
    "fast"
  );

  const isPass = /VERDICT:\s*PASS/i.test(res.text);

  return {
    ...handoff,
    stage: "AUDIT",
    handoff_depth: handoff.handoff_depth + 1,
    payload: {
      ...handoff.payload,
      audit: res.text,
      verdict: isPass ? "PASS" : "FAIL"
    }
  };
}

// ---------------------------------------------------------------------------
// 5. MULTI-AGENT COLLABORATION PIPELINE WITH DEADLOCK BREAKER & TASK DAG
// ---------------------------------------------------------------------------
async function runMultiAgentTeam(mission, maxHandoffHops = 5) {
  console.log(`\n======================================================`);
  console.log(`🚀 LAUNCHING ENHANCED MULTI-AGENT SWARM FOR MISSION:`);
  console.log(`   "${mission}"`);
  console.log(`======================================================`);

  // Initialize Task DAG
  const dag = new TaskDAG();
  dag.createTask("t1_arch", "Architecture Design", "Principal Architect designs blueprint");
  dag.createTask("t2_research", "Technical Research", "Researcher gathers patterns and context", ["t1_arch"]);
  dag.createTask("t3_code", "Code Implementation", "Coder writes production code", ["t2_research"]);
  dag.createTask("t4_audit", "Security Audit", "Auditor validates security & correctness", ["t3_code"]);

  // Step 1: Architect
  dag.updateTaskStatus("t1_arch", "in_progress");
  let handoff = await runArchitect(mission);
  dag.updateTaskStatus("t1_arch", "completed", handoff.payload.spec);

  // Step 2: Researcher
  dag.updateTaskStatus("t2_research", "in_progress");
  handoff = await runResearcher(handoff);
  dag.updateTaskStatus("t2_research", "completed", handoff.payload.research);

  // Step 3: Coder
  dag.updateTaskStatus("t3_code", "in_progress");
  handoff = await runCoder(handoff);
  dag.updateTaskStatus("t3_code", "completed", handoff.payload.code);

  // Step 4 & Reflexion Loop with Max 5-Hop Deadlock Breaker
  let hopCount = 0;
  while (hopCount < maxHandoffHops) {
    hopCount++;
    console.log(`\n--- [SWARM VERIFICATION HOP ${hopCount}/${maxHandoffHops}] ---`);

    dag.updateTaskStatus("t4_audit", "in_progress");
    const auditHandoff = await runAuditor(handoff);
    console.log(`[AUDIT VERDICT]: ${auditHandoff.payload.verdict}`);

    if (auditHandoff.payload.verdict === "PASS") {
      dag.updateTaskStatus("t4_audit", "completed", auditHandoff.payload.audit);
      console.log("\n🎉 [SWARM SUCCESS] All specialist agents signed off with PASS verdict!");

      // Persist swarm milestone in SQLite session store
      sessionStore.logEvent("swarm_session", {
        role: "assistant",
        content: `Swarm Mission Completed: ${mission}`,
        reasoning: handoff.payload.coderReasoning || null
      });

      return {
        success: true,
        mission,
        blueprint: handoff.payload.spec,
        research: handoff.payload.research,
        finalCode: handoff.payload.code,
        auditReport: auditHandoff.payload.audit,
        dagSummary: dag.summary(),
        totalHops: hopCount
      };
    }

    // Deadlock breaker guard
    if (hopCount >= maxHandoffHops) {
      dag.updateTaskStatus("t4_audit", "failed", auditHandoff.payload.audit);
      console.warn("\n🚨 [DEADLOCK BREAKER] Swarm reached max handoff depth (5). Escalating to user.");
      return {
        success: false,
        mission,
        reason: "Max handoff depth reached without consensus",
        lastCode: handoff.payload.code,
        auditCritique: auditHandoff.payload.audit,
        dagSummary: dag.summary(),
        totalHops: hopCount
      };
    }

    // Refinement cycle: Coder fixes based on Auditor critique
    console.log("\n🔄 [REFLEXION] Coder refining implementation based on critique...");
    const fixSystem = `You are the Lead Implementer. Fix the audit failures identified by the Security Auditor.`;
    const fixedRes = await callSpecialist(
      [
        {
          role: "user",
          content: `Original Code:\n${handoff.payload.code}\n\nSecurity & QA Critique:\n${auditHandoff.payload.audit}\n\nPlease output the complete fixed solution.`
        }
      ],
      fixSystem,
      "deep"
    );

    handoff.payload.code = fixedRes.text;
  }
}

module.exports = {
  runMultiAgentTeam,
  runArchitect,
  runResearcher,
  runCoder,
  runAuditor,
  spawnSubagent,
  forkSubagent,
  TaskDAG,
  createHandoffEnvelope
};

if (require.main === module) {
  (async () => {
    const mission = process.argv[2] || "Build a secure token bucket rate limiter in Node.js";
    const result = await runMultiAgentTeam(mission);
    console.log("\n=== FINAL RESULT ===");
    console.log(result);
  })();
}
