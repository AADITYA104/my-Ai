/**
 * ============================================================================
 *  ULTRON MULTI-SESSION CONTINUITY ENGINE (2026 BLUEPRINT — SECTION 20.3)
 *  Saves and restores project state across sessions, laptop restarts, and tasks.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

class SessionContinuity {
  constructor() {
    this.stateFile = path.join(__dirname, "agent-memory", "project-state.json");
    this.ensureStateFile();
  }

  ensureStateFile() {
    const memoryDir = path.dirname(this.stateFile);
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
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
          "509+ Master Skills Cataloged and Unified Skill Engine integration"
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
