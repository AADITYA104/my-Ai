/**
 * ============================================================================
 *  ULTRON MULTI-SESSION CONTINUITY & SNAPSHOT ENGINE (2026 ARCHITECTURE)
 *  - Saves and restores project state across sessions and restarts.
 *  - Automatic Git/File Snapshot Versioning for memory.md with Rollback.
 *  - Cross-Session Context Grounding.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

class SessionContinuity {
  constructor() {
    this.memoryDir = path.join(__dirname, "agent-memory");
    this.stateFile = path.join(this.memoryDir, "project-state.json");
    this.memoryFile = path.join(this.memoryDir, "memory.md");
    this.snapshotDir = path.join(this.memoryDir, ".snapshots");
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
    if (!fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
    }
    this.ensureStateFile();
  }

  ensureStateFile() {
    if (!fs.existsSync(this.stateFile)) {
      const defaultState = {
        project_goal: "Ultron 2026 Sovereign Autonomous AI Assistant",
        session_id: `session_${Date.now()}`,
        started_at: new Date().toISOString(),
        last_active: new Date().toISOString(),
        completed_steps: [
          "System initialization and 3D WebGL Hologram UI setup",
          "Dual-Engine 0-Crash LLM Cascade with Gemini and Ollama Qwen router",
          "AgentDB Persistent Vector Memory and audit ledger integration",
          "Picovoice Porcupine offline wake-word bridge (<20ms response)",
          "711 Master Skills Cataloged and Unified Skill Engine integration"
        ],
        current_step: "Active autonomous assistance and continuous multi-skill execution",
        known_issues: [],
        next_actions: [
          "Monitor user tasks and execute with Top-K Semantic Multi-Skill Pass-Through",
          "Apply Ponytail root-cause minimal-diff coding philosophy on all edits",
          "Maintain zero-crash self-healing watchdog checkpoints"
        ],
        audit_history: []
      };
      fs.writeFileSync(this.stateFile, JSON.stringify(defaultState, null, 2), "utf-8");
    }
  }

  /**
   * Create an instant snapshot of memory.md before modifications
   */
  createMemorySnapshot() {
    try {
      if (fs.existsSync(this.memoryFile)) {
        const snapId = `snap_${Date.now()}`;
        const snapPath = path.join(this.snapshotDir, `memory_${snapId}.bak`);
        fs.copyFileSync(this.memoryFile, snapPath);
        return snapId;
      }
    } catch (err) {
      console.warn(`[MEMORY SNAPSHOT ERROR] ${err.message}`);
    }
    return null;
  }

  /**
   * Rollback memory.md to a specific snapshot or most recent
   */
  rollbackMemory(snapshotId = null) {
    try {
      const snaps = fs.readdirSync(this.snapshotDir).filter(f => f.startsWith("memory_") && f.endsWith(".bak")).sort();
      if (snaps.length === 0) return false;

      const targetFile = snapshotId ? `memory_${snapshotId}.bak` : snaps[snaps.length - 1];
      const targetPath = path.join(this.snapshotDir, targetFile);

      if (fs.existsSync(targetPath)) {
        fs.copyFileSync(targetPath, this.memoryFile);
        console.log(`✅ [MEMORY ROLLBACK] Restored memory.md from ${targetFile}`);
        return true;
      }
    } catch (err) {
      console.error(`[MEMORY ROLLBACK FAILED] ${err.message}`);
    }
    return false;
  }

  getState() {
    try {
      this.ensureStateFile();
      return JSON.parse(fs.readFileSync(this.stateFile, "utf-8"));
    } catch (e) {
      console.error("[SESSION CONTINUITY ERROR]", e.message);
      return {};
    }
  }

  updateState(updates) {
    try {
      const current = this.getState();
      const updated = {
        ...current,
        ...updates,
        last_active: new Date().toISOString()
      };
      fs.writeFileSync(this.stateFile, JSON.stringify(updated, null, 2), "utf-8");
      return updated;
    } catch (e) {
      console.error("[SESSION CONTINUITY UPDATE ERROR]", e.message);
      return null;
    }
  }

  addCompletedStep(stepDescription) {
    const current = this.getState();
    const completed = current.completed_steps || [];
    completed.push(stepDescription);
    return this.updateState({ completed_steps: completed });
  }

  setNextAction(action) {
    const current = this.getState();
    const actions = current.next_actions || [];
    actions.push(action);
    return this.updateState({ next_actions: actions });
  }

  getContextPrompt() {
    const state = this.getState();
    return `\n<multi_session_context>
Project Goal: ${state.project_goal || "N/A"}
Current Step: ${state.current_step || "N/A"}
Completed Steps:
${(state.completed_steps || []).map((s, i) => `  ${i + 1}. ${s}`).join("\n")}
Next Actions:
${(state.next_actions || []).map((a, i) => `  - ${a}`).join("\n")}
</multi_session_context>\n`;
  }
}

module.exports = new SessionContinuity();
