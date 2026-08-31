/**
 * ============================================================================
 *  [8/10] CONTEXT / TOKEN BUDGET GUARD
 *  Production agents track token usage proactively per-session/per-task,
 *  not just per-call — a long autonomous run can silently drift toward a
 *  model's context limit across many tool calls. This tracks a running
 *  budget and returns actionable guidance (trim history, summarize,
 *  escalate) before a hard context-overflow error happens mid-task.
 * ============================================================================
 */
"use strict";

class ContextBudget {
  constructor(maxTokens = 32000, { warnAtPct = 70, criticalAtPct = 90 } = {}) {
    this.maxTokens = maxTokens;
    this.warnAtPct = warnAtPct;
    this.criticalAtPct = criticalAtPct;
    this.usedTokens = 0;
    this.history = []; // [{ label, tokens, ts }]
  }

  /** Record tokens consumed by one step (a message, a tool result, etc). */
  record(label, tokens) {
    this.usedTokens += tokens;
    this.history.push({ label, tokens, ts: Date.now() });
    return this.check();
  }

  check() {
    const pct = (this.usedTokens / this.maxTokens) * 100;
    let level = "ok";
    if (pct >= 100) level = "OVERFLOW";
    else if (pct >= this.criticalAtPct) level = "critical";
    else if (pct >= this.warnAtPct) level = "warning";
    return {
      level,
      pct: Number(pct.toFixed(1)),
      usedTokens: this.usedTokens,
      maxTokens: this.maxTokens,
      remainingTokens: Math.max(0, this.maxTokens - this.usedTokens),
      guidance: this._guidanceFor(level)
    };
  }

  _guidanceFor(level) {
    switch (level) {
      case "OVERFLOW": return "Context budget exceeded — summarize/drop older history before the next call or the model will hard-fail.";
      case "critical": return "Context budget critical — summarize older turns now, keep only the most recent + most relevant context.";
      case "warning": return "Context budget getting high — consider trimming verbose tool outputs from history.";
      default: return "";
    }
  }

  /** Find the biggest single contributors so far — useful for deciding
   * what to trim first (usually a huge tool output, not the conversation). */
  biggestContributors(n = 5) {
    return [...this.history].sort((a, b) => b.tokens - a.tokens).slice(0, n);
  }

  reset() {
    this.usedTokens = 0;
    this.history = [];
  }
}

module.exports = { ContextBudget };
