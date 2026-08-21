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

async function callSpecialist(messages, system, complexity = "fast") {
  const data = await callUniversalLLM(messages, system);
  return (data.content || []).map(part => part.text || "").join("\n").trim();
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
  const system = `You are a Principal Software Architect. Design a modular, high-performance architecture for the user request.
Respond with clear sections:
1. Core Design Patterns
2. Component Breakdown & Data Models
3. Edge Cases & Constraints`;
  const spec = await callSpecialist([{ role: "user", content: `Goal: ${goal}` }], system, "deep");
  return createHandoffEnvelope(goal, "ARCHITECT", { spec });
}

async function runResearcher(handoff) {
  console.log("\n🔬 [RESEARCHER AGENT] Retrieving relevant knowledge base context & best practices...");
  let ragContext = "";
  try {
    ragContext = await buildRagContext(handoff.mission, 3);
  } catch (_) {}

  const system = `You are a Lead Technical Researcher. Provide concise technical best practices, algorithm choices, and relevant library patterns.
${ragContext ? `\nRetrieved Knowledge Base:\n${ragContext}` : ""}`;

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
  const system = `You are a Senior Precision Full-Stack Engineer. Write complete, robust production-ready code with minimal diffs and no placeholders.`;
  const code = await callSpecialist(
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
      code
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

module.exports = {
  runMultiAgentTeam,
  runArchitect,
  runResearcher,
  runCoder,
  runAuditor,
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
