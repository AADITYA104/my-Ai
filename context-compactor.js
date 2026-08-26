/**
 * ============================================================================
 *  SMART CONTEXT COMPACTOR & TOOL RESULT PRUNER (2026 ARCHITECTURE)
 *  Ported from deepseek-harness-master/packages/compaction
 *  - Stage 1: Deterministic Zero-Cost Tool Result Pruning (Head + Tail Retention)
 *  - Stage 2: Balanced Tool-Pair Safe Region Compaction
 *  - Token Budget Estimation & Surface Region Replacement
 * ============================================================================
 */
"use strict";

const PRUNE_MARKER = "\n\n[... 🗜️ ULTRON COMPACTOR: Pruned %d characters of intermediate output ...]\n\n";

const DEFAULTS = {
  toolResultThresholdChars: 3000,
  toolResultHeadChars: 800,
  toolResultTailChars: 400,
  maxContextTokensDefault: 16000,
  maxContextTokensDeep: 32000,
  preserveTailTurns: 3
};

/**
 * Fast token estimator (~3.8 characters per token in average multilingual/code text)
 */
function estimateTokens(text) {
  if (!text) return 0;
  if (typeof text !== "string") text = JSON.stringify(text);
  return Math.ceil(text.length / 3.8);
}

/**
 * Measures total token count of a message array
 */
function measureTokens(messages) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      total += estimateTokens(m.content);
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.type === "text" && part.text) {
          total += estimateTokens(part.text);
        } else if (part.type === "tool_result" && part.content) {
          total += estimateTokens(part.content);
        } else if (part.type === "image" || part.type === "image_url") {
          total += 258; // Standard image token estimate
        }
      }
    }
  }
  return total;
}

/**
 * STAGE 1: Deterministic Zero-Cost Tool Result Pruning
 * Prunes oversized tool output while preserving the crucial head and tail.
 */
function pruneToolResultText(text, options = {}) {
  if (typeof text !== "string") return text;
  const threshold = options.thresholdChars || DEFAULTS.toolResultThresholdChars;
  const headChars = options.headChars || DEFAULTS.toolResultHeadChars;
  const tailChars = options.tailChars || DEFAULTS.toolResultTailChars;

  if (text.length <= threshold) return text;

  const removedCount = text.length - (headChars + tailChars);
  if (removedCount <= 0) return text;

  const marker = PRUNE_MARKER.replace("%d", removedCount.toLocaleString());
  return text.slice(0, headChars) + marker + text.slice(text.length - tailChars);
}

/**
 * Recursively applies Stage 1 tool result pruning across all messages
 */
function pruneToolResultsInMessages(messages, options = {}) {
  if (!Array.isArray(messages)) return messages;

  return messages.map(msg => {
    // If msg is role: 'tool' or contains tool_results
    if (msg.role === "tool" && typeof msg.content === "string") {
      return { ...msg, content: pruneToolResultText(msg.content, options) };
    }

    if (Array.isArray(msg.content)) {
      const updatedParts = msg.content.map(part => {
        if (part.type === "tool_result" && typeof part.content === "string") {
          return { ...part, content: pruneToolResultText(part.content, options) };
        }
        if (part.type === "text" && typeof part.text === "string" && part.text.length > (options.thresholdChars || 12000)) {
          return { ...part, text: pruneToolResultText(part.text, options) };
        }
        return part;
      });
      return { ...msg, content: updatedParts };
    }

    // Direct user/assistant huge text blocks (e.g. massive logs pasted)
    if (typeof msg.content === "string" && msg.content.length > (options.thresholdChars || 15000)) {
      return { ...msg, content: pruneToolResultText(msg.content, options) };
    }

    return msg;
  });
}

/**
 * Ensures tool-call and tool-result message pairings are kept atomic and not broken.
 */
function isToolPairSafe(messages, splitIndex) {
  if (splitIndex <= 0 || splitIndex >= messages.length) return true;
  const prev = messages[splitIndex - 1];
  const curr = messages[splitIndex];

  // If previous was an assistant tool_use and current is tool result, splitting here is UNSAFE
  if (prev && (prev.role === "assistant" || prev.role === "model")) {
    const hasToolCall = Array.isArray(prev.content) 
      ? prev.content.some(c => c.type === "tool_use")
      : false;
    if (hasToolCall && curr && curr.role === "tool") return false;
  }
  return true;
}

/**
 * STAGE 2: Token-Aware Context Compaction & Region Replacement
 * Compacts older turns while preserving recent history and tool pair consistency.
 */
function compactContext(messages, maxTokens = DEFAULTS.maxContextTokensDefault, options = {}) {
  if (!Array.isArray(messages) || messages.length <= 4) return messages;

  // 1. First run Stage 1 (Deterministic Tool Pruning)
  let working = pruneToolResultsInMessages(messages, options);
  let totalTokens = measureTokens(working);

  if (totalTokens <= maxTokens) {
    return working;
  }

  console.log(`🗜️ [COMPACTOR] Context tokens (${totalTokens}) exceed limit (${maxTokens}). Running Stage 2 region compaction...`);

  const preserveTailCount = options.preserveTailTurns || DEFAULTS.preserveTailTurns;
  const headIndex = 1; // Preserve initial user prompt / goal
  let tailStartIndex = Math.max(headIndex + 1, working.length - preserveTailCount);

  // Adjust tail start index to ensure tool pair safety
  while (tailStartIndex < working.length && !isToolPairSafe(working, tailStartIndex)) {
    tailStartIndex++;
  }

  const preservedHead = working.slice(0, headIndex);
  let middleRegion = working.slice(headIndex, tailStartIndex);
  const preservedTail = working.slice(tailStartIndex);

  // Condense middle region until within token budget
  const condensedSummaries = [];
  while (middleRegion.length > 0 && totalTokens > maxTokens) {
    const popped = middleRegion.shift();
    const role = popped.role || "user";
    let snippet = "";
    if (typeof popped.content === "string") {
      snippet = popped.content.slice(0, 150);
    } else if (Array.isArray(popped.content)) {
      snippet = popped.content.map(c => c.text || c.name || "").join(" ").slice(0, 150);
    }
    if (snippet) {
      condensedSummaries.push(`[${role.toUpperCase()}]: ${snippet.replace(/\n+/g, " ")}...`);
    }
    totalTokens = measureTokens([...preservedHead, ...middleRegion, ...preservedTail]);
  }

  const summaryBlock = {
    role: "user",
    content: `[🗜️ SYSTEM COMPACTED MEMORY CHECKPOINT]:\n${condensedSummaries.slice(-8).join("\n")}\n...[Prior dialogue turns condensed for token economy]...`
  };

  return [...preservedHead, summaryBlock, ...middleRegion, ...preservedTail];
}

module.exports = {
  estimateTokens,
  measureTokens,
  pruneToolResultText,
  pruneToolResultsInMessages,
  compactContext,
  DEFAULTS
};
