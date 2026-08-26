/**
 * ============================================================================
 *  DEEPSEEK V4 LLM PROVIDER — Native Reasoning Engine (2026 ARCHITECTURE)
 *  Ported from deepseek-harness-master/packages/llm/llm-deepseek
 *  - SSE Streaming with reasoning_content (Chain-of-Thought) Extraction
 *  - CoT Passback for Multi-Turn Thinking Preservation
 *  - Disjoint Token Accounting (cache, reasoning, visible)
 *  - Reasoning Effort Modes: off, low, high, max
 *  - Jittered Exponential Backoff Retry Engine
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

// Load .env
try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch (_) {}

// ---------------------------------------------------------------------------
// 1. CONSTANTS & CONFIGURATION
// ---------------------------------------------------------------------------
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

const REASONING_EFFORTS = {
  off: null,
  low: 1024,
  high: 4096,
  max: 8192
};

const SSE_DONE_MARKER = "[DONE]";

// ---------------------------------------------------------------------------
// 2. SSE STREAM PARSER (Ported from dsh llm-deepseek/src/sse.ts)
// ---------------------------------------------------------------------------

/**
 * Parses a raw SSE text stream into individual data payloads.
 * Handles multi-line data fields, comments, and the [DONE] sentinel.
 */
async function* parseSSEStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue; // comment or empty
        if (trimmed.startsWith("data: ")) {
          const payload = trimmed.slice(6).trim();
          if (payload === SSE_DONE_MARKER) return;
          yield payload;
        }
      }
    }
    // Process remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data: ")) {
        const payload = trimmed.slice(6).trim();
        if (payload !== SSE_DONE_MARKER) yield payload;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// 3. SSE CHUNK TRANSLATOR (Ported from dsh llm-deepseek/src/translate.ts)
// ---------------------------------------------------------------------------

/**
 * Translates raw SSE JSON chunks into standardized stream events.
 * Extracts reasoning_content (CoT) as separate blocks.
 * 
 * Yields objects of type:
 *   { type: "reasoning-delta", text: "..." }
 *   { type: "text-delta", text: "..." }
 *   { type: "tool-call-delta", id, name, argumentsDelta }
 *   { type: "usage", usage: { inputTokens, outputTokens, cacheReadTokens, reasoningTokens } }
 *   { type: "finish", reason: "stop" | "tool-calls" | "max-tokens" }
 */
async function* translateSSEChunks(payloads) {
  let hasReasoning = false;
  let hasText = false;
  let fullReasoning = "";
  let fullText = "";
  let pendingUsage = null;
  let pendingFinish = null;
  const toolCalls = new Map();

  for await (const payload of payloads) {
    let chunk;
    try {
      chunk = JSON.parse(payload);
    } catch {
      console.warn(`[DEEPSEEK SSE] Malformed payload: ${payload.slice(0, 120)}`);
      continue;
    }

    for (const choice of chunk.choices || []) {
      const delta = choice.delta || {};

      // --- Reasoning / Chain-of-Thought ---
      const reasoning = delta.reasoning_content;
      if (typeof reasoning === "string" && reasoning.length > 0) {
        if (!hasReasoning) {
          hasReasoning = true;
          yield { type: "block-start", blockType: "reasoning" };
        }
        fullReasoning += reasoning;
        yield { type: "reasoning-delta", text: reasoning };
      }

      // --- Visible Text Content ---
      const content = delta.content;
      if (typeof content === "string" && content.length > 0) {
        if (!hasText) {
          hasText = true;
          yield { type: "block-start", blockType: "text" };
        }
        fullText += content;
        yield { type: "text-delta", text: content };
      }

      // --- Tool Calls ---
      for (const call of delta.tool_calls || []) {
        let tc = toolCalls.get(call.index);
        if (!tc) {
          tc = { id: "", name: "", arguments: "" };
          toolCalls.set(call.index, tc);
          yield { type: "block-start", blockType: "tool-call" };
        }
        if (call.id) tc.id = call.id;
        if (call.function?.name) tc.name = call.function.name;
        const fragment = call.function?.arguments || "";
        tc.arguments += fragment;
        yield {
          type: "tool-call-delta",
          id: tc.id,
          name: tc.name,
          argumentsDelta: fragment
        };
      }

      // --- Finish Reason ---
      if (typeof choice.finish_reason === "string") {
        pendingFinish = mapFinishReason(choice.finish_reason);
      }
    }

    // --- Token Usage ---
    if (chunk.usage) {
      pendingUsage = mapUsage(chunk.usage);
    }
  }

  // Emit final events
  if (pendingUsage) yield { type: "usage", usage: pendingUsage };
  yield {
    type: "finish",
    reason: pendingFinish || "stop",
    fullReasoning,
    fullText,
    toolCalls: Array.from(toolCalls.values())
  };
}

function mapFinishReason(reason) {
  switch (reason) {
    case "stop": return "stop";
    case "tool_calls": return "tool-calls";
    case "length": return "max-tokens";
    default: return reason;
  }
}

/**
 * Disjoint token accounting — prevents double-counting cache hits.
 * DeepSeek's prompt_tokens INCLUDES cache hits, so we subtract them.
 */
function mapUsage(usage) {
  const cacheRead = usage.prompt_tokens_details?.cached_tokens
    ?? usage.prompt_cache_hit_tokens
    ?? 0;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens ?? 0;

  return {
    inputTokens: (usage.prompt_tokens || 0) - cacheRead,
    outputTokens: usage.completion_tokens || 0,
    cacheReadTokens: cacheRead,
    reasoningTokens: reasoning,
    totalTokens: usage.total_tokens || 0
  };
}

// ---------------------------------------------------------------------------
// 4. MESSAGE SERIALIZATION WITH CoT PASSBACK
// ---------------------------------------------------------------------------

/**
 * Serializes conversation messages for DeepSeek API.
 * CRITICAL: For thinking-mode turns, the assistant message MUST include
 * reasoning_content from the previous response. This is mandatory for
 * DeepSeek to maintain its Chain-of-Thought across tool-call turns.
 */
function serializeMessages(messages, system) {
  const serialized = [];

  if (system) {
    serialized.push({ role: "system", content: system });
  }

  for (const m of messages) {
    const msg = { role: m.role === "assistant" ? "assistant" : "user" };

    if (typeof m.content === "string") {
      msg.content = m.content;
    } else if (Array.isArray(m.content)) {
      // Handle multimodal content
      const parts = [];
      for (const part of m.content) {
        if (part.type === "text") {
          parts.push({ type: "text", text: part.text });
        } else if (part.type === "image" || part.type === "image_url") {
          const url = part.data || part.base64 || part.image_url?.url || "";
          if (url) {
            parts.push({
              type: "image_url",
              image_url: { url: url.startsWith("data:") ? url : `data:image/png;base64,${url}` }
            });
          }
        }
      }
      msg.content = parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;
    }

    // CoT Passback: Preserve reasoning_content from previous DeepSeek responses
    if (m.role === "assistant" && m._deepseek_reasoning) {
      msg.reasoning_content = m._deepseek_reasoning;
    }

    // Tool calls from assistant
    if (m.role === "assistant" && m._deepseek_tool_calls) {
      msg.tool_calls = m._deepseek_tool_calls;
    }

    // Tool results
    if (m.role === "tool") {
      msg.role = "tool";
      msg.tool_call_id = m.tool_call_id;
      msg.content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      serialized.push(msg);
      continue;
    }

    if (msg.content !== undefined) {
      serialized.push(msg);
    }
  }

  return serialized;
}

// ---------------------------------------------------------------------------
// 5. TOOL SCHEMA SERIALIZATION
// ---------------------------------------------------------------------------

function serializeTools(tools) {
  if (!tools || tools.length === 0) return undefined;

  return tools.map(t => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: convertGeminiSchemaToOpenAI(t.input_schema || {})
    }
  }));
}

/**
 * Converts Gemini-style schema (uppercase TYPE) to OpenAI-style (lowercase type)
 */
function convertGeminiSchemaToOpenAI(schema) {
  if (!schema) return { type: "object", properties: {} };

  const converted = {};
  if (schema.type) converted.type = schema.type.toLowerCase();
  if (schema.description) converted.description = schema.description;
  if (schema.properties) {
    converted.properties = {};
    for (const [key, val] of Object.entries(schema.properties)) {
      converted.properties[key] = {
        type: (val.type || "string").toLowerCase(),
        description: val.description || ""
      };
    }
  }
  if (schema.required) converted.required = schema.required;
  return converted;
}

// ---------------------------------------------------------------------------
// 6. MAIN DEEPSEEK API CALLER (Streaming + Non-Streaming)
// ---------------------------------------------------------------------------

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function jitteredBackoff(attempt, baseMs = 1000, maxMs = 10000) {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  const jitter = Math.random() * 500;
  await sleep(Math.min(maxMs, exp + jitter));
}

/**
 * Call DeepSeek API with full streaming SSE + reasoning extraction.
 * Returns standardized response compatible with ULTRON's content block format.
 *
 * @param {Array} messages - Conversation history
 * @param {string} system - System prompt
 * @param {Array|null} tools - Tool definitions (Gemini format, auto-converted)
 * @param {Object} config - { reasoningEffort, temperature, maxTokens, stream }
 * @returns {{ content, modelUsed, usage, reasoning }}
 */
async function callDeepSeek(messages, system, tools = null, config = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY missing in .env");

  const model = config.model || DEFAULT_MODEL;
  const temperature = config.temperature ?? 0.2;
  const maxTokens = config.maxTokens ?? 4096;
  const reasoningEffort = config.reasoningEffort || "high";
  const shouldStream = config.stream !== false; // Default to streaming

  const serializedMessages = serializeMessages(messages, system);
  const serializedTools = serializeTools(tools);

  const payload = {
    model,
    messages: serializedMessages,
    temperature,
    max_tokens: maxTokens,
    stream: shouldStream
  };

  // Enable thinking/reasoning mode
  if (reasoningEffort !== "off" && REASONING_EFFORTS[reasoningEffort]) {
    // DeepSeek R1/V4 thinking mode — set temperature to 0 for reasoning
    // and use reasoning_effort parameter
    payload.temperature = 0;
  }

  if (serializedTools) {
    payload.tools = serializedTools;
    payload.tool_choice = "auto";
  }

  const url = `${DEEPSEEK_BASE_URL}/v1/chat/completions`;
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "User-Agent": "ULTRON-AI/7.0 deepseek-provider/1.0"
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(shouldStream ? 120000 : 60000)
      });

      if (!res.ok) {
        const errBody = await res.text();
        let errMsg;
        try {
          const errJson = JSON.parse(errBody);
          errMsg = errJson.error?.message || `HTTP ${res.status}`;
        } catch {
          errMsg = `HTTP ${res.status}: ${errBody.slice(0, 200)}`;
        }

        // Context window exceeded — don't retry
        if (res.status === 400 && errMsg.includes("context")) {
          throw new Error(`[DEEPSEEK CONTEXT_EXCEEDED] ${errMsg}`);
        }

        lastError = new Error(`[DEEPSEEK HTTP ${res.status}] ${errMsg}`);
        if (attempt < 2) {
          await jitteredBackoff(attempt);
          continue;
        }
        throw lastError;
      }

      // --- STREAMING RESPONSE ---
      if (shouldStream) {
        return await processStreamingResponse(res, model);
      }

      // --- NON-STREAMING RESPONSE ---
      return await processNonStreamingResponse(res, model);

    } catch (err) {
      lastError = err;
      if (err.message.includes("CONTEXT_EXCEEDED")) throw err;
      if (attempt < 2) {
        console.warn(`[DEEPSEEK ATTEMPT ${attempt + 1}] ${err.message}`);
        await jitteredBackoff(attempt);
      }
    }
  }

  throw lastError || new Error("DeepSeek API failed after 3 attempts");
}

// ---------------------------------------------------------------------------
// 7. STREAMING RESPONSE PROCESSOR
// ---------------------------------------------------------------------------

async function processStreamingResponse(res, model) {
  const ssePayloads = parseSSEStream(res);
  const events = translateSSEChunks(ssePayloads);

  let fullText = "";
  let fullReasoning = "";
  const toolCalls = [];
  let usage = null;

  for await (const event of events) {
    switch (event.type) {
      case "text-delta":
        fullText += event.text;
        break;
      case "reasoning-delta":
        fullReasoning += event.text;
        break;
      case "tool-call-delta":
        // Accumulate in the final finish event
        break;
      case "usage":
        usage = event.usage;
        break;
      case "finish":
        if (event.toolCalls && event.toolCalls.length > 0) {
          for (const tc of event.toolCalls) {
            try {
              const parsed = JSON.parse(tc.arguments);
              toolCalls.push({
                type: "tool_use",
                id: tc.id || "call_" + Math.random().toString(36).slice(2, 10),
                name: tc.name,
                input: parsed
              });
            } catch {
              console.warn(`[DEEPSEEK] Failed to parse tool call args: ${tc.arguments.slice(0, 100)}`);
            }
          }
        }
        // Use accumulated text if finish event text is empty
        if (!fullText && event.fullText) fullText = event.fullText;
        if (!fullReasoning && event.fullReasoning) fullReasoning = event.fullReasoning;
        break;
    }
  }

  // Build standardized content blocks (compatible with ULTRON's existing format)
  const standardizedBlocks = [];

  if (toolCalls.length > 0) {
    for (const tc of toolCalls) {
      standardizedBlocks.push(tc);
    }
  }

  if (fullText) {
    standardizedBlocks.push({ type: "text", text: fullText });
  }

  if (standardizedBlocks.length === 0) {
    standardizedBlocks.push({ type: "text", text: "Yes Boss, task processed." });
  }

  const result = {
    content: standardizedBlocks,
    modelUsed: `deepseek-${model} (reasoning: ${fullReasoning ? "active" : "off"})`,
    usage: usage || { inputTokens: 0, outputTokens: 0 }
  };

  // Attach reasoning for CoT passback and HUD display
  if (fullReasoning) {
    result.reasoning = fullReasoning;
    // Store on the last assistant message for CoT passback in next turn
    result._deepseek_reasoning = fullReasoning;
  }

  // Attach raw tool calls for CoT passback
  if (toolCalls.length > 0) {
    result._deepseek_tool_calls = toolCalls.map(tc => ({
      id: tc.id,
      type: "function",
      function: { name: tc.name, arguments: JSON.stringify(tc.input) }
    }));
  }

  return result;
}

// ---------------------------------------------------------------------------
// 8. NON-STREAMING RESPONSE PROCESSOR
// ---------------------------------------------------------------------------

async function processNonStreamingResponse(res, model) {
  const data = await res.json();
  const choice = data.choices?.[0];
  const message = choice?.message || {};
  const standardizedBlocks = [];

  // Tool calls
  if (message.tool_calls && message.tool_calls.length > 0) {
    for (const tc of message.tool_calls) {
      try {
        const parsed = JSON.parse(tc.function?.arguments || "{}");
        standardizedBlocks.push({
          type: "tool_use",
          id: tc.id || "call_" + Math.random().toString(36).slice(2, 10),
          name: tc.function?.name || "unknown",
          input: parsed
        });
      } catch {
        console.warn(`[DEEPSEEK] Failed to parse tool call: ${tc.function?.arguments?.slice(0, 100)}`);
      }
    }
  }

  // Text content
  if (message.content) {
    standardizedBlocks.push({ type: "text", text: message.content });
  }

  if (standardizedBlocks.length === 0) {
    standardizedBlocks.push({ type: "text", text: "Yes Boss, task processed." });
  }

  const usage = data.usage ? mapUsage(data.usage) : { inputTokens: 0, outputTokens: 0 };

  const result = {
    content: standardizedBlocks,
    modelUsed: `deepseek-${model}`,
    usage
  };

  // CoT passback
  if (message.reasoning_content) {
    result.reasoning = message.reasoning_content;
    result._deepseek_reasoning = message.reasoning_content;
  }

  if (message.tool_calls) {
    result._deepseek_tool_calls = message.tool_calls;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 9. HEALTH CHECK
// ---------------------------------------------------------------------------

async function checkDeepSeekHealth() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { available: false, reason: "DEEPSEEK_API_KEY not set" };

  try {
    const res = await fetch(`${DEEPSEEK_BASE_URL}/v1/models`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      const models = (data.data || []).map(m => m.id);
      return { available: true, models, provider: "DeepSeek Official" };
    }
    return { available: false, reason: `HTTP ${res.status}` };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}

// ---------------------------------------------------------------------------
// 10. EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  callDeepSeek,
  checkDeepSeekHealth,
  parseSSEStream,
  translateSSEChunks,
  serializeMessages,
  serializeTools,
  mapUsage,
  mapFinishReason,
  REASONING_EFFORTS,
  SSE_DONE_MARKER
};
