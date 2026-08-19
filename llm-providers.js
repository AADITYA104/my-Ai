/**
 * ============================================================================
 *  LLM PROVIDERS - RESILIENT MULTI-PROVIDER ADAPTER WITH AUTO-FAILOVER
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
  return process.env.LLM_PROVIDER || "ollama-local-first";
}

// ---------------------------------------------------------------------------
// 1. GOOGLE GEMINI ADAPTER WITH AUTO-FAILOVER CASCADE
// ---------------------------------------------------------------------------
const GEMINI_MODELS_CASCADE = [
  "gemini-3.5-flash-lite", // 800ms ultra-fast & resilient
  "gemini-flash-latest",   // 1.4s reliable fallback
  "gemini-3.5-flash"
];

async function callGemini(messages, system, tools) {
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
    generationConfig: { temperature: 0.3, maxOutputTokens: 2500 }
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

  let lastError = null;
  for (const model of GEMINI_MODELS_CASCADE) {
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
        standardizedBlocks.push({ type: "text", text: "Yes Boss, processing completed." });
      }
      return {
        content: standardizedBlocks,
        modelUsed: "gemini-" + model,
        usage: { input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: data.usageMetadata?.candidatesTokenCount || 0 }
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Gemini failed.");
}

// ---------------------------------------------------------------------------
// 4. OLLAMA LOCAL ADAPTER (Primary for Ultron-Core)
// ---------------------------------------------------------------------------
function toOllamaTools(tools) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map(t => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || "",
      parameters: t.input_schema || { type: "object", properties: {} }
    }
  }));
}

function normalizeToolArgs(args) {
  if (!args) return {};
  if (typeof args === "string") {
    try { return JSON.parse(args); } catch (_) { return { input: args }; }
  }
  return args;
}

function extractJsonObject(text) {
  if (!text || typeof text !== "string") return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch (_) { return null; }
}

function normalizeOllamaMessages(messages, system, hasTools) {
  const ollamaMessages = [];
  let systemText = system || "";
  if (hasTools) {
    systemText += "\n\nTool use rules:\n- Prefer native tool calls when available.\n- If native tool calls are not available, respond ONLY as JSON: {\"tool_calls\":[{\"name\":\"tool_name\",\"arguments\":{}}]}.\n- When the task is complete, respond with normal text ending in DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT.";
  }
  if (systemText) ollamaMessages.push({ role: "system", content: systemText });

  for (const m of messages) {
    if (typeof m.content === "string") {
      ollamaMessages.push({ role: m.role, content: m.content });
    } else if (Array.isArray(m.content)) {
      const toolResults = m.content.filter(p => p.type === "tool_result");
      const textParts = m.content.filter(p => p.type === "text").map(p => p.text);
      const toolUses = m.content.filter(p => p.type === "tool_use");
      if (toolResults.length > 0) {
        ollamaMessages.push({
          role: "user",
          content: "Tool results:\n" + toolResults.map(r => `${r.tool_name || r.name || "tool"}: ${r.content}`).join("\n")
        });
      } else if (toolUses.length > 0) {
        ollamaMessages.push({
          role: "assistant",
          content: JSON.stringify({ tool_calls: toolUses.map(t => ({ name: t.name, arguments: t.input || {} })) })
        });
      } else if (textParts.length > 0) {
        ollamaMessages.push({ role: m.role, content: textParts.join("\n") });
      }
    }
  }
  return ollamaMessages;
}

async function callOllama(messages, system, tools = null) {
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "ultron-core";
  const url = `${host}/api/chat`;
  const ollamaMessages = normalizeOllamaMessages(messages, system, !!(tools && tools.length));
  const payload = { model, messages: ollamaMessages, stream: false };
  const ollamaTools = toOllamaTools(tools);
  if (ollamaTools) payload.tools = ollamaTools;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Ollama Error (${res.status})`);
  }

  const data = await res.json();
  const content = [];
  const nativeToolCalls = data.message?.tool_calls || [];
  for (const call of nativeToolCalls) {
    content.push({
      type: "tool_use",
      id: "ollama_" + Math.random().toString(36).slice(2, 10),
      name: call.function?.name || call.name,
      input: normalizeToolArgs(call.function?.arguments || call.arguments)
    });
  }

  const text = data.message?.content || "";
  const parsed = extractJsonObject(text);
  const jsonToolCalls = Array.isArray(parsed?.tool_calls) ? parsed.tool_calls : [];
  if (content.length === 0 && jsonToolCalls.length > 0) {
    for (const call of jsonToolCalls) {
      content.push({
        type: "tool_use",
        id: "json_" + Math.random().toString(36).slice(2, 10),
        name: call.name,
        input: normalizeToolArgs(call.arguments || call.input)
      });
    }
  }
  if (content.length === 0 || text.replace(/\s/g, "")) {
    content.unshift({ type: "text", text });
  }

  return {
    content,
    modelUsed: `local-ollama (${model})`,
    usage: { input_tokens: data.prompt_eval_count || 0, output_tokens: data.eval_count || 0 }
  };
}

// ---------------------------------------------------------------------------
// UNIVERSAL DISPATCHER (Local First, API Fallback)
// ---------------------------------------------------------------------------
async function callUniversalLLM(messages, system, tools = null) {
  // First try Local Ollama (The user's Qwen 27B model)
  try {
    console.log(`[LLM DISPATCH] Trying local Ollama (${process.env.OLLAMA_MODEL || "ultron-core"})...`);
    const localRes = await callOllama(messages, system, tools);
    return localRes;
  } catch (err) {
    console.warn(`[LLM DISPATCH] Local Ollama failed or not available (${err.message}). Falling back to Gemini API...`);
    // If Ollama fails, or requires tools, fallback to Gemini
    return await callGemini(messages, system, tools);
  }
}

module.exports = {
  detectProvider,
  callUniversalLLM,
  callGemini,
  callOllama
};
