/**
 * ============================================================================
 *  TERMINATION CONDITIONS
 *  Adapted (concept-level, original implementation) from AutoGen's
 *  autogen_agentchat.conditions — a set of small, composable rules for when
 *  a multi-agent conversation should stop. Each condition is a function
 *  (messages) => { done: boolean, reason?: string } so they compose cleanly
 *  with `and`/`or` instead of needing a class hierarchy.
 *  `messages` is an array of { source, content, toolCalls? } in chronological order.
 * ============================================================================
 */
"use strict";

function maxMessages(n) {
  return (messages) => messages.length >= n
    ? { done: true, reason: `Reached max message count (${n}).` }
    : { done: false };
}

function textMention(text, caseSensitive = false) {
  const needle = caseSensitive ? text : text.toLowerCase();
  return (messages) => {
    const last = messages[messages.length - 1];
    if (!last) return { done: false };
    const haystack = caseSensitive ? String(last.content) : String(last.content).toLowerCase();
    return haystack.includes(needle)
      ? { done: true, reason: `Message from "${last.source}" mentioned "${text}".` }
      : { done: false };
  };
}

function timeout(ms) {
  const startedAt = Date.now();
  return () => (Date.now() - startedAt >= ms)
    ? { done: true, reason: `Conversation timed out after ${ms}ms.` }
    : { done: false };
}

function tokenUsage(maxTokens) {
  return (messages) => {
    const total = messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
    return total >= maxTokens
      ? { done: true, reason: `Token usage (${total}) reached the limit (${maxTokens}).` }
      : { done: false };
  };
}

/** Stops when a specific agent hands off to a specific target (or to "user"/"TERMINATE"). */
function handoff(targetName = "TERMINATE") {
  return (messages) => {
    const last = messages[messages.length - 1];
    if (!last) return { done: false };
    if (last.handoffTo === targetName || String(last.content).includes(targetName)) {
      return { done: true, reason: `Handoff to "${targetName}" detected from "${last.source}".` };
    }
    return { done: false };
  };
}

function functionCall(toolName) {
  return (messages) => {
    const last = messages[messages.length - 1];
    if (!last || !last.toolCalls) return { done: false };
    return last.toolCalls.some(tc => tc.name === toolName)
      ? { done: true, reason: `Tool "${toolName}" was called.` }
      : { done: false };
  };
}

/** An externally-triggered stop flag — call .set() from outside the loop
 * (e.g. a user clicking "stop" mid-conversation). */
function external() {
  let flagged = false;
  const condition = () => flagged ? { done: true, reason: "Externally stopped." } : { done: false };
  condition.set = () => { flagged = true; };
  condition.reset = () => { flagged = false; };
  return condition;
}

/** Wrap an arbitrary predicate as a termination condition. */
function functional(fn) {
  return (messages) => fn(messages) ? { done: true, reason: "Custom condition met." } : { done: false };
}

/** Stops as soon as ANY of the given conditions is met. */
function or(...conditions) {
  return (messages) => {
    for (const cond of conditions) {
      const result = cond(messages);
      if (result.done) return result;
    }
    return { done: false };
  };
}

/** Stops only once ALL of the given conditions are met simultaneously. */
function and(...conditions) {
  return (messages) => {
    const results = conditions.map(c => c(messages));
    if (results.every(r => r.done)) {
      return { done: true, reason: results.map(r => r.reason).filter(Boolean).join(" AND ") };
    }
    return { done: false };
  };
}

module.exports = { maxMessages, textMention, timeout, tokenUsage, handoff, functionCall, external, functional, or, and };
