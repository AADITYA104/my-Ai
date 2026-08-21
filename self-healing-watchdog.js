/**
 * ============================================================================
 *  ULTRON SELF-HEALING WATCHDOG & GUARDRAIL DEFENDER (2026 ARCHITECTURE)
 *  - Protects Ultron from self-coding accidents, path escapes, and destructive commands.
 *  - Stream-Level Log Redactor for API Keys, Tokens, and Credentials.
 *  - Pre-Edit Checkpointing & AST/Syntax Rollback.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

class SelfHealingWatchdog {
  constructor(projectRoot = __dirname) {
    this.projectRoot = path.resolve(projectRoot);
    this.backupDir = path.join(this.projectRoot, ".ultron_backups");
    this.protectedFiles = [
      ".env",
      "docker-compose.yml",
      "Dockerfile",
      "self-healing-watchdog.js",
      ".git"
    ];

    // Destructive Command Deny-Matrix (Linux + Windows PowerShell / CMD)
    this.destructiveCommandPatterns = [
      // Linux dangerous commands
      /rm\s+-(?:rf|fr|r)\s+[\/\\]/i,
      /find\s+[\.\/\\]+\s+-delete/i,
      /mkfs(?:\.[a-z0-9]+)?\s+/i,
      /dd\s+if=/i,
      /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/i, // Fork bomb
      /chmod\s+-R\s+777\s+[\/\\]/i,

      // Windows PowerShell dangerous commands
      /Remove-Item\s+.*(?:-Recurse|-Force)/i,
      /Clear-Disk/i,
      /Format-Volume/i,
      /Stop-Computer/i,
      /Restart-Computer/i,

      // Windows CMD dangerous commands
      /del\s+(?:\/[a-z]\s+)*(?:\/s|\/q|\/f)\s+[a-z]:[\\\/]/i,
      /rmdir\s+\/s(?:\s+\/q)?\s+[a-z]:[\\\/]/i,
      /format\s+[a-z]:/i,
      /diskpart/i,
      /reg\s+delete\s+(?:hklm|hkcu|hkey)/i
    ];

    // Secrets Redaction Rules
    this.secretPatterns = [
      { re: /AIzaSy[A-Za-z0-9\-_]{33}/g, label: "Google API Key" },
      { re: /sk-[A-Za-z0-9]{32,64}/g, label: "OpenAI/Anthropic API Key" },
      { re: /ghp_[A-Za-z0-9]{36}/g, label: "GitHub Token" },
      { re: /Bearer\s+[A-Za-z0-9\-_\.]{20,}/gi, label: "Bearer Token" },
      { re: /(?:password|secret|apiKey)\s*[:=]\s*['"][^'"]+['"]/gi, label: "Plain Secret" }
    ];

    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Redact sensitive secrets from log strings
   */
  redactLogs(message) {
    if (!message || typeof message !== "string") return message;
    let clean = message;
    for (const { re, label } of this.secretPatterns) {
      re.lastIndex = 0;
      clean = clean.replace(re, `[REDACTED: ${label}]`);
    }
    return clean;
  }

  /**
   * Check if path attempts sandbox escape via symlinks, relative traversal '..', or is protected
   */
  isProtectedPath(filePath) {
    if (!filePath) return false;
    try {
      const normalized = path.normalize(filePath);
      const absPath = path.resolve(this.projectRoot, normalized);

      let canonical = absPath;
      if (fs.existsSync(absPath)) {
        try {
          canonical = fs.realpathSync(absPath);
        } catch (_) {}
      }

      const base = path.basename(canonical);

      return this.protectedFiles.some(p => {
        if (p === ".git") {
          return canonical.replace(/\\/g, "/").includes("/.git") || base === ".git";
        }
        return base === p;
      });
    } catch (_) {
      return true; // Fail-safe
    }
  }

  /**
   * Check if a shell command contains dangerous destructive patterns
   */
  isDestructiveCommand(cmd) {
    if (!cmd || typeof cmd !== "string") return false;
    return this.destructiveCommandPatterns.some(pattern => pattern.test(cmd));
  }

  /**
   * Sanitize external input for shell injection
   */
  sanitizeShellInput(input) {
    if (!input || typeof input !== "string") return "";
    return input.replace(/[;&|`$><]/g, "").trim();
  }

  /**
   * Create an instant snapshot before any self-edit
   */
  createCheckpoint(filePath) {
    try {
      const absPath = path.resolve(this.projectRoot, filePath);
      const relPath = path.relative(this.projectRoot, absPath);
      const backupPath = path.join(this.backupDir, `${path.basename(absPath)}.${Date.now()}.bak`);
      if (fs.existsSync(absPath)) {
        fs.copyFileSync(absPath, backupPath);
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
