/**
 * ============================================================================
 *  GROUP CHAT — multi-agent conversational collaboration
 *  Adapted (concept-level, original implementation) from AutoGen's
 *  RoundRobinGroupChat / SelectorGroupChat. This is a genuinely different
 *  collaboration pattern from what already exists in this project:
 *    - multi-agent-system.js's pipeline: fixed order, one-shot handoff
 *    - hierarchical-crew.js: a manager assigns ONE next specialist per step
 *    - group-chat.js (this file): N agents share a single growing
 *      conversation transcript and take turns responding to EACH OTHER,
 *      not just handing off a payload — closer to how a real team meeting
 *      would go, useful for debate/critique/brainstorm-style tasks.
 * ============================================================================
 */
"use strict";

const { maxMessages, or } = require("./termination-conditions");

/**
 * An "agent" here is just { name, description, respond(history) => string }
 * so any existing capability (a ruflo persona, a callSpecialist wrapper, a
 * fixed instruction set) can participate without adapting to a class hierarchy.
 */

/** Agents speak in the fixed order they were given, looping back to the
 * start, until the termination condition fires. Simple, predictable,
 * cheap (no extra "who speaks next" LLM call per turn). */
async function runRoundRobinGroupChat(agents, task, terminationCondition = maxMessages(10)) {
  if (!agents || agents.length === 0) throw new Error("runRoundRobinGroupChat requires at least one agent.");
  const messages = [{ source: "user", content: task }];
  let turnIndex = 0;

  while (true) {
    const check = terminationCondition(messages);
    if (check.done) return { messages, stoppedReason: check.reason };

    const agent = agents[turnIndex % agents.length];
    const historyText = messages.map(m => `[${m.source}]: ${m.content}`).join("\n\n");
    let content;
    try {
      content = await agent.respond(historyText, messages);
    } catch (err) {
      content = `[ERROR: ${agent.name} failed to respond: ${err.message}]`;
    }
    messages.push({ source: agent.name, content });
    turnIndex++;

    // Safety valve independent of the caller's termination condition — never
    // loop forever even if a badly-configured condition never fires.
    if (messages.length > 50) return { messages, stoppedReason: "Safety cap: 50 messages reached." };
  }
}

/**
 * A "selector" (an LLM call, by default) picks which agent speaks next based
 * on the conversation so far and each participant's description — useful
 * when the right next speaker genuinely depends on what was just said
 * (e.g. "the auditor found a bug" -> coder should speak next, not researcher).
 * @param {function} [selectorFn] - async (messages, agents) => agentName.
 *   Defaults to a simple heuristic (keyword overlap with agent descriptions)
 *   so this works without requiring an LLM call if the caller doesn't supply one.
 */
async function runSelectorGroupChat(agents, task, terminationCondition = maxMessages(10), selectorFn = null) {
  if (!agents || agents.length === 0) throw new Error("runSelectorGroupChat requires at least one agent.");
  const messages = [{ source: "user", content: task }];

  const defaultSelector = async (msgs) => {
    const last = msgs[msgs.length - 1];
    const lastWords = new Set(String(last.content).toLowerCase().split(/\W+/).filter(w => w.length > 3));
    let best = agents[0], bestScore = -1;
    for (const agent of agents) {
      const descWords = String(agent.description || "").toLowerCase();
      const score = [...lastWords].filter(w => descWords.includes(w)).length;
      if (score > bestScore) { bestScore = score; best = agent; }
    }
    return best.name;
  };
  const pickNext = selectorFn || defaultSelector;

  while (true) {
    const check = terminationCondition(messages);
    if (check.done) return { messages, stoppedReason: check.reason };

    let nextName;
    try {
      nextName = await pickNext(messages, agents);
    } catch (_) {
      nextName = agents[0].name; // fail safe to the first agent rather than crash the whole chat
    }
    const agent = agents.find(a => a.name === nextName) || agents[0];

    const historyText = messages.map(m => `[${m.source}]: ${m.content}`).join("\n\n");
    let content;
    try {
      content = await agent.respond(historyText, messages);
    } catch (err) {
      content = `[ERROR: ${agent.name} failed to respond: ${err.message}]`;
    }
    messages.push({ source: agent.name, content });

    if (messages.length > 50) return { messages, stoppedReason: "Safety cap: 50 messages reached." };
  }
}

module.exports = { runRoundRobinGroupChat, runSelectorGroupChat };
