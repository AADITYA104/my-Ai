/**
 * ============================================================================
 *  CRON SCHEDULER — background automation, no human trigger needed
 * ============================================================================
 *
 * Runs agent goals on a schedule (daily market research, lead scraping,
 * content posting, etc.) without you sending a message. Reports results
 * to Telegram if TELEGRAM_BOT_TOKEN + REPORT_CHAT_ID are set, otherwise
 * just logs to a file.
 *
 * DESIGN NOTE — why this file is separate from the Telegram gateway:
 *   The gateway is EVENT-driven (you send /goal, it runs once).
 *   This scheduler is TIME-driven (runs whether or not you're watching).
 *   They share the same brain (autonomous-loop-agent-v5-native-tools.js)
 *   with dedicated run-history logging in agent-memory/cron-run-log.jsonl.
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const { runAgent } = require("./autonomous-loop-agent-v5-native-tools");

const RUN_LOG = path.join(__dirname, "agent-memory", "cron-run-log.jsonl");
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const REPORT_CHAT_ID = process.env.REPORT_CHAT_ID;

let bot = null;
if (TELEGRAM_BOT_TOKEN && REPORT_CHAT_ID) {
  const TelegramBot = require("node-telegram-bot-api");
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
}

// ---------------------------------------------------------------------------
// SCHEDULE — edit this to define your recurring jobs
// Cron format: minute hour day-of-month month day-of-week
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

// ---------------------------------------------------------------------------
// Run-history logging — every scheduled run appends one JSON line
// ---------------------------------------------------------------------------
function logRun(jobName, result, error) {
  fs.mkdirSync(path.dirname(RUN_LOG), { recursive: true });
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
// Job runner — wraps runAgent with logging + reporting + isolation
// ---------------------------------------------------------------------------
async function runScheduledJob(job) {
  await report(`⏰ [${job.name}] Starting scheduled run...`);
  try {
    const result = await runAgent(job.goal);
    logRun(job.name, result, null);
    await report(
      `${result.success ? "✅" : "⚠️"} [${job.name}] ${result.success ? "Completed" : "Did not complete"}.\n` +
        `Iterations: ${result.iterations}, Tokens: ${result.tokensUsed || "n/a"}`
    );
  } catch (error) {
    logRun(job.name, null, error);
    await report(`❌ [${job.name}] Failed with error: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// REGISTER all enabled jobs
// ---------------------------------------------------------------------------
SCHEDULE.filter((j) => j.enabled).forEach((job) => {
  if (!cron.validate(job.cronExpr)) {
    console.error(`Invalid cron expression for job "${job.name}": ${job.cronExpr}`);
    return;
  }
  cron.schedule(job.cronExpr, () => runScheduledJob(job));
  console.log(`Registered job "${job.name}" -> ${job.cronExpr}`);
});

console.log("\nCron scheduler running. Jobs will fire on their configured schedule.");
console.log("Keep this process alive with pm2/systemd/screen/tmux — it does nothing if killed.\n");

// ---------------------------------------------------------------------------
// CLI Trigger Flag: node cron-scheduler.js --run-now daily-market-news
// ---------------------------------------------------------------------------
const runNowFlagIndex = process.argv.indexOf("--run-now");
if (runNowFlagIndex !== -1) {
  const jobName = process.argv[runNowFlagIndex + 1];
  const job = SCHEDULE.find((j) => j.name === jobName);
  if (job) {
    console.log(`[--run-now] Triggering "${jobName}" immediately for testing...`);
    runScheduledJob(job);
  } else {
    console.error(`No job named "${jobName}" found in SCHEDULE.`);
  }
}
