/**
 * ============================================================================
 *  ULTRON DESTRUCTIVE ACTION & SAFETY GUARD (CORE/SECURITY/DESTRUCTIVE-GUARD.JS)
 *  - Intercepts and blocks unauthorized destructive shell/filesystem commands.
 *  - Enforces explicit verification confirmation prompts for high-risk operations.
 * ============================================================================
 */
"use strict";

const watchdog = require("../../self-healing-watchdog");

class DestructiveGuard {
  constructor() {
    this.criticalPatterns = [
      /(?:rm|del|Remove-Item)\s+.*[\*\/\\].*/i,
      /(?:format|mkfs|diskpart|Clear-Disk)/i,
      /(?:drop\s+database|truncate\s+table)/i,
      /(?:shutdown|Stop-Computer|Restart-Computer)/i,
      /(?:chmod\s+-R\s+777)/i
    ];
  }

  /**
   * Check if a proposed action requires explicit confirmation
   */
  isHighRiskAction(actionText) {
    if (!actionText || typeof actionText !== "string") return false;
    if (watchdog.isDestructiveCommand(actionText)) return true;
    return this.criticalPatterns.some(p => p.test(actionText));
  }

  /**
   * Filter and safeguard command execution
   */
  evaluateCommand(cmd, hasUserExplicitApproval = false) {
    if (!this.isHighRiskAction(cmd)) {
      return { allowed: true, requiresConfirmation: false };
    }

    if (hasUserExplicitApproval) {
      console.log(`⚠️ [DESTRUCTIVE GUARD] High-risk action explicitly approved by Boss: ${cmd}`);
      return { allowed: true, requiresConfirmation: false };
    }

    return {
      allowed: false,
      requiresConfirmation: true,
      reason: "High-risk system operation detected. Explicit confirmation required from Boss."
    };
  }
  /**
   * Alias for evaluateCommand — checks if command is blocked
   */
  checkCommand(cmd) {
    const result = this.evaluateCommand(cmd, false);
    return {
      blocked: !result.allowed,
      requiresConfirmation: result.requiresConfirmation || false,
      reason: result.reason || null
    };
  }
}

module.exports = new DestructiveGuard();
