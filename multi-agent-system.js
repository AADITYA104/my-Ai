/**
 * ============================================================================
 *  MULTI-AGENT SYSTEM — Orchestrated Specialist Team (Architect, Researcher, Coder, Auditor)
 * ============================================================================
 *
 * Implements Pillar 5 (Multi-Agent System) from the 12-pillar architecture:
 *
 *   1. ARCHITECT (Planner): Breaks complex missions into modular specs.
 *   2. RESEARCHER: Gathers context from RAG knowledge base & web.
 *   3. CODER / BUILDER: Implements clean, robust code with native tools.
 *   4. SECURITY AUDITOR / CRITIC: Audits code for vulnerabilities, bugs & edge cases.
 *
 * RUN:
 *   ANTHROPIC_API_KEY=xxx node multi-agent-system.js "Build a secure token bucket rate limiter in Node.js"
 * ============================================================================
 */

const { buildRagContext } = require("./rag-memory");
const { callUniversalLLM } = require("./llm-providers");

async function callSpecialist(messages, system) {
  const data = await callUniversalLLM(messages, system);
  return (data.content || []).map(part => part.text || "").join("\n").trim();
}

// ---------------------------------------------------------------------------
// SPECIALIST AGENTS
// ---------------------------------------------------------------------------

async function runArchitect(goal) {
  console.log("\n📐 [ARCHITECT AGENT] Designing technical blueprint...");
  const system = `You are a Principal Software Architect. Design a modular, high-performance architecture for the user request.
Include:
1. Core Design Patterns
2. Component Breakdown
3. Edge Cases to Account For`;
  return await callSpecialist([{ role: "user", content: `Goal: ${goal}` }], system);
}

async function runResearcher(goal, blueprint) {
  console.log("\n🔬 [RESEARCHER AGENT] Retrieving relevant knowledge base context & best practices...");
  let ragContext = "";
  try {
    ragContext = await buildRagContext(goal, 3);
  } catch {}

  const system = `You are a Lead Research Specialist. Provide technical best practices, algorithm choices, and relevant context.
${ragContext ? `\nRetrieved Knowledge Base:\n${ragContext}` : ""}`;

  return await callSpecialist(
    [
      {
        role: "user",
        content: `Goal: ${goal}\nArchitect's Blueprint:\n${blueprint}`,
      },
    ],
    system
  );
}

async function runCoder(goal, blueprint, research) {
  console.log("\n💻 [CODER AGENT] Generating production implementation...");
  const system = `You are a Senior Full-Stack Engineer. Write clean, complete, robust production-ready code with comments.`;
  return await callSpecialist(
    [
      {
        role: "user",
        content: `Goal: ${goal}\nBlueprint:\n${blueprint}\nResearch & Best Practices:\n${research}`,
      },
    ],
    system
  );
}

async function runAuditor(goal, code) {
  console.log("\n🛡️ [SECURITY AUDITOR AGENT] Auditing code for security vulnerabilities, memory leaks, and correctness...");
  const system = `You are an elite Security & QA Auditor. Review the code rigorously for:
1. Security vulnerabilities & injection attacks
2. Memory leaks / concurrency race conditions
3. Missing edge case handling
Respond with VERDICT: PASS or FAIL, followed by a prioritized audit report.`;
  return await callSpecialist(
    [
      {
        role: "user",
        content: `Goal: ${goal}\nCode Implementation:\n${code}`,
      },
    ],
    system
  );
}

// ---------------------------------------------------------------------------
// MULTI-AGENT COLLABORATION PIPELINE
// ---------------------------------------------------------------------------
async function runMultiAgentTeam(mission) {
  console.log(`\n======================================================`);
  console.log(`🚀 LAUNCHING MULTI-AGENT TEAM FOR MISSION:`);
  console.log(`   "${mission}"`);
  console.log(`======================================================`);

  const blueprint = await runArchitect(mission);
  const research = await runResearcher(mission, blueprint);
  const code = await runCoder(mission, blueprint, research);
  const audit = await runAuditor(mission, code);

  const isPassed = /VERDICT:\s*PASS/i.test(audit);

  return {
    mission,
    blueprint,
    research,
    code,
    audit,
    isPassed,
  };
}

module.exports = {
  runMultiAgentTeam,
  runArchitect,
  runResearcher,
  runCoder,
  runAuditor,
};

if (require.main === module) {
  (async () => {
    const mission = process.argv[2] || "Build a high-performance in-memory cache with TTL and LRU eviction in Node.js";
    const result = await runMultiAgentTeam(mission);
    console.log("\n=== MULTI-AGENT TEAM OUTPUT ===");
    console.log("\n--- ARCHITECT BLUEPRINT ---\n" + result.blueprint.slice(0, 500) + "...\n");
    console.log("\n--- GENERATED CODE ---\n" + result.code + "\n");
    console.log("\n--- AUDIT VERDICT ---\n" + result.audit + "\n");
  })();
}
