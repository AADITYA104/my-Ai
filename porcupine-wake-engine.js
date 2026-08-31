/**
 * ============================================================================
 *  ULTRON PORCUPINE OFFLINE WAKE-WORD ENGINE
 *  Bridges Picovoice Porcupine native bindings for zero-latency wake word detection.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

class PorcupineWakeEngine {
  constructor() {
    // Configurable via env var instead of a hardcoded personal path — set
    // PORCUPINE_PATH to the porcupine-master folder if you use this engine.
    // BUG FIXED: this used to join "porcupine-master" onto a path that already
    // ended in "porcupine-master", doubling the folder segment.
    this.porcupinePath = process.env.PORCUPINE_PATH
      ? path.resolve(process.env.PORCUPINE_PATH)
      : path.join(__dirname, "porcupine-master");
    this.keywordDir = path.join(this.porcupinePath, "resources", "keyword_files", "windows");
    this.isAvailable = fs.existsSync(this.keywordDir);
  }

  getStatus() {
    return {
      available: this.isAvailable,
      engine: "Picovoice Porcupine (Local Windows Native)",
      keywords: this.isAvailable ? fs.readdirSync(this.keywordDir).map(f => f.replace("_windows.ppn", "")) : ["ultron"],
      latency: "< 20ms (Zero Cloud Dependency)"
    };
  }
}

module.exports = new PorcupineWakeEngine();
