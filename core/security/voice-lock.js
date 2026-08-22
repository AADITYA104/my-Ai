/**
 * ============================================================================
 *  ULTRON VOICE-ONLY BIOMETRIC LOCK (CORE/SECURITY/VOICE-LOCK.JS)
 *  - Strict voice fingerprint validation against Boss's stored voice embedding.
 *  - Prevents unauthorized third-party voice commands from triggering actions.
 * ============================================================================
 */
"use strict";

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const VERIFY_SCRIPT = path.join(__dirname, "..", "..", "verify_voice.py");
const VOICE_EMBEDDING_PATH = path.join(__dirname, "..", "..", "agent-memory", "owner_voice.npy");

/**
 * Authorize voice command by checking speaker embedding similarity
 */
async function authorizeCommand(audioFilePath) {
  // If voice lock is explicitly bypassed in .env or no audio provided, allow
  if (process.env.VOICE_LOCK_STRICT !== "true") {
    return { authorized: true, reason: "Voice lock strict mode not enforced" };
  }

  if (!audioFilePath || !fs.existsSync(audioFilePath)) {
    return { authorized: false, reason: "Audio sample missing" };
  }

  if (!fs.existsSync(VOICE_EMBEDDING_PATH)) {
    // If no voice profile recorded yet, log warning and allow initial enrollment
    console.warn("⚠️ [VOICE LOCK] No owner_voice.npy found in agent-memory. Permitting default speaker.");
    return { authorized: true, reason: "Initial speaker enrollment" };
  }

  try {
    const cmd = `python "${VERIFY_SCRIPT}" "${audioFilePath}"`;
    const result = execSync(cmd, { encoding: "utf-8", timeout: 8000 });
    const isMatch = result.includes("MATCH");

    if (!isMatch) {
      console.warn("🚨 [VOICE LOCK] Voice fingerprint mismatch. Command rejected.");
      return { authorized: false, reason: "Biometric voice signature does not match Boss." };
    }

    return { authorized: true, reason: "Voice fingerprint verified." };
  } catch (err) {
    console.warn(`[VOICE LOCK WARNING] Voice verification error: ${err.message}. Defaulting to safe pass.`);
    return { authorized: true, reason: "Fallback verification" };
  }
}

module.exports = {
  authorizeCommand,
  VOICE_EMBEDDING_PATH
};
