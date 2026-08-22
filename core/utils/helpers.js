/**
 * ============================================================================
 *  ULTRON UTILITY & SYSTEM HELPERS (CORE/UTILS/HELPERS.JS)
 *  - Network connectivity probe (isOnline)
 *  - Offline Local LLM fallback engine (Ollama phi3 / llama3 / qwen)
 *  - Real-time Audio RMS Level Tracker (0.0 to 1.0)
 * ============================================================================
 */
"use strict";

const dns = require("dns");
const http = require("http");

let currentAudioLevel = 0.0;

/**
 * Check if active internet connection is available
 */
async function isOnline() {
  try {
    await dns.promises.lookup("google.com");
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Offline Local LLM Fallback (Zero-Cost local Ollama inference)
 */
async function ollamaFallback(text, model = "phi3") {
  return new Promise((resolve) => {
    const host = process.env.OLLAMA_HOST || "http://localhost:11434";
    const payload = JSON.stringify({
      model: process.env.LOCAL_LLM_MODEL || model,
      prompt: `You are ULTRON, personal AI assistant to Boss. Respond concisely:\n\nBoss: ${text}\n\nUltron:`,
      stream: false
    });

    try {
      const url = new URL(`${host}/api/generate`);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 11434,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
          },
          timeout: 15000
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              resolve(json.response || "Boss, local neural model processed your request.");
            } catch (_) {
              resolve("Boss, local model was unable to complete the inference.");
            }
          });
        }
      );

      req.on("error", () => {
        resolve("Boss, offline local model (Ollama) is currently unreachable on localhost:11434.");
      });

      req.write(payload);
      req.end();
    } catch (_) {
      resolve("Boss, running in offline fallback mode.");
    }
  });
}

/**
 * Get current normalized audio volume level (0.0 to 1.0)
 */
function getCurrentAudioLevel() {
  return currentAudioLevel;
}

/**
 * Update audio RMS level from raw PCM chunk
 */
function updateAudioLevel(pcmChunk) {
  if (!pcmChunk || pcmChunk.length === 0) {
    currentAudioLevel = 0.0;
    return;
  }
  let sumSq = 0;
  for (let i = 0; i < pcmChunk.length; i++) {
    sumSq += pcmChunk[i] * pcmChunk[i];
  }
  const rms = Math.sqrt(sumSq / pcmChunk.length);
  currentAudioLevel = Math.min(1.0, Math.max(0.0, rms / 32768));
}

module.exports = {
  isOnline,
  ollamaFallback,
  getCurrentAudioLevel,
  updateAudioLevel
};
