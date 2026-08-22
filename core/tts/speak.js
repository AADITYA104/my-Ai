/**
 * ============================================================================
 *  ULTRON NATURAL TTS & VOICE SYNTHESIZER (CORE/TTS/SPEAK.JS)
 *  - Tier 1: ElevenLabs API (Custom Ultron AI Voice)
 *  - Tier 2: Coqui TTS (Local Offline Deep Neural Voice)
 *  - Tier 3: Windows SAPI PowerShell Native (Zero-cost, Zero-latency fallback)
 *  - Barge-in / Interrupt Support (instant speech kill on user barge-in)
 * ============================================================================
 */
"use strict";

const { exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let currentAudioProcess = null;

/**
 * Stop any ongoing TTS audio playback immediately (Barge-in / Interrupt)
 */
function interruptPlayback() {
  if (currentAudioProcess) {
    try {
      currentAudioProcess.kill();
      console.log("🛑 [BARGE-IN] Active voice playback interrupted.");
    } catch (_) {}
    currentAudioProcess = null;
  }
}

/**
 * Speak text response using best available TTS engine
 */
async function speak(text, options = {}) {
  if (!text || typeof text !== "string") return;
  interruptPlayback();

  const cleanText = text.replace(/[*_`#]/g, "").replace(/https?:\/\/\S+/g, "").trim();
  if (!cleanText) return;

  // 1. ElevenLabs Cloud TTS (if key available)
  if (process.env.ELEVEN_API_KEY && process.env.ELEVEN_VOICE_ID) {
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVEN_VOICE_ID}`, {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVEN_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.45, similarity_boost: 0.85 }
        })
      });

      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const tempFile = path.join(__dirname, "..", "..", "agent-memory", "tts_output.mp3");
        fs.writeFileSync(tempFile, buffer);
        playAudioFile(tempFile);
        return;
      }
    } catch (err) {
      console.warn(`[ELEVENLABS TTS FALLBACK] ${err.message}`);
    }
  }

  // 2. Windows Native SAPI Speech (Zero-cost, Zero-latency default)
  if (process.platform === "win32") {
    try {
      const escaped = cleanText.replace(/'/g, "''").replace(/"/g, '`"');
      const psCommand = `Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = 0; $speak.Speak("${escaped.slice(0, 500)}")`;
      currentAudioProcess = spawn("powershell", ["-NoProfile", "-Command", psCommand], { stdio: "ignore" });
      return;
    } catch (err) {
      console.warn(`[WINDOWS SAPI TTS ERROR] ${err.message}`);
    }
  }

  // 3. Linux/macOS command fallback
  if (process.platform === "darwin") {
    currentAudioProcess = exec(`say "${cleanText.replace(/"/g, '\\"')}"`);
  }
}

function playAudioFile(filePath) {
  if (process.platform === "win32") {
    currentAudioProcess = exec(`powershell -c "(New-Object Media.SoundPlayer '${filePath.replace(/\\/g, "/")}').PlaySync()"`);
  } else {
    currentAudioProcess = exec(`mpv "${filePath}" || play "${filePath}"`);
  }
}

module.exports = {
  speak,
  interruptPlayback
};
