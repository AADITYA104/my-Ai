/**
 * ============================================================================
 *  LLM PROVIDERS - DUAL-ENGINE SMART TASK ROUTER & AUTO-FAILOVER
 *  Divides tasks between Fast Tier-1 (sub-second) and Deep Tier-2 (reasoning).
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

function detectProvider() {
  return "dual-engine-smart-router";
}

// ---------------------------------------------------------------------------
// 1. GOOGLE GEMINI DUAL-ENGINE CASCADE
// ---------------------------------------------------------------------------
const TIER1_FAST_MODELS = ["gemini-3.5-flash-lite", "gemini-flash-latest"];
const TIER2_DEEP_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];

async function callGemini(messages, system, tools, complexity = "fast") {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY missing");

  const contents = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") {
      contents.push({ role, parts: [{ text: m.content }] });
    } else if (Array.isArray(m.content)) {
      const parts = [];
      for (const part of m.content) {
        if (part.type === "text") parts.push({ text: part.text });
        else if (part.type === "tool_use") parts.push({ functionCall: { name: part.name, args: part.input || {} } });
        else if (part.type === "tool_result") parts.push({ functionResponse: { name: part.tool_name || "tool", response: { output: part.content } } });
      }
      if (parts.length > 0) contents.push({ role, parts });
    }
  }

  const payload = {
    contents,
    generationConfig: {
      temperature: complexity === "deep" ? 0.2 : 0.4,
      maxOutputTokens: complexity === "deep" ? 4000 : 1500
    }
  };

  if (system) {
    payload.systemInstruction = { parts: [{ text: system }] };
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
      return {
        content: standardizedBlocks,
        modelUsed: `gemini-${model} (${complexity})`,
        usage: { input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: data.usageMetadata?.candidatesTokenCount || 0 }
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Gemini cascade failed.");
}

// ---------------------------------------------------------------------------
// 2. LOCAL OLLAMA ENGINE (Offline Priority)
// ---------------------------------------------------------------------------
async function callOllama(messages, system) {
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "ultron-core";
  const url = `${host}/api/chat`;

  const ollamaMessages = [];
  if (system) ollamaMessages.push({ role: "system", content: system });

  for (const m of messages) {
    if (typeof m.content === "string") {
      ollamaMessages.push({ role: m.role, content: m.content });
    }
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: ollamaMessages, stream: false })
  });

  if (!res.ok) throw new Error(`Ollama Error (${res.status})`);

  const data = await res.json();
  return {
    content: [{ type: "text", text: data.message?.content || "" }],
    modelUsed: `local-ollama (${model})`,
    usage: { input_tokens: data.prompt_eval_count || 0, output_tokens: data.eval_count || 0 }
  };
}

// ---------------------------------------------------------------------------
// UNIVERSAL SMART DISPATCHER (Task Division Engine)
// ---------------------------------------------------------------------------
async function callUniversalLLM(messages, system, tools = null) {
  // Determine Task Complexity
  let isHeavyTask = false;
  if (tools && tools.length > 0) isHeavyTask = true;
  const lastMsg = messages[messages.length - 1]?.content || "";
  if (typeof lastMsg === "string") {
    if (/(code|build|refactor|fix|research|analyze|physics|math|audit|file|create|write)/i.test(lastMsg)) {
      isHeavyTask = true;
    }
  }

  // If simple conversational query -> Try local Ollama first, fallback to Fast Tier-1
  if (!isHeavyTask) {
    try {
      return await callOllama(messages, system);
    } catch (_) {
      return await callGemini(messages, system, tools, "fast");
    }
  }

  // If heavy reasoning/coding task -> Use Deep Tier-2 Gemini or specialized agent
  try {
    return await callGemini(messages, system, tools, "deep");
  } catch (_) {
    return await callGemini(messages, system, tools, "fast");
  }
}

module.exports = {
  detectProvider,
  callUniversalLLM,
  callGemini,
  callOllama
};
