/**
 * ============================================================================
 *  ULTRON SELF-HEALING WATCHDOG & ROLLBACK GUARD (2026 ARCHITECTURE)
 *  Protects Ultron from self-coding accidents, syntax errors, and crashes.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

class SelfHealingWatchdog {
  constructor(projectRoot = __dirname) {
    this.projectRoot = projectRoot;
    this.backupDir = path.join(this.projectRoot, ".ultron_backups");
    this.protectedFiles = [
      ".env",
      "docker-compose.yml",
      "Dockerfile",
      "self-healing-watchdog.js",
      ".git"
    ];
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Check if a file is protected from destructive self-modification (Deny-list)
   */
  isProtectedPath(filePath) {
    const base = path.basename(filePath);
    return this.protectedFiles.some(p => base === p || filePath.includes(p));
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
   * Validate raw JavaScript code string
   */
  validateJsSyntax(code) {
    try {
      new Function(code);
      return true;
    } catch (syntaxErr) {
      return false;
    }
  }

  /**
   * Validate syntax of modified JavaScript file
   */
  validateSyntax(filePath) {
    if (!filePath.endsWith(".js") && !filePath.endsWith(".mjs")) return true;
    try {
      const code = fs.readFileSync(filePath, "utf-8");
      return this.validateJsSyntax(code);
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
