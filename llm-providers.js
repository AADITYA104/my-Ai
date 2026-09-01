/**
 * ============================================================================
 *  LLM PROVIDERS - LOW-LOAD DUAL-ENGINE SMART ROUTER (2026 ARCHITECTURE)
 *  - Dynamic Task Classification, Tail Recency Bias & Temperature Tuning.
 *  - Few-Shot Tool-Call Calibration for Local Quantized Models (Qwen).
 *  - Jittered Exponential Backoff Retry Engine.
 *  - Repetition Penalty (1.15) & 30m Persistent Keep-Alive for Ollama.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const sessionContinuity = require("./session-continuity");
const skillEngine = require("./unified-skill-engine");
const { getTaskConfig, injectRecencyConstraints } = require("./task-classifier");
const costTracker = require("./cost-tracker");
const observability = require("./observability");
const circuitBreaker = require("./circuit-breaker");
const semanticCache = require("./semantic-cache");
let callDeepSeek = async () => { throw new Error("DeepSeek provider not available"); };
let checkDeepSeekHealth = async () => ({ online: false });
try {
  const dsp = require("./deepseek-provider");
  callDeepSeek = dsp.callDeepSeek;
  checkDeepSeekHealth = dsp.checkDeepSeekHealth;
} catch (_) {}

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

function detectProvider() {
  return "dual-engine-low-load-router";
}

// ---------------------------------------------------------------------------
// 0. TOKEN BUDGET PRE-CHECK & CONTEXT PRUNING
// ---------------------------------------------------------------------------
function estimateTokens(text) {
  if (!text) return 0;
  if (typeof text !== "string") text = JSON.stringify(text);
  return Math.ceil(text.length / 3.8);
}

function pruneContextIfNeeded(messages, maxTokens = 16000) {
  if (!Array.isArray(messages) || messages.length <= 4) return messages;

  let totalTokens = messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
  if (totalTokens <= maxTokens) return messages;

  console.log(`⚠️ [TOKEN GUARD] Context size (${totalTokens} tokens) exceeds limit (${maxTokens}). Pruning oldest turns...`);

  const preservedHead = messages.slice(0, 1);
  const preservedTail = messages.slice(-3);
  let middleTurns = messages.slice(1, -3);

  while (middleTurns.length > 0 && totalTokens > maxTokens) {
    const removed = middleTurns.shift();
    totalTokens -= estimateTokens(removed.content);
  }

  return [...preservedHead, { role: "user", content: "[SYSTEM]: ...Older conversation context condensed..." }, ...middleTurns, ...preservedTail];
}

// ---------------------------------------------------------------------------
// 1. JITTERED EXPONENTIAL BACKOFF
// ---------------------------------------------------------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function jitteredBackoff(attempt, baseMs = 1000, maxMs = 10000) {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  const jitter = Math.random() * 500;
  const delay = Math.min(maxMs, exp + jitter);
  await sleep(delay);
}

// ---------------------------------------------------------------------------
// 2. FEW-SHOT TOOL CALIBRATION FOR LOCAL QWEN / OLLAMA
// ---------------------------------------------------------------------------
const LOCAL_FEW_SHOT_TOOL_PROMPT = `
[TOOL INVOCATION FORMAT & FEW-SHOT EXAMPLES]:
When using a tool, you MUST output a valid JSON code block with "name" and "args".
Example 1 (Reading a file):
\`\`\`json
{
  "name": "read_file",
  "args": { "filePath": "src/index.js" }
}
\`\`\`

Example 2 (Writing code to a file):
\`\`\`json
{
  "name": "write_file",
  "args": { "filePath": "src/utils.js", "content": "export function sum(a, b) { return a + b; }" }
}
\`\`\`

Example 3 (Running terminal command):
\`\`\`json
{
  "name": "terminal_exec",
  "args": { "command": "npm test" }
}
\`\`\`
Do not include any conversational filler before or after the JSON block when invoking tools.`;

// ---------------------------------------------------------------------------
// 3. GOOGLE GEMINI DUAL-ENGINE CASCADE (0% Local RAM/CPU Load, <800ms)
// ---------------------------------------------------------------------------
const TIER1_FAST_MODELS = ["gemini-3.5-flash-lite", "gemini-flash-latest"];
const TIER2_DEEP_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];

async function callGemini(messages, system, tools = null, complexity = "fast", taskConfig = null) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY missing");

  const prunedMessages = pruneContextIfNeeded(messages, complexity === "deep" ? 28000 : 14000);

  const contents = [];
  for (const m of prunedMessages) {
    const role = m.role === "assistant" ? "model" : "user";
    const parts = [];

    if (typeof m.content === "string") {
      parts.push({ text: m.content });
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "image" || part.type === "image_url") {
          const mimeType = part.mimeType || part.mime_type || "image/png";
          const rawData = part.data || part.base64 || (part.image_url?.url || "");
          const cleanData = rawData.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
          if (cleanData) {
            parts.push({ inlineData: { mimeType, data: cleanData } });
          }
        } else if (part.type === "tool_use") {
          parts.push({ functionCall: { name: part.name, args: part.input || {} } });
        } else if (part.type === "tool_result") {
          parts.push({ functionResponse: { name: part.tool_name || "tool", response: { output: part.content } } });
        }
      }
    }

    if (m.image) {
      const mimeType = m.image.mimeType || "image/png";
      const rawData = typeof m.image === "string" ? m.image : (m.image.data || "");
      const cleanData = rawData.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
      if (cleanData) {
        parts.push({ inlineData: { mimeType, data: cleanData } });
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  const temp = taskConfig?.temperature ?? (complexity === "deep" ? 0.2 : 0.3);
  const maxTokens = taskConfig?.maxTokens ?? (complexity === "deep" ? 8000 : 2000);

  const generationConfig = {
    temperature: temp,
    maxOutputTokens: maxTokens
  };

  // Native Adaptive Thinking Budget for deep tasks
  if (complexity === "deep") {
    generationConfig.thinkingConfig = {
      thinkingBudget: 2048
    };
  }

  const payload = {
    contents,
    generationConfig
  };

  let effectiveSystem = system || "";
  if (taskConfig) {
    effectiveSystem = injectRecencyConstraints(effectiveSystem, taskConfig);
  }

  if (effectiveSystem) {
    payload.systemInstruction = { parts: [{ text: effectiveSystem }] };
  }

  if (tools && tools.length > 0) {
    payload.tools = [{
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema || { type: "OBJECT", properties: {} }
      }))
    }];
  }

  const candidateModels = complexity === "deep" ? TIER2_DEEP_MODELS : TIER1_FAST_MODELS;
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          lastError = new Error(data.error?.message || `HTTP ${res.status}`);
          continue;
        }
        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const standardizedBlocks = [];
        for (const part of parts) {
          if (part.text) standardizedBlocks.push({ type: "text", text: part.text });
          if (part.functionCall) {
            standardizedBlocks.push({
              type: "tool_use",
              id: "call_" + Math.random().toString(36).slice(2, 10),
              name: part.functionCall.name,
              input: part.functionCall.args || {}
            });
          }
        }
        if (standardizedBlocks.length === 0 && candidate?.finishReason) {
          standardizedBlocks.push({ type: "text", text: "Yes Boss, task processed." });
        }
        const usage = { input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: data.usageMetadata?.candidatesTokenCount || 0 };
        const modelUsed = `gemini-${model} (0% laptop load)`;
        try {
          costTracker.recordUsage({ modelUsed, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, taskType: taskConfig?.taskType || "general" });
          observability.logEvent("info", "llm_call", { provider: "gemini", model, usage });
        } catch (_) {}
        return {
          content: standardizedBlocks,
          modelUsed,
          usage
        };
      } catch (err) {
        lastError = err;
      }
    }
    await jitteredBackoff(attempt);
  }
  throw lastError || new Error("Gemini cascade failed.");
}

// ---------------------------------------------------------------------------
// 4. LOCAL OLLAMA ENGINE (Few-Shot Calibration & Repetition Penalty)
// ---------------------------------------------------------------------------
function parseLocalToolFallback(rawText) {
  if (!rawText || typeof rawText !== "string") return null;
  try {
    const match = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (match && match[1]) {
      const parsed = JSON.parse(match[1]);
      const toolName = parsed.name || parsed.tool || parsed.function;
      const toolInput = parsed.args || parsed.input || parsed.parameters || {};
      if (toolName) {
        return {
          type: "tool_use",
          id: "call_" + Math.random().toString(36).slice(2, 10),
          name: toolName,
          input: toolInput
        };
      }
    }
  } catch (_) {}
  return null;
}

async function callOllama(messages, system, maxRetries = 3, taskConfig = null) {
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "ultron-core";
  const url = `${host}/api/chat`;

  const prunedMessages = pruneContextIfNeeded(messages, 8000);

  let effectiveSystem = (system || "") + "\n" + LOCAL_FEW_SHOT_TOOL_PROMPT;
  if (taskConfig) {
    effectiveSystem = injectRecencyConstraints(effectiveSystem, taskConfig);
  }

  const ollamaMessages = [];
  if (effectiveSystem) ollamaMessages.push({ role: "system", content: effectiveSystem });

  for (const m of prunedMessages) {
    if (typeof m.content === "string") {
      ollamaMessages.push({ role: m.role, content: m.content });
    }
  }

  const temp = taskConfig?.temperature ?? 0.2;
  const repeatPenalty = taskConfig?.repeatPenalty ?? 1.15;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: ollamaMessages,
          stream: false,
          keep_alive: "30m",
          options: {
            temperature: temp,
            repeat_penalty: repeatPenalty
          }
        }),
        signal: AbortSignal.timeout(45000)
      });

      if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);

      const data = await res.json();
      const rawReply = data.message?.content || "";
      const standardizedBlocks = [];

      const fallbackTool = parseLocalToolFallback(rawReply);
      if (fallbackTool) {
        standardizedBlocks.push(fallbackTool);
      }
      standardizedBlocks.push({ type: "text", text: rawReply });

      const usage = { input_tokens: data.prompt_eval_count || 0, output_tokens: data.eval_count || 0 };
      const modelUsed = `local-ollama (${model})`;
      try {
        costTracker.recordUsage({ modelUsed, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, taskType: taskConfig?.taskType || "general" });
        observability.logEvent("info", "llm_call", { provider: "ollama", model, usage });
      } catch (_) {}

      return {
        content: standardizedBlocks,
        modelUsed,
        usage
      };
    } catch (err) {
      console.warn(`[OLLAMA ATTEMPT ${attempt}] ${err.message}`);
      if (attempt === maxRetries) {
        throw new Error(`Ollama busy/unreachable after retries.`);
      }
      await jitteredBackoff(attempt);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. LOW-LOAD SMART DISPATCHER WITH DYNAMIC TASK CLASSIFICATION
// ---------------------------------------------------------------------------
async function callUniversalLLM(messages, system, tools = null) {
  const continuityContext = sessionContinuity.getContextPrompt();
  let baseSystemWithContinuity = (system || "") + continuityContext;

  const lastMsg = messages[messages.length - 1]?.content || "";
  const queryStr = typeof lastMsg === "string" ? lastMsg : JSON.stringify(lastMsg);
  const taskConfig = getTaskConfig(queryStr);

  // Dynamic Skill Registry Injection across all universal LLM calls
  if (queryStr && typeof queryStr === "string" && queryStr.length > 5 && !baseSystemWithContinuity.includes("SKILL ENGINE GUIDANCE")) {
    try {
      baseSystemWithContinuity = skillEngine.buildEnrichedSystemPrompt(queryStr, baseSystemWithContinuity, 2);
    } catch (_) {}
  }

  // [SEMANTIC CACHE] Only cache pure text Q&A (no tools) — a cached tool_use
  // response would replay a stale action, which is unsafe. Cache key includes
  // the system prompt too, since the same user text under a different
  // persona/context should NOT hit the same cache entry.
  const cacheable = !tools || tools.length === 0;
  const cacheKey = `${baseSystemWithContinuity}\n---\n${queryStr}`;
  if (cacheable) {
    const cached = semanticCache.get(cacheKey);
    if (cached.hit) {
      observability.logEvent("info", "semantic_cache_hit", { type: cached.type, similarity: cached.similarity });
      return cached.response;
    }
  }

  const isOfflineForced = process.env.FORCE_OFFLINE === "true";
  const hasDeepSeekKey = !!(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim().length > 5);

  const geminiBreaker = circuitBreaker.getBreaker("gemini", { failureThreshold: 4, resetTimeoutMs: 30000 });

  let result;
  if (isOfflineForced) {
    try {
      result = await callOllama(messages, baseSystemWithContinuity, 3, taskConfig);
    } catch (_) {
      result = await callGemini(messages, baseSystemWithContinuity, tools, "fast", taskConfig);
    }
  } else {
    const isDeep = (tools && tools.length > 0) || taskConfig.taskType === "coding" || taskConfig.taskType === "audit" || taskConfig.taskType === "research";

    // Tier 0: DeepSeek V4 for coding/audit/research when configured
    if (hasDeepSeekKey && (isDeep || process.env.PREFERRED_PROVIDER === "deepseek")) {
      try {
        result = await callDeepSeek(messages, baseSystemWithContinuity, tools, {
          temperature: taskConfig.temperature,
          maxTokens: taskConfig.maxTokens,
          reasoningEffort: isDeep ? "high" : "low"
        });
      } catch (deepseekErr) {
        console.warn("⚠️ [DEEPSEEK FAILOVER TO GEMINI]", deepseekErr.message);
      }
    }

    if (!result) {
      try {
        result = await geminiBreaker.call(() => callGemini(messages, baseSystemWithContinuity, tools, isDeep ? "deep" : "fast", taskConfig));
      } catch (cloudErr) {
        console.warn("[CLOUD FAILOVER TO LOCAL]", cloudErr.message);
        result = await callOllama(messages, baseSystemWithContinuity, 3, taskConfig);
      }
    }
  }

  if (cacheable && result) {
    try { semanticCache.set(cacheKey, result); } catch (_) {}
  }
  return result;
}

module.exports = {
  detectProvider,
  callUniversalLLM,
  callDeepSeek,
  callGemini,
  callOllama,
  checkDeepSeekHealth,
  estimateTokens,
  pruneContextIfNeeded,
  jitteredBackoff,
  costTracker,
  observability,
  circuitBreaker,
  semanticCache
};
