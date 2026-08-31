/**
 * ============================================================================
 *  HIERARCHICAL CREW
 *  Adapted (concept-level, original implementation) from CrewAI's
 *  Process.hierarchical — instead of a fixed sequential pipeline (this
 *  project's existing runMultiAgentTeam always goes architect -> researcher
 *  -> coder -> auditor in that order), a manager LLM looks at progress so
 *  far after each step and DECIDES which specialist to call next (including
 *  re-running one, or stopping early once the goal is satisfied). Better
 *  fit for missions where the right next step genuinely depends on what
 *  came back, not just a fixed order.
 * ============================================================================
 */
"use strict";

const { callUniversalLLM } = require("./llm-providers");

const SPECIALISTS = ["architect", "researcher", "coder", "auditor"];

/**
 * @param {string} mission
 * @param {object} specialistFns - { architect, researcher, coder, auditor } async functions
 *   matching multi-agent-system.js's runArchitect/runResearcher/runCoder/runAuditor signatures
 * @param {number} maxSteps - hard cap so a confused manager can't loop forever
 */
async function runHierarchicalCrew(mission, specialistFns, maxSteps = 8) {
  const log = [];
  let handoff = null;
  let step = 0;

  while (step < maxSteps) {
    step++;
    const progressSummary = log.length === 0
      ? "Nothing done yet."
      : log.map((l, i) => `${i + 1}. ${l.specialist}: ${l.summary}`).join("\n");

    const managerSystem = `You are a manager coordinating a small team: architect, researcher, coder, auditor.
Given the mission and progress so far, decide the SINGLE next specialist to call, or "done" if the mission is complete.
Rules: architect must run before coder. auditor should run after coder produces something. Don't repeat a specialist unless progress specifically calls for revisiting it (e.g. auditor found a problem).
Respond ONLY with JSON: {"next": "architect"|"researcher"|"coder"|"auditor"|"done", "reason": "one sentence"}`;
    const managerMsg = `MISSION: ${mission}\n\nPROGRESS SO FAR:\n${progressSummary}`;

    let decision;
    try {
      const res = await callUniversalLLM([{ role: "user", content: managerMsg }], managerSystem);
      const text = res?.content?.find(b => b.type === "text")?.text || "";
      const match = text.match(/\{[\s\S]*\}/);
      decision = match ? JSON.parse(match[0]) : { next: "done", reason: "Could not parse manager decision." };
    } catch (err) {
      decision = { next: "done", reason: `Manager call failed: ${err.message}` };
    }

    if (decision.next === "done" || !SPECIALISTS.includes(decision.next)) {
      log.push({ specialist: "manager", summary: `Stopping: ${decision.reason || "mission complete"}` });
      break;
    }

    const specialistFn = specialistFns[decision.next];
    if (typeof specialistFn !== "function") {
      log.push({ specialist: "manager", summary: `Requested "${decision.next}" but no implementation was provided — stopping.` });
      break;
    }

    console.log(`\n👔 [MANAGER] Delegating to ${decision.next.toUpperCase()} — ${decision.reason || ""}`);

    if (decision.next === "architect") {
      handoff = await specialistFn(mission);
    } else {
      handoff = await specialistFn(handoff || { mission, payload: {}, handoff_depth: 0 });
    }

    const outputKey = decision.next === "architect" ? "spec" : decision.next === "researcher" ? "research" : decision.next === "coder" ? "code" : "audit";
    const summary = String(handoff?.payload?.[outputKey] || "").slice(0, 200);
    log.push({ specialist: decision.next, summary });
  }

  return { mission, steps: log, finalHandoff: handoff, stepsUsed: step };
}

module.exports = { runHierarchicalCrew, SPECIALISTS };
