/**
 * ============================================================================
 *  METRICS REPORT -- reads agent-memory/task_metrics.jsonl (already written
 *  by logTaskMetrics() in autonomous-loop-agent-v7-free.js) and rolls it up
 *  into a success-rate / cost / latency summary.
 * ----------------------------------------------------------------------------
 *  No new logging pipeline, no new file format -- this is a read-only report
 *  over data you already collect. Safe to run anytime, including in CI.
 *
 *  Usage:
 *    node scripts/metrics-report.js                 # full-history summary
 *    node scripts/metrics-report.js --days=7         # last 7 days only
 *    node scripts/metrics-report.js --json           # machine-readable output
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

const METRICS_FILE = path.join(__dirname, "..", "agent-memory", "task_metrics.jsonl");

function parseArgs(argv) {
  const args = { days: null, json: false, alert: false };
  for (const a of argv) {
    if (a === "--json") args.json = true;
    if (a === "--alert") args.alert = true;
    const m = a.match(/^--days=(\d+)$/);
    if (m) args.days = parseInt(m[1], 10);
  }
  return args;
}

function loadEntries() {
  if (!fs.existsSync(METRICS_FILE)) return [];
  return fs
    .readFileSync(METRICS_FILE, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function filterByDays(entries, days) {
  if (!days) return entries;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
}

function parseCostUsd(costUsdStr) {
  if (typeof costUsdStr !== "string") return 0;
  const n = parseFloat(costUsdStr.replace("$", ""));
  return Number.isFinite(n) ? n : 0;
}

function summarize(entries) {
  const total = entries.length;
  const successes = entries.filter((e) => e.success).length;
  const totalCost = entries.reduce((acc, e) => acc + parseCostUsd(e.estimatedCostUsd), 0);
  const totalTokens = entries.reduce((acc, e) => acc + (e.totalTokens || 0), 0);
  const durations = entries.map((e) => e.durationMs || 0).filter((d) => d > 0);
  const avgDurationMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  const byProvider = {};
  const byUser = {};
  for (const e of entries) {
    const p = e.provider || "unknown";
    byProvider[p] = byProvider[p] || { count: 0, cost: 0, successes: 0 };
    byProvider[p].count++;
    byProvider[p].cost += parseCostUsd(e.estimatedCostUsd);
    if (e.success) byProvider[p].successes++;

    const u = e.userId || "cli/cron (no chat context)";
    byUser[u] = byUser[u] || { count: 0, cost: 0, successes: 0 };
    byUser[u].count++;
    byUser[u].cost += parseCostUsd(e.estimatedCostUsd);
    if (e.success) byUser[u].successes++;
  }

  // Most recent failures first -- what you actually want when something's wrong.
  const recentFailures = entries
    .filter((e) => !e.success)
    .slice(-5)
    .reverse()
    .map((e) => ({ goal: e.goal, timestamp: e.timestamp, provider: e.provider }));

  return {
    totalRuns: total,
    successRate: total ? Number(((successes / total) * 100).toFixed(1)) : null,
    totalCostUsd: Number(totalCost.toFixed(4)),
    totalTokens,
    avgDurationMs: Math.round(avgDurationMs),
    byProvider,
    byUser,
    recentFailures,
  };
}

function printHuman(summary, days) {
  console.log("========================================================");
  console.log(`ULTRON METRICS REPORT ${days ? `(last ${days} days)` : "(all time)"}`);
  console.log("========================================================");
  console.log(`Total runs        : ${summary.totalRuns}`);
  console.log(`Success rate      : ${summary.successRate === null ? "n/a" : summary.successRate + "%"}`);
  console.log(`Total cost        : $${summary.totalCostUsd}`);
  console.log(`Total tokens      : ${summary.totalTokens.toLocaleString()}`);
  console.log(`Avg duration      : ${(summary.avgDurationMs / 1000).toFixed(1)}s`);
  console.log("\nBy provider:");
  for (const [provider, stats] of Object.entries(summary.byProvider)) {
    const rate = stats.count ? ((stats.successes / stats.count) * 100).toFixed(1) : "n/a";
    console.log(`  ${provider.padEnd(24)} runs=${stats.count}  success=${rate}%  cost=$${stats.cost.toFixed(4)}`);
  }
  console.log("\nBy user (Telegram chatId, or cli/cron if no chat context):");
  for (const [user, stats] of Object.entries(summary.byUser)) {
    const rate = stats.count ? ((stats.successes / stats.count) * 100).toFixed(1) : "n/a";
    console.log(`  ${String(user).padEnd(24)} runs=${stats.count}  success=${rate}%  cost=$${stats.cost.toFixed(4)}`);
  }
  if (summary.recentFailures.length) {
    console.log("\nMost recent failures:");
    for (const f of summary.recentFailures) {
      console.log(`  [${f.timestamp}] (${f.provider}) ${f.goal}`);
    }
  } else {
    console.log("\nNo failures in this window. 🎉");
  }
  console.log("========================================================\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = filterByDays(loadEntries(), args.days);
  const summary = summarize(entries);

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printHuman(summary, args.days);
  }

  if (args.alert) {
    const threshold = parseFloat(process.env.COST_ALERT_THRESHOLD_USD || "5.0");
    const perUserThreshold = parseFloat(process.env.COST_ALERT_PER_USER_USD || "0") || null;
    const alerts = [];

    if (summary.totalCostUsd >= threshold) {
      alerts.push(`⚠️ Ultron cost alert: $${summary.totalCostUsd} spent${args.days ? ` in the last ${args.days} day(s)` : ""} (threshold $${threshold}).\nRuns: ${summary.totalRuns}, success rate: ${summary.successRate}%.`);
    }
    if (perUserThreshold) {
      for (const [user, stats] of Object.entries(summary.byUser)) {
        if (stats.cost >= perUserThreshold) {
          alerts.push(`⚠️ User ${user} spent $${stats.cost.toFixed(4)} (per-user threshold $${perUserThreshold}) across ${stats.count} run(s).`);
        }
      }
    }

    if (alerts.length === 0) {
      console.log(`Cost $${summary.totalCostUsd} is under the $${threshold} alert threshold -- no alert sent.`);
    } else {
      const text = alerts.join("\n\n");
      try {
        // Lazy-required: only touches telegram-gateway.js (and its own deps)
        // when --alert actually fires, so a plain `npm run report:metrics`
        // stays fast and has zero Telegram/bot side effects.
        const { notifyAdmin } = require("../telegram-gateway");
        const sent = await notifyAdmin(text);
        console.log(sent ? `Alert sent via Telegram (${alerts.length} item(s)).` : "Alert threshold exceeded, but notifyAdmin could not deliver it (see warning above -- set START_TELEGRAM_BOT=true and ALLOWED_CHAT_IDS).");
      } catch (err) {
        // Never let a broken/missing notification channel crash a metrics
        // report -- log it and move on. (e.g. node-telegram-bot-api not
        // installed yet: `npm install` picks it up, it's already in package.json)
        console.warn(`Alert threshold exceeded but could not load telegram-gateway: ${err.message}`);
        console.warn(text);
      }
    }
  }
}

if (require.main === module) main();

module.exports = { loadEntries, filterByDays, summarize };
