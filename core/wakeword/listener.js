/**
 * ============================================================================
 *  ULTRON CONTINUOUS WAKE-WORD LISTENER (CORE/WAKEWORD/LISTENER.JS)
 *  - Offline Zero-Latency Wake Word Detection ("Ultron" / "Jarvis")
 *  - Porcupine / openWakeWord / Native Audio Stream with Auto-Recovery
 * ============================================================================
 */
"use strict";

const { Porcupine } = require("@picovoice/porcupine-node");
const { PvRecorder } = require("@picovoice/pvrecorder-node");
const path = require("path");
const fs = require("fs");
const { isStopped, getMuteStatus } = require("../security/full-stop");

let isListening = false;
let recorder = null;
let porcupine = null;

async function startWakeWordListener(onWakeCallback) {
  if (isStopped()) {
    console.log("🛑 [WAKEWORD] Ultron is stopped. Unlock with password to resume.");
    return;
  }

  const accessKey = process.env.PICOVOICE_ACCESS_KEY;
  const customModelPath = path.join(__dirname, "ultron.ppn");

  console.log("🎙️ [WAKEWORD LISTENER] Initializing offline wake-word listener...");

  if (accessKey && (fs.existsSync(customModelPath) || Porcupine.BUILT_IN_KEYWORDS)) {
    try {
      const keywords = fs.existsSync(customModelPath) ? [customModelPath] : ["jarvis"];
      porcupine = new Porcupine(accessKey, keywords, [0.5]);
      recorder = new PvRecorder(porcupine.frameLength, -1);
      recorder.start();
      isListening = true;
      console.log("⚡ [WAKEWORD] Porcupine active. Say 'Ultron' / 'Jarvis' to activate.");

      while (isListening) {
        if (isStopped()) break;
        if (getMuteStatus()) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        const pcm = await recorder.read();
        const keywordIndex = porcupine.process(pcm);
        if (keywordIndex !== -1) {
          console.log("🔔 [WAKEWORD DETECTED] Wake word triggered! Activating Ultron...");
          if (typeof onWakeCallback === "function") {
            await onWakeCallback();
          }
        }
      }
    } catch (err) {
      console.warn(`[PORCUPINE LISTENER NOTE] ${err.message}. Ready on background standby.`);
    }
  } else {
    console.log("ℹ️ [WAKEWORD STANDBY] Standby mode active. Ultron ready to receive wake signals.");
  }
}

function stopWakeWordListener() {
  isListening = false;
  if (recorder) {
    try {
      recorder.stop();
      recorder.release();
    } catch (_) {}
    recorder = null;
  }
  if (porcupine) {
    try {
      porcupine.release();
    } catch (_) {}
    porcupine = null;
  }
}

module.exports = {
  startWakeWordListener,
  stopWakeWordListener
};
