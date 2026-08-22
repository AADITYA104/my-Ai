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

const { exec } = require("child_process");

// 2. Start HTTP & 3D HUD Server
require("./ultron-server");

// Auto-launch 3D Holographic UI in default browser upon server boot
setTimeout(() => {
  const startCmd = process.platform === "win32" ? 'start http://localhost:3000'
    : process.platform === "darwin" ? 'open http://localhost:3000'
    : 'xdg-open http://localhost:3000';
  exec(startCmd, (err) => {
    if (!err) {
      console.log("🖥️ [HUD UI] 3D Holographic Interface opened on screen.");
    } else {
      console.log("ℹ️ [HUD UI] Access interface at: http://localhost:3000");
    }
  });
}, 1500);

// 3. Import Core Subsystems
const { startWakeWordListener } = require("./core/wakeword/listener");
const { startSTT } = require("./core/stt/stream");
const { speak } = require("./core/tts/speak");
const { sendToBrain } = require("./core/brain/bridge");
const { authorizeCommand } = require("./core/security/voice-lock");

console.log("\n========================================================");
console.log("🤖 ULTRON SOVEREIGN AI SYSTEM INITIALIZED");
console.log("   - Wake Word: 'Ultron' (Continuous Listening)");
console.log("   - 3D Holographic UI: http://localhost:3000 (Auto-Launching)");
console.log("   - Voice Synthesis: Natural Multi-tier TTS");
console.log("   - Offline Fallback: Local Ollama Engine Ready");
console.log("========================================================\n");

// 4. Continuous Orchestration Loop
async function onWakeDetected() {
  console.log("⚡ [ULTRON WAKE] Activated! Processing command...");
  
  try {
    // A. Start Speech-To-Text & Capture Audio Path
    const sttResult = await startSTT();
    const transcriptText = typeof sttResult === "object" ? sttResult.text : String(sttResult || "");
    const audioPath = typeof sttResult === "object" ? sttResult.audioPath : null;
    console.log(`🗣️ [USER TRANSCRIPT]: "${transcriptText}"`);

    // B. Verify Biometric Voice Lock with Audio Sample
    const auth = await authorizeCommand(audioPath);
    if (!auth.authorized) {
      console.warn(`🚨 [VOICE REJECTED]: ${auth.reason}`);
      await speak("Boss, voice authentication failed. Command rejected.");
      return;
    }

    // C. Dispatch to Brain Bridge
    const result = await sendToBrain(transcriptText);
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
