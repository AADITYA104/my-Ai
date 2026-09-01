/**
 * ============================================================================
 *  COST TRACKER — token usage & USD cost attribution per model/task
 *  Adapted (concept-level, original implementation) from ruflo-cost-tracker.
 *  Set MONTHLY_BUDGET_USD in .env to enable the 50/75/90/100% alert ladder.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

const LOG_PATH = path.join(__dirname, "agent-memory", "cost-tracking.jsonl");

const PRICING = {
  "gemini-2.5-flash": { in: 0.075, out: 0.30 },
  "gemini-2.0-flash": { in: 0.075, out: 0.30 },
  "gemini": { in: 0.10, out: 0.40 },
  "local-ollama": { in: 0, out: 0 }
};

function ratesFor(modelUsed) {
  const key = Object.keys(PRICING).find(k => modelUsed && modelUsed.includes(k));
  return PRICING[key] || { in: 0, out: 0 };
}

function recordUsage({ userId = "default_user", modelUsed, inputTokens = 0, outputTokens = 0, taskType = "general" }) {
  const rates = ratesFor(modelUsed || "");
  const costUSD = (inputTokens / 1_000_000) * rates.in + (outputTokens / 1_000_000) * rates.out;
  const entry = {
    ts: new Date().toISOString(),
    userId: userId || "default_user",
    modelUsed: modelUsed || "unknown",
    inputTokens, outputTokens,
    costUSD: Number(costUSD.toFixed(6)),
    taskType
  };
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
  } catch (_) {}
  checkBudget();
  return entry;
}

function getCostReport(period = "today") {
  if (!fs.existsSync(LOG_PATH)) {
    return { period, totalCostUSD: 0, totalInputTokens: 0, totalOutputTokens: 0, byModel: {}, byUser: {}, entries: 0 };
  }
  const lines = fs.readFileSync(LOG_PATH, "utf-8").trim().split("\n").filter(Boolean);
  const now = new Date();
  const cutoff =
    period === "today" ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) :
    period === "week" ? new Date(now.getTime() - 7 * 24 * 3600 * 1000) :
    period === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) :
    new Date(0);

  const byModel = {};
  const byUser = {};
  let totalCostUSD = 0, totalInputTokens = 0, totalOutputTokens = 0, entries = 0;
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch (_) { continue; }
    if (new Date(e.ts) < cutoff) continue;
    entries++;
    totalCostUSD += e.costUSD;
    totalInputTokens += e.inputTokens;
    totalOutputTokens += e.outputTokens;
    byModel[e.modelUsed] = byModel[e.modelUsed] || { costUSD: 0, calls: 0 };
    byModel[e.modelUsed].costUSD += e.costUSD;
    byModel[e.modelUsed].calls += 1;

    const u = e.userId || "default_user";
    byUser[u] = byUser[u] || { costUSD: 0, calls: 0 };
    byUser[u].costUSD += e.costUSD;
    byUser[u].calls += 1;
  }
  return { period, totalCostUSD: Number(totalCostUSD.toFixed(4)), totalInputTokens, totalOutputTokens, byModel, byUser, entries };
}

function checkBudget() {
  const budget = parseFloat(process.env.MONTHLY_BUDGET_USD || "0");
  if (!budget) return null;
  const { totalCostUSD } = getCostReport("month");
  const pct = (totalCostUSD / budget) * 100;
  let level = null;
  if (pct >= 100) level = "HARD_STOP";
  else if (pct >= 90) level = "critical";
  else if (pct >= 75) level = "warning";
  else if (pct >= 50) level = "info";
  if (level) {
    console.warn(`[COST TRACKER] ${level}: $${totalCostUSD.toFixed(2)} / $${budget} (${pct.toFixed(0)}%) of monthly budget used.`);
  }
  return { level, pct: Number(pct.toFixed(1)), totalCostUSD, budget };
}

module.exports = { recordUsage, getCostReport, checkBudget };
