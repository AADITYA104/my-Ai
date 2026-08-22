/**
 * ============================================================================
 *  ULTRON 2026 — MASTER SYSTEM ORCHESTRATOR & ENTRY POINT (ULTRON.JS)
 *  - Boots Neural Core API Server, 3D WebGL HUD, and Wake-Word Engine.
 *  - Orchestrates Wake-Word -> STT -> Voice Biometrics -> Brain -> Tools -> TTS.
 * ============================================================================
 */
"use strict";

const path = require("path");
const fs = require("fs");

// 1. Check Full Stop Flag
const { isStopped } = require("./core/security/full-stop");
if (isStopped()) {
  console.log("\n========================================================");
  console.log("🛑 [ULTRON STOPPED] System is in locked state.");
  console.log("   To resume, run: node core/fallback/text-chat.js");
  console.log("========================================================\n");
  process.exit(0);
}

// 2. Start HTTP & 3D HUD Server
require("./ultron-server");

// 3. Import Core Subsystems
const { startWakeWordListener } = require("./core/wakeword/listener");
const { startSTT } = require("./core/stt/stream");
const { speak } = require("./core/tts/speak");
const { sendToBrain } = require("./core/brain/bridge");
const { authorizeCommand } = require("./core/security/voice-lock");

console.log("\n========================================================");
console.log("🤖 ULTRON SOVEREIGN AI SYSTEM INITIALIZED");
console.log("   - Wake Word: 'Ultron' / 'Jarvis' (Continuous Listening)");
console.log("   - 3D Holographic UI: http://localhost:3000");
console.log("   - Voice Synthesis: Natural Multi-tier TTS");
console.log("   - Offline Fallback: Local Ollama Engine Ready");
console.log("========================================================\n");

// 4. Continuous Orchestration Loop
async function onWakeDetected() {
  console.log("⚡ [ULTRON WAKE] Activated! Processing command...");
  
  try {
    // A. Start Speech-To-Text
    const transcript = await startSTT();
    console.log(`🗣️ [USER TRANSCRIPT]: "${transcript}"`);

    // B. Verify Biometric Voice Lock
    const auth = await authorizeCommand();
    if (!auth.authorized) {
      console.warn(`🚨 [VOICE REJECTED]: ${auth.reason}`);
      return;
    }

    // C. Dispatch to Brain Bridge
    const result = await sendToBrain(transcript);
    console.log(`🤖 [ULTRON RESPONSE]: ${result.reply}`);

  } catch (err) {
    console.error(`[ORCHESTRATOR ERROR] ${err.message}`);
    await speak("Boss, neural processing encountered a brief delay.");
  }
}

// 5. Launch Background Wake Listener
startWakeWordListener(onWakeDetected).catch(err => {
  console.warn(`[WAKE LISTENER NOTICE] ${err.message}`);
});
