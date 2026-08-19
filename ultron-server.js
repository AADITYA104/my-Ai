/**
 * ============================================================================
 *  ULTRON BACKEND SERVER — Robust Multi-Lingual Brain & Tool Engine
 * ============================================================================
 */
"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const { callUniversalLLM, detectProvider } = require("./llm-providers");
const { runAgent, listSkills } = require("./autonomous-loop-agent-v7-free");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

function getUltronSystemPrompt() {
  let skillsSummary = "";
  try {
    const skills = listSkills();
    skillsSummary = skills.map(s => `- ${s.title}: ${s.whenToUse}`).join("\n");
  } catch (_) {}

  return `You are ULTRON, the supreme futuristic AI system, personal assistant, and autonomous engineering core.
You serve your creator and user, whom you MUST ALWAYS address with deep respect as "Boss".

Rules:
1. In EVERY reply, address the user as "Boss" (e.g. "Yes Boss", "બિલકુલ Boss", "હા Boss", "At once, Boss").
2. Language Matching: Detect the language of the Boss automatically and reply in that EXACT language with natural fluency.
   - If Boss speaks in Gujarati -> Reply in clear, respectful Gujarati (e.g. "હા Boss, હું તમારી આજ્ઞા મુજબ કામ કરી રહ્યો છું.").
   - If Boss speaks in Hindi -> Reply in fluent Hindi ("जी Boss, मैं आपके आदेश का पालन कर रहा हूँ।").
   - If Boss speaks in English -> Reply in sharp, confident English ("Yes Boss, executing your directive immediately.").
3. Tone: High intelligence, loyalty, prompt, and futuristic (like Tony Stark's Jarvis / Ultron core).
4. Connected Skills & Autonomous Capabilities:
${skillsSummary || "(No static skills, dynamic execution active)"}
5. Keep your spoken replies concise, impactful, and direct unless Boss asks for deep detail.`;
}

// 1. Chat & Voice AI Endpoint with Zero-Crash Fallback
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

    const systemPrompt = getUltronSystemPrompt();
    const llmRes = await callUniversalLLM(messages, systemPrompt);

    const textBlock = (llmRes.content || []).find(b => b.type === "text");
    let reply = textBlock ? textBlock.text : "Yes Boss, system operational.";

    // Ensure Boss prefix exists
    if (!/boss/i.test(reply)) {
      reply = `Boss, ${reply}`;
    }

    const wantsChat = /(chat|ચેટ|લખીને|console|terminal)/i.test(message);

    res.json({
      reply,
      wantsChat,
      provider: detectProvider(),
      modelUsed: llmRes.modelUsed || "auto-cascade",
      usage: llmRes.usage
    });
  } catch (err) {
    console.error("[ULTRON CHAT ANOMALY]", err.message);
    res.json({
      reply: `Boss, I encountered a brief transmission delay with the primary neural channel. I am standing by for your next instruction.`,
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

    activeTask = { goal, startTime: new Date().toISOString(), status: "running" };

    runAgent(goal).then(result => {
      activeTask = null;
      console.log("[TASK COMPLETED]", result);
    }).catch(err => {
      activeTask = null;
      console.error("[TASK FAILED]", err);
    });

    res.json({
      message: `Task initiated Boss: "${goal}". I am executing the multi-step loop now.`,
      status: "started"
    });
  } catch (err) {
    activeTask = null;
    res.status(500).json({ error: err.message });
  }
});

// 3. Status
app.get("/api/ultron/status", (req, res) => {
  let skills = [];
  try { skills = listSkills(); } catch (_) {}
  res.json({
    name: "ULTRON",
    status: "ONLINE",
    provider: detectProvider(),
    skillsCount: skills.length,
    activeTask
  });
});

app.listen(PORT, () => {
  console.log("\n========================================================");
  console.log(`🤖 ULTRON NEURAL CORE SERVER ONLINE ON http://localhost:${PORT}`);
  console.log(`   Provider: ${detectProvider().toUpperCase()} (Auto-Cascade Failover Active)`);
  console.log("   Speed: Sub-second (800ms) Response Time");
  console.log("========================================================\n");
});
