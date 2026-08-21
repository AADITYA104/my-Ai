/**
 * ============================================================================
 *  CRON SCHEDULER — Background Autonomous Automation (2026 ARCHITECTURE)
 *  - Mutex PID Lock (.cron.lock) to Prevent Job Execution Overlap.
 *  - Dead-Letter Failure Queue (dead_letter_queue.jsonl) with Alerting.
 *  - Connected to Master 2026 Engine (autonomous-loop-agent-v7-free.js).
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const { runAgent } = require("./autonomous-loop-agent-v7-free");

const MEMORY_DIR = path.join(__dirname, "agent-memory");
const RUN_LOG = path.join(MEMORY_DIR, "cron-run-log.jsonl");
const DLQ_FILE = path.join(MEMORY_DIR, "dead_letter_queue.jsonl");
const LOCK_FILE = path.join(MEMORY_DIR, ".cron.lock");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const REPORT_CHAT_ID = process.env.REPORT_CHAT_ID;

let bot = null;
if (TELEGRAM_BOT_TOKEN && REPORT_CHAT_ID) {
  try {
    const TelegramBot = require("node-telegram-bot-api");
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// 1. MUTEX PID LOCK FILE MANAGEMENT (Anti-Overlap Guard)
// ---------------------------------------------------------------------------
function acquireLock(jobName) {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, "utf-8"));
      // If lock was created recently (<1 hour) and by an active job, block overlap
      if (Date.now() - lockData.timestamp < 3600000) {
        console.warn(`🔒 [CRON LOCK] Job '${jobName}' blocked: '${lockData.job}' is currently running (PID: ${lockData.pid}).`);
        return false;
      }
    } catch (_) {}
  }
  try {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ job: jobName, pid: process.pid, timestamp: Date.now() }));
    return true;
  } catch (_) {
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// 2. DEAD-LETTER FAILURE QUEUE (DLQ)
// ---------------------------------------------------------------------------
function pushToDeadLetterQueue(jobName, goal, error) {
  try {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    const dlqEntry = {
      job: jobName,
      goal,
      error: error ? error.message : "Unknown failure",
      stack: error ? error.stack : "",
      timestamp: new Date().toISOString(),
      retryCount: 0
    };
    fs.appendFileSync(DLQ_FILE, JSON.stringify(dlqEntry) + "\n", "utf-8");
    console.error(`📬 [DLQ] Pushed failed job '${jobName}' to Dead-Letter Queue.`);
  } catch (err) {
    console.error("[DLQ WRITE ERROR]", err.message);
  }
}

// ---------------------------------------------------------------------------
// 3. SCHEDULE DEFINITION
// ---------------------------------------------------------------------------
const SCHEDULE = [
  {
    name: "daily-market-news",
    cronExpr: "0 8 * * *", // every day at 8:00 AM
    goal: "Research today's top 5 tech/startup news headlines and write a 5-bullet summary to reports/daily-news.md",
    enabled: true,
  },
  {
    name: "weekly-skill-review-reminder",
    cronExpr: "0 9 * * 1", // every Monday 9 AM
    goal: "Read agent-memory/skills/ and write a short human-readable digest of all learned skills to reports/skills-digest.md",
    enabled: true,
  },
];

function logRun(jobName, result, error) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  const entry = {
    job: jobName,
    timestamp: new Date().toISOString(),
    success: !!(result && result.success),
    result: result || null,
    error: error ? error.message : null,
  };
  fs.appendFileSync(RUN_LOG, JSON.stringify(entry) + "\n");
}

async function report(message) {
  console.log(message);
  if (bot && REPORT_CHAT_ID) {
    try {
      await bot.sendMessage(REPORT_CHAT_ID, message.slice(0, 3500));
    } catch (e) {
      console.error("Failed to send Telegram report:", e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. ATOMIC RUNNER WITH MUTEX & DLQ
// ---------------------------------------------------------------------------
async function runScheduledJob(job) {
  if (!acquireLock(job.name)) {
    return;
  }

  await report(`⏰ [${job.name}] Starting scheduled run...`);
  try {
    const result = await runAgent(job.goal);
    logRun(job.name, result, null);
    await report(
      `${result.success ? "✅" : "⚠️"} [${job.name}] ${result.success ? "Completed" : "Did not complete"}.\n` +
      `Iterations: ${result.iterations}, Tokens: ${result.tokensUsed || "n/a"}`
    );
    if (!result.success) {
      pushToDeadLetterQueue(job.name, job.goal, new Error(result.reason || "Did not complete successfully"));
    }
  } catch (error) {
    logRun(job.name, null, error);
    pushToDeadLetterQueue(job.name, job.goal, error);
    await report(`❌ [${job.name}] Failed with error: ${error.message}`);
  } finally {
    releaseLock();
  }
}

// ---------------------------------------------------------------------------
// 5. REGISTER CRON JOBS
// ---------------------------------------------------------------------------
SCHEDULE.filter((j) => j.enabled).forEach((job) => {
  cron.schedule(job.cronExpr, () => {
    runScheduledJob(job);
  });
  console.log(`⏱️ Registered cron job '${job.name}' [${job.cronExpr}]`);
});

module.exports = {
  SCHEDULE,
  runScheduledJob,
  acquireLock,
  releaseLock
};
