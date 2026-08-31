/**
 * ============================================================================
 *  ULTRON VOICE-ONLY BIOMETRIC LOCK (CORE/SECURITY/VOICE-LOCK.JS)
 *  - Strict voice fingerprint validation against Boss's stored voice embedding.
 *  - Prevents unauthorized third-party voice commands from triggering actions.
 * ============================================================================
 */
"use strict";

const { execFileSync } = require("child_process");
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
    // SECURITY: execFileSync with an argument array — never build a shell
    // string with execSync(`... "${audioFilePath}"`), since a filename
    // containing shell metacharacters would otherwise be command injection.
    const result = execFileSync("python", [VERIFY_SCRIPT, audioFilePath], { encoding: "utf-8", timeout: 8000 });
    const isMatch = result.includes("MATCH");

    if (!isMatch) {
      console.warn("🚨 [VOICE LOCK] Voice fingerprint mismatch. Command rejected.");
      return { authorized: false, reason: "Biometric voice signature does not match Boss." };
    }

    return { authorized: true, reason: "Voice fingerprint verified." };
  } catch (err) {
    // SECURITY: fail CLOSED under strict mode. The entire point of
    // VOICE_LOCK_STRICT=true is to reject anyone who isn't verified —
    // silently authorizing on a script crash/timeout/missing Python would
    // let an attacker bypass the lock just by making verification fail.
    console.warn(`🚨 [VOICE LOCK] Verification error: ${err.message}. Failing CLOSED (strict mode).`);
    return { authorized: false, reason: `Voice verification unavailable (${err.message}) — rejecting for safety under strict mode.` };
  }
}

module.exports = {
  authorizeCommand,
  VOICE_EMBEDDING_PATH
};
