/**
 * ============================================================================
 *  ULTRON NEURAL CORE & AGENT BRIDGE (CORE/BRAIN/BRIDGE.JS)
 *  - Connects Voice Input & UI to RAG Memory, Skills, and Tool Executors
 *  - Multi-agent reasoning with offline Ollama fallback and natural TTS output
 * ============================================================================
 */
"use strict";

const ragMemory = require("../../rag-memory");
const skillEngine = require("../../unified-skill-engine");
const { callUniversalLLM, callGemini } = require("../../llm-providers");
const { routeIntent } = require("./intent-router");
const systemControl = require("../../tools/system-control");
const smartHome = require("../../tools/smart-home");
const browserAutomation = require("../../tools/browser-automation");
const visionTool = require("../../tools/vision");
const communicationSuite = require("../../tools/communication");
const { fullStop, setTemporaryMute, isStopped } = require("../security/full-stop");
const { isOnline, ollamaFallback } = require("../utils/helpers");
const { speak } = require("../tts/speak");

/**
 * Main Brain dispatcher
 */
async function sendToBrain(userText, options = {}) {
  if (isStopped()) {
    return { reply: "Ultron is stopped. Unlock via password to resume, Boss." };
  }

  const text = (userText || "").trim();
  if (!text) {
    return { reply: "Yes Boss, I am listening." };
  }

  // 1. Intent Detection
  const intent = await routeIntent(text);
  console.log(`🧠 [BRAIN] User: "${text}" | Intent: ${intent}`);

  // 2. Fast-Path System & Stop Commands
  if (intent === "stop_command") {
    fullStop(speak);
    return { reply: "Thik che Boss, hu sampurna band thai rahyo chu. Pacho chalu karva password aapo." };
  }

  if (intent === "mute_command") {
    setTemporaryMute(true);
    const reply = "Thik che Boss, hu thodi var mate chup rahu chu. Mane pacho bolavva 'Ultron' kaho.";
    await speak(reply);
    return { reply };
  }

  if (intent === "system_control") {
    if (/volume/i.test(text)) {
      const match = text.match(/\d+/);
      const level = match ? parseInt(match[0], 10) : 50;
      const res = systemControl.setVolume(level);
      const reply = `Boss, ${res.message || "volume updated."}`;
      await speak(reply);
      return { reply, executed: true };
    }
    if (/brightness/i.test(text)) {
      const match = text.match(/\d+/);
      const level = match ? parseInt(match[0], 10) : 70;
      const res = systemControl.setBrightness(level);
      const reply = `Boss, ${res.message || "brightness updated."}`;
      await speak(reply);
      return { reply, executed: true };
    }
    if (/open|chalu\s*kar/i.test(text)) {
      const appMatch = text.replace(/open|chalu\s*kar/gi, "").trim();
      const res = systemControl.openApp(appMatch);
      const reply = `Boss, ${res.message || "app launched."}`;
      await speak(reply);
      return { reply, executed: true };
    }
    if (/network|wifi|ping/i.test(text)) {
      const diag = await systemControl.runNetworkDiagnostics();
      const reply = `Boss, network is ${diag.gatewayStatus} (IP: ${diag.ipAddress}, Latency: ${diag.latency}).`;
      await speak(reply);
      return { reply, diag };
    }
  }

  if (intent === "smart_home") {
    const isOff = /off|bandh|band/i.test(text);
    const res = await smartHome.controlLight("light.living_room", isOff ? "off" : "on");
    const reply = res.message;
    await speak(reply);
    return { reply, executed: true };
  }

  if (intent === "vision_perception") {
    const ocrRes = await visionTool.readScreenText();
    const reply = `Boss, I examined your screen. Active context:\n${(ocrRes.text || "").slice(0, 300)}...`;
    await speak("Boss, I have analyzed your screen context.");
    return { reply, vision: ocrRes };
  }

  // 3. RAG Memory Context Retrieval
  const ragContext = await ragMemory.buildRagContext(text, 2);

  // 4. Check Connectivity & Route LLM
  const online = await isOnline();
  let reply = "";

  if (!online) {
    console.log("🌐 [OFFLINE DETECTED] Routing to local Ollama fallback engine...");
    reply = await ollamaFallback(text);
  } else {
    try {
      const systemPrompt = `You are ULTRON, the supreme autonomous AI assistant and personal engineering core to Boss.
Address the user as "Boss" in every reply.
Match language (Gujarati / English / Hindi).
Be concise, intelligent, and decisive.
${ragContext ? `\nMemory context:\n${ragContext}` : ""}`;

      const messages = [{ role: "user", content: text }];
      const llmRes = await callGemini(messages, systemPrompt, null, "fast");
      const blocks = llmRes.content || [];
      const textBlock = blocks.find(b => b.type === "text");
      reply = textBlock ? textBlock.text : "Yes Boss, command received.";
    } catch (llmErr) {
      console.warn(`[CLOUD LLM ERROR] ${llmErr.message}. Falling back to local Ollama.`);
      reply = await ollamaFallback(text);
    }
  }

  if (!/boss/i.test(reply)) {
    reply = `Boss, ${reply}`;
  }

  // 5. Speak Output if requested
  if (options.shouldSpeak !== false) {
    await speak(reply);
  }

  // 6. Store turn into RAG conversation memory
  try {
    ragMemory.rememberConversationTurn(`Boss: ${text}\nUltron: ${reply}`);
  } catch (_) {}

  return { reply, intent, online };
}

module.exports = {
  sendToBrain
};
