/**
 * ============================================================================
 *  ULTRON UNIFIED MULTI-SKILL ENGINE & SEMANTIC ROUTER (2026 BLUEPRINT)
 *  Indexes 509+ skills across all packages (impeccable, gstack, ruflo,
 *  prime-agent, scroll-world, taste-skill, turbovec, strix, etc.)
 *  Routes every task through the most relevant skills with Reflexion verification.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const watchdog = require("./self-healing-watchdog");
const ragMemory = require("./rag-memory");

class UnifiedSkillEngine {
  constructor() {
    this.registryPath = path.join(__dirname, "agent-memory", "master_skills_registry.json");
    this.skills = [];
    this.categories = {};
    this.loadRegistry();
  }

  loadRegistry() {
    try {
      if (fs.existsSync(this.registryPath)) {
        const data = JSON.parse(fs.readFileSync(this.registryPath, "utf-8"));
        this.skills = data.skills || [];
        this.categories = data.categories || {};
        console.log(`🧠 [SKILL ENGINE] Loaded ${this.skills.length} skills from master registry.`);
      }
    } catch (err) {
      console.warn("[SKILL ENGINE WARNING]", err.message);
      this.skills = [];
    }
  }

  /**
   * Route any task to the Top-K most relevant skills
   */
  routeTask(taskDescription, topK = 3) {
    if (!taskDescription || this.skills.length === 0) return [];

    const lowerTask = taskDescription.toLowerCase();
    const taskTokens = lowerTask.split(/\s+/).filter(t => t.length > 2);

    const scored = this.skills.map(skill => {
      let score = 0;
      const sName = skill.name.toLowerCase();
      const sDesc = (skill.description || "").toLowerCase();
      const sCat = (skill.category || "").toLowerCase();

      // Exact name match
      if (lowerTask.includes(sName)) score += 15;

      // Category matching
      if (/ui|design|css|frontend|html|animate|scroll|visual/i.test(lowerTask) && skill.category === "design_frontend") score += 8;
      if (/3d|mesh|glb|obj|texture|model|render|blender|hunyuan/i.test(lowerTask) && (skill.category === "generative_3d_modeling" || skill.category === "design_frontend")) score += 10;
      if (/security|vuln|auth|guard|hack|pentest/i.test(lowerTask) && skill.category === "security_guard") score += 8;
      if (/code|refactor|fix|bug|debug|function|test|error/i.test(lowerTask) && skill.category === "coding_architecture") score += 8;
      if (/swarm|multi|team|agent|workflow/i.test(lowerTask) && skill.category === "multi_agent_swarm") score += 8;
      if (/memory|vector|rag|database|store/i.test(lowerTask) && skill.category === "memory_knowledge") score += 8;

      // Token overlap
      for (const t of taskTokens) {
        if (sName.includes(t)) score += 4;
        if (sDesc.includes(t)) score += 2;
      }

      return { ...skill, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Alias for routeTask
   */
  findMatchingSkills(taskDescription, topK = 3) {
    return this.routeTask(taskDescription, topK);
  }

  /**
   * Get specific skill by exact name
   */
  getSkillByName(name) {
    if (!name) return null;
    const lower = name.toLowerCase();
    return this.skills.find(s => s.name.toLowerCase() === lower) || null;
  }

  /**
   * Build the complete multi-skill system prompt with baked-in Ponytail coding philosophy & completeness rules
   */
  buildEnrichedSystemPrompt(taskDescription, basePrompt = "") {
    const matchedSkills = this.routeTask(taskDescription, 3);
    let skillInjections = "";

    if (matchedSkills.length > 0) {
      skillInjections = `\n\n<matched_skills count="${matchedSkills.length}">\n` +
        matchedSkills.map((s, idx) => `--- SKILL ${idx + 1}: ${s.name.toUpperCase()} [${s.category} / ${s.package_source}] ---\n${s.content_preview}`).join("\n\n") +
        `\n</matched_skills>`;
    }

    const coreRules = `
<coding_philosophy>
When writing or modifying code:
- Prefer the smallest correct change.
- Fix ROOT CAUSES (check all callers of a shared function), not just the symptom.
- No unneeded boilerplate, no unrequested abstractions.
- Boring and short beats clever and long.
</coding_philosophy>

<completeness_rule>
Do not truncate or shorten output to save effort.
Provide complete, functional code without stopping early or using placeholders like "...rest of code...".
</completeness_rule>

<self_healing_watchdog>
All file modifications are monitored by SelfHealingWatchdog.
Automatic checkpoints and syntax validation are active.
</self_healing_watchdog>
`;

    const airllmOptimizer = require("./airllm-optimizer");
    const sysDesignMatches = airllmOptimizer.findSystemDesignBlueprint(taskDescription);
    let sysDesignInjection = "";
    if (sysDesignMatches && sysDesignMatches.length > 0) {
      sysDesignInjection = `\n\n<system_design_knowledge>\n` +
        sysDesignMatches.map(m => `--- ${m.topic.toUpperCase()} ARCHITECTURE ---\n${m.summary}`).join("\n\n") +
        `\n</system_design_knowledge>`;
    }

    return `${basePrompt}${coreRules}${skillInjections}${sysDesignInjection}`;
  }

  /**
   * Retrieve total skill stats
   */
  getStats() {
    return {
      total_skills: this.skills.length,
      categories: this.categories,
      engine: "Semantic Top-K Pass-Through Router",
      sources: [
        "impeccable", "ruflo", "gstack", "prime-agent", "taste-skill", "scroll-world",
        "turbovec", "strix", "awesome-llm-apps", "OpenSandbox", "skills-main",
        "ponytail", "Agent-Reach", "system-design-primer", "build-your-own-x", "airllm",
        "Hunyuan3D-2"
      ]
    };
  }
}

module.exports = new UnifiedSkillEngine();
