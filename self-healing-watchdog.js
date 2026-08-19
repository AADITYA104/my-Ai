/**
 * ============================================================================
 *  ULTRON SELF-HEALING WATCHDOG & ROLLBACK GUARD
 *  Protects Ultron from self-coding accidents, syntax errors, and crashes.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

class SelfHealingWatchdog {
  constructor(projectRoot = __dirname) {
    this.projectRoot = projectRoot;
    this.backupDir = path.join(this.projectRoot, ".ultron_backups");
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Create an instant snapshot before any self-edit
   */
  createCheckpoint(filePath) {
    try {
      const relPath = path.relative(this.projectRoot, filePath);
      const backupPath = path.join(this.backupDir, `${path.basename(filePath)}.${Date.now()}.bak`);
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, backupPath);
        console.log(`🛡️ [WATCHDOG] Checkpoint created for ${relPath}`);
        return backupPath;
      }
    } catch (err) {
      console.warn(`[WATCHDOG CHECKPOINT WARNING] ${err.message}`);
    }
    return null;
  }

  /**
   * Validate syntax of modified JavaScript file
   */
  validateSyntax(filePath) {
    if (!filePath.endsWith(".js") && !filePath.endsWith(".mjs")) return true;
    try {
      const code = fs.readFileSync(filePath, "utf-8");
      new Function(code); // Quick syntax compilation check
      return true;
    } catch (syntaxErr) {
      console.error(`🚨 [WATCHDOG] SYNTAX ERROR DETECTED in ${filePath}:`, syntaxErr.message);
      return false;
    }
  }

  /**
   * Auto-Rollback to the last working checkpoint
   */
  rollback(filePath, backupPath) {
    try {
      if (backupPath && fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, filePath);
        console.log(`✅ [WATCHDOG] AUTO-HEALED: ${path.basename(filePath)} restored from checkpoint.`);
        return true;
      }
    } catch (err) {
      console.error(`[WATCHDOG ROLLBACK FAILED] ${err.message}`);
    }
    return false;
  }
}

module.exports = new SelfHealingWatchdog();
