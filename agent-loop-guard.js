/**
 * ============================================================================
 *  AGENT LOOP HYGIENE & REPETITION BREAKER GUARD (2026 ARCHITECTURE)
 *  Ported from deepseek-harness-master/packages/guard
 *  - Intercepts identical duplicate tool calls
 *  - Detects repeating error cycles & oscillating patterns (A-B-A-B)
 *  - Injects remedial strategy hints before agent gets stuck
 * ============================================================================
 */
"use strict";

const MAX_HISTORY_WINDOW = 12;
const MAX_IDENTICAL_CALLS_ALLOWED = 2;

class AgentLoopGuard {
  constructor() {
    this.history = [];
  }

  /**
   * Generates a stable fingerprint for a tool call
   */
  fingerprint(toolName, args = {}) {
    try {
      const keys = Object.keys(args).sort();
      const normalizedArgs = {};
      for (const k of keys) {
        normalizedArgs[k] = args[k];
      }
      return `${toolName}::${JSON.stringify(normalizedArgs)}`;
    } catch (_) {
      return `${toolName}::raw`;
    }
  }

  /**
   * Records a tool execution into sliding window
   */
  record(toolName, args, result = "", isError = false) {
    const fp = this.fingerprint(toolName, args);
    const entry = {
      toolName,
      args,
      fp,
      isError: isError || (typeof result === "string" && /error|failed|rejected|syntaxerror/i.test(result)),
      resultSnippet: String(result).slice(0, 200),
      timestamp: Date.now()
    };

    this.history.push(entry);
    if (this.history.length > MAX_HISTORY_WINDOW) {
      this.history.shift();
    }

    return entry;
  }

  /**
   * Evaluates whether a proposed tool call constitutes a harmful loop
   */
  checkAnomaly(toolName, args) {
    const targetFp = this.fingerprint(toolName, args);

    if (this.history.length === 0) {
      return { isLoop: false };
    }

    // 1. Check consecutive identical calls
    let consecutiveCount = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].fp === targetFp) {
        consecutiveCount++;
      } else {
        break;
      }
    }

    if (consecutiveCount >= MAX_IDENTICAL_CALLS_ALLOWED) {
      const last = this.history[this.history.length - 1];
      return {
        isLoop: true,
        type: "consecutive_identical",
        count: consecutiveCount,
        warning: `⚠️ [LOOP GUARD INTERVENTION]: You have invoked '${toolName}' ${consecutiveCount} times in a row with identical arguments. Prior error: "${last.resultSnippet}". You MUST modify your approach or verify file existence rather than repeating the same call.`
      };
    }

    // 2. Check 2-step oscillation loop (A -> B -> A -> B -> A)
    if (this.history.length >= 4) {
      const h = this.history;
      const len = h.length;
      if (
        h[len - 1].fp === h[len - 3].fp &&
        h[len - 2].fp === h[len - 4].fp &&
        h[len - 1].fp !== h[len - 2].fp &&
        targetFp === h[len - 2].fp
      ) {
        return {
          isLoop: true,
          type: "oscillating_pattern",
          warning: `⚠️ [LOOP GUARD INTERVENTION]: Oscillating pattern detected between '${h[len - 1].toolName}' and '${h[len - 2].toolName}'. Stop alternating and diagnose the root cause.`
        };
      }
    }

    // 3. Repeated error threshold on same tool
    const recentErrorsOnTool = this.history.filter(h => h.toolName === toolName && h.isError).length;
    if (recentErrorsOnTool >= 3) {
      return {
        isLoop: true,
        type: "repeated_tool_failure",
        warning: `⚠️ [LOOP GUARD INTERVENTION]: '${toolName}' has failed 3 times recently. Check environment variables, file permissions, or consider a different tool.`
      };
    }

    return { isLoop: false };
  }

  reset() {
    this.history = [];
  }
}

const defaultGuard = new AgentLoopGuard();

module.exports = {
  AgentLoopGuard,
  agentLoopGuard: defaultGuard
};
