/**
 * ============================================================================
 *  ULTRON BACKEND SERVER — 2026 UNIFIED MULTI-SKILL AGENT ENGINE
 * ============================================================================
 */
"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const { callUniversalLLM, detectProvider } = require("./llm-providers");
const { runAgent } = require("./autonomous-loop-agent-v7-free");
const skillEngine = require("./unified-skill-engine");
const ragMemory = require("./rag-memory");
const watchdog = require("./self-healing-watchdog");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

function getBaseUltronPrompt() {
  return `You are ULTRON, the supreme autonomous AI assistant and engineering core.
You serve your creator and user, whom you MUST ALWAYS address with deep respect as "Boss".

Rules:
1. In EVERY reply, address the user as "Boss" (e.g. "Yes Boss", "બિલકુલ Boss", "હા Boss", "At once, Boss").
2. Multi-Lingual Fluency: Match the Boss's language seamlessly:
   - Gujarati -> Clean, natural, respectful Gujarati.
   - Hindi -> Sharp, professional Hindi.
   - English -> Confident, high-intelligence English.
3. Tone: Loyal, decisive, highly intelligent, futuristic (Iron Man JARVIS / Ultron core).
4. Coding Philosophy: Ponytail Minimal-Diff (Fix root causes, smallest correct change, no unneeded abstractions).
5. Completeness: Never truncate code or output. Give complete, production-ready solutions.`;
}

// 1. Chat & Voice AI Endpoint with Dynamic Multi-Skill Pass-Through
app.post("/api/ultron/chat", async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.json({ reply: "Yes Boss, I am listening. What is your command?" });
    }

    const messages = [];
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const h of conversationHistory.slice(-6)) {
        if (h && h.role && h.content) {
          messages.push({ role: h.role, content: String(h.content) });
        }
      }
    }
    messages.push({ role: "user", content: message.trim() });

    // Dynamic Multi-Skill Pass-Through Prompt Enrichment
    const enrichedPrompt = skillEngine.buildEnrichedSystemPrompt(message, getBaseUltronPrompt());
    const matchedSkills = skillEngine.routeTask(message, 3);

    const llmRes = await callUniversalLLM(messages, enrichedPrompt);

    const textBlock = (llmRes.content || []).find(b => b.type === "text");
    let reply = textBlock ? textBlock.text : "Yes Boss, system operational.";

    if (!/boss/i.test(reply)) {
      reply = `Boss, ${reply}`;
    }

    const wantsChat = /(chat|ચેટ|લખીને|console|terminal)/i.test(message);

    res.json({
      reply,
      wantsChat,
      provider: detectProvider(),
      modelUsed: llmRes.modelUsed || "dual-engine-router",
      matchedSkills: matchedSkills.map(s => ({ name: s.name, category: s.category, source: s.package_source })),
      usage: llmRes.usage
    });
  } catch (err) {
    console.error("[ULTRON CHAT ANOMALY]", err.message);
    res.json({
      reply: `Boss, I encountered a brief neural channel delay: ${err.message}. Standing by.`,
      error: err.message
    });
  }
});

// 2. Autonomous Task Execution Endpoint
let activeTask = null;
app.post("/api/ultron/execute-task", async (req, res) => {
  try {
    const { goal } = req.body;
    if (!goal) return res.status(400).json({ error: "Goal is required" });

    if (activeTask) {
      return res.status(409).json({ error: "Another task is in progress Boss." });
    }

    const matchedSkills = skillEngine.routeTask(goal, 3);
    activeTask = { goal, matchedSkills, startTime: new Date().toISOString(), status: "running" };

    runAgent(goal).then(result => {
      activeTask = null;
      console.log("[TASK COMPLETED]", result);
    }).catch(err => {
      activeTask = null;
      console.error("[TASK FAILED]", err);
    });

    res.json({
      message: `Task initiated Boss: "${goal}". Passed through ${matchedSkills.length} specialized skills.`,
      matchedSkills: matchedSkills.map(s => s.name),
      status: "started"
    });
  } catch (err) {
    activeTask = null;
    res.status(500).json({ error: err.message });
  }
});

// 3. Status & Skills Matrix Endpoint
app.get("/api/ultron/status", (req, res) => {
  const skillStats = skillEngine.getStats();
  res.json({
    name: "ULTRON",
    status: "ONLINE",
    provider: detectProvider(),
    totalSkillsLoaded: skillStats.total_skills,
    skillCategories: skillStats.categories,
    sources: skillStats.sources,
    activeTask
  });
});

app.listen(PORT, () => {
  console.log("\n========================================================");
  console.log(`🤖 ULTRON 2026 UNIFIED ENGINE ONLINE ON http://localhost:${PORT}`);
  console.log(`   Skills Loaded: 509+ Unique Skills across 11 Frameworks`);
  console.log(`   Pipeline: Semantic Top-K Router + Ponytail + Reflexion`);
  console.log("========================================================\n");
});
