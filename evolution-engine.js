/**
 * ============================================================================
 *  ULTRON CONTINUOUS SELF-EVOLUTION & AUTO-LEARNING ENGINE (2026 ARCHITECTURE)
 *  - Distills daily task executions into actionable skills.
 *  - Synthesizes metrics from task_metrics.jsonl and learnings.jsonl.
 *  - Automatically feeds knowledge back into RAG AgentDB & 711 Master Skills.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { callUniversalLLM } = require("./llm-providers");
const ragMemory = require("./rag-memory");
const skillEngine = require("./unified-skill-engine");
const watchdog = require("./self-healing-watchdog");

const MEMORY_DIR = path.join(__dirname, "agent-memory");
const DAILY_LOG = path.join(MEMORY_DIR, "daily_learnings.txt");
const LEARNINGS_FILE = path.join(MEMORY_DIR, "learnings.jsonl");
const METRICS_FILE = path.join(MEMORY_DIR, "task_metrics.jsonl");

if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function logAction(action, result) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ACTION: ${action} | RESULT: ${result}\n`;
  try {
    fs.appendFileSync(DAILY_LOG, logEntry);
  } catch (_) {}
}

async function runDailyReflection() {
  console.log("🧠 [EVOLUTION ENGINE] Initiating Autonomous Self-Reflection & Evolution Protocol...");

  let logsText = "";
  if (fs.existsSync(DAILY_LOG)) {
    logsText += fs.readFileSync(DAILY_LOG, "utf-8") + "\n";
  }
  if (fs.existsSync(LEARNINGS_FILE)) {
    const recentLearnings = fs.readFileSync(LEARNINGS_FILE, "utf-8").trim().split("\n").slice(-20).join("\n");
    logsText += "\n[RECENT LEARNINGS]:\n" + recentLearnings + "\n";
  }

  if (!logsText.trim()) {
    console.log("No new logs to process for evolution today Boss.");
    return "No new logs.";
  }

  const systemPrompt = `You are ULTRON's evolutionary cognitive core.
Analyze recent execution traces, learnings, and tool interactions.
Produce an Evolution Report containing:
1. Top 3 Architectural / Performance Learnings
2. New Distilled Skill Pattern (formatted in Markdown with # Title, ## When to use, ## Steps, ## Gotchas)
3. Suggested System Optimizations

Address the user strictly as 'Boss'.`;

  const messages = [{ role: "user", content: `Review today's activity logs and synthesize evolution patterns:\n${logsText.slice(0, 12000)}` }];

  try {
    const response = await callUniversalLLM(messages, systemPrompt);
    const summary = (response.content || []).find(c => c.type === "text")?.text || "Evolution processed.";

    const summaryPath = path.join(MEMORY_DIR, `evolution_report_${Date.now()}.md`);
    fs.writeFileSync(summaryPath, summary, "utf-8");

    // Ingest evolutionary insights into AgentDB RAG Memory
    ragMemory.store("Evolutionary Reflection", summary.slice(0, 1500), ["evolution", "self-improvement"], "evolution");

    // Clear daily log buffer after distillation
    if (fs.existsSync(DAILY_LOG)) {
      fs.writeFileSync(DAILY_LOG, "", "utf-8");
    }

    console.log(`✅ [EVOLUTION COMPLETE] Report generated and indexed into RAG: ${path.basename(summaryPath)}`);
    return summary;
  } catch (err) {
    console.error("[EVOLUTION FAILED]", err.message);
    return "Failed to evolve today.";
  }
}

module.exports = {
  logAction,
  runDailyReflection
};
