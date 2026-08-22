/**
 * ============================================================================
 *  ULTRON 2-TIER EMERGENCY STOP CONTROLLER (CORE/SECURITY/FULL-STOP.JS)
 *  - Mode A: Temporary Mute (wake word / button resumes listening)
 *  - Mode B: FULL STOP (persisted stop flag, process exits, requires password to resume)
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

const STOP_FLAG = path.join(__dirname, "..", "..", ".ultron_stopped");
let isMuted = false;

/**
 * Check if Ultron is in permanent stopped state
 */
function isStopped() {
  return fs.existsSync(STOP_FLAG);
}

/**
 * Put Ultron into full stop state and cleanly terminate process
 */
function fullStop(speakFn = null) {
  try {
    fs.writeFileSync(STOP_FLAG, JSON.stringify({
      stoppedAt: new Date().toISOString(),
      reason: "User requested full shutdown"
    }), "utf-8");
    console.log("🛑 [FULL STOP] Ultron permanently stopped. Password unlock required to resume.");
    
    if (typeof speakFn === "function") {
      speakFn("Thik che Boss, hu sampurna band thai rahyo chu. Pacho chalu karva password aapo.");
    }
  } catch (err) {
    console.error("[FULL STOP WRITE ERROR]", err.message);
  }

  setTimeout(() => {
    process.exit(0);
  }, 1500);
}

/**
 * Clear the persistent stop flag (requires password verification)
 */
function clearStopFlag() {
  if (fs.existsSync(STOP_FLAG)) {
    try {
      fs.unlinkSync(STOP_FLAG);
      console.log("🔓 [FULL STOP CLEARED] Ultron stop flag removed successfully.");
      return true;
    } catch (_) {
      return false;
    }
  }
  return true;
}

/**
 * Temporary Mute toggle
 */
function setTemporaryMute(mute = true) {
  isMuted = !!mute;
  console.log(`🔇 [MUTE STATUS] Ultron temporary mute: ${isMuted ? "ON" : "OFF"}`);
  return isMuted;
}

function getMuteStatus() {
  return isMuted;
}

module.exports = {
  isStopped,
  fullStop,
  clearStopFlag,
  setTemporaryMute,
  getMuteStatus,
  STOP_FLAG
};
