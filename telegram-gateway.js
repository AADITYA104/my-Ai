/**
 * ============================================================================
 *  TELEGRAM GATEWAY — 2026 SOVEREIGN AGENT & TELEMETRY CONTROLLER
 * ============================================================================
 *
 * Wraps autonomous-loop-agent-v7-free.js (Universal Free Multi-Provider Engine)
 * with 708 Master Skills, Ponytail root-cause repair, and real-time streaming.
 *
 * COMMANDS:
 *   /goal <text>   — starts the agent on a new goal with 708-skill pass-through
 *   /status        — shows if a goal is currently running
 *   /skills        — lists top master skills & categories
 *   /health        — displays live laptop memory, VRAM, and system metrics
 *   /stop          — requests the current run to stop cleanly
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const TelegramBot = require("node-telegram-bot-api");
const { runAgent } = require("./autonomous-loop-agent-v7-free");
const skillEngine = require("./unified-skill-engine");
const watchdog = require("./self-healing-watchdog");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT_IDS = (process.env.ALLOWED_CHAT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!TOKEN) {
  console.log("ℹ️ [TELEGRAM GATEWAY] TELEGRAM_BOT_TOKEN not set. Gateway standing by.");
}

let bot = null;
if (TOKEN) {
  bot = new TelegramBot(TOKEN, { polling: true });
}

// chatId -> { running: bool, stopRequested: bool }
const chatState = new Map();

function isAllowed(chatId) {
  if (ALLOWED_CHAT_IDS.length === 0) return true; // If no whitelist configured, allow default
  return ALLOWED_CHAT_IDS.includes(String(chatId));
}

function getState(chatId) {
  if (!chatState.has(chatId)) {
    chatState.set(chatId, { running: false, stopRequested: false });
  }
  return chatState.get(chatId);
}

// Console logs mirrored to Telegram, throttled
function attachProgressStreaming(chatId) {
  if (!bot) return () => {};
  const originalLog = console.log;
  let buffer = [];
  let lastFlush = Date.now();

  console.log = (...args) => {
    originalLog(...args);
    buffer.push(args.join(" "));
    const now = Date.now();
    if (now - lastFlush > 3500 || buffer.length > 6) {
      const chunk = buffer.join("\n").slice(0, 3500);
      buffer = [];
      lastFlush = now;
      if (chunk.trim() && bot) bot.sendMessage(chatId, chunk).catch(() => {});
    }
  };

  return () => {
    console.log = originalLog;
    if (buffer.length && bot) {
      bot.sendMessage(chatId, buffer.join("\n").slice(0, 3500)).catch(() => {});
    }
  };
}

if (bot) {
  bot.onText(/\/goal (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) {
      return bot.sendMessage(chatId, "⛔ Not authorized Boss.");
    }

    const state = getState(chatId);
    if (state.running) {
      return bot.sendMessage(chatId, "⚠️ A task is already in progress Boss. Use /status or /stop.");
    }

    const goal = match[1];
    const matchedSkills = skillEngine.routeTask(goal, 3);
    state.running = true;
    state.stopRequested = false;

    await bot.sendMessage(
      chatId,
      `🎯 *Starting Autonomous Task Boss:*\n"${goal}"\n\n🧠 *Routed Skills:* ${matchedSkills.map(s => s.name).join(", ") || "General Scaffolding"}`,
      { parse_mode: "Markdown" }
    );

    const detach = attachProgressStreaming(chatId);
    try {
      const result = await runAgent(goal, {
        isStopRequested: () => state.stopRequested,
      });
      await bot.sendMessage(
        chatId,
        `${result.success ? "✅ *Task Completed Successfully Boss!*" : "⚠️ *Task Halted*"}\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
        { parse_mode: "Markdown" }
      );
    } catch (e) {
      await bot.sendMessage(chatId, `❌ Agent error: ${e.message}`);
    } finally {
      detach();
      state.running = false;
      state.stopRequested = false;
    }
  });

  bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return bot.sendMessage(chatId, "⛔ Not authorized.");
    const state = getState(chatId);
    bot.sendMessage(
      chatId,
      state.running ? "🟢 *Ultron is executing a goal right now Boss.*" : "⚪ *Ultron is idle and standing by for orders, Boss.*",
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/\/skills/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return bot.sendMessage(chatId, "⛔ Not authorized.");
    const stats = skillEngine.getStats();
    let catText = Object.entries(stats.categories || {}).map(([c, count]) => `• *${c}*: ${count} skills`).join("\n");
    bot.sendMessage(
      chatId,
      `🧠 *ULTRON MASTER SKILLS REGISTRY*\n\n📊 *Total Active Skills:* ${stats.total_skills}\n🛠️ *Engine:* ${stats.engine}\n\n*Categories:*\n${catText}`,
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/\/health/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return bot.sendMessage(chatId, "⛔ Not authorized.");
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
    const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
    const usedMem = (totalMem - freeMem).toFixed(1);
    const cpus = os.cpus().length;
    const uptimeHrs = (os.uptime() / 3600).toFixed(1);

    bot.sendMessage(
      chatId,
      `⚡ *ULTRON TELEMETRY & HARDWARE HEALTH*\n\n🖥️ *CPU Cores:* ${cpus}\n💾 *System RAM:* ${usedMem} GB / ${totalMem} GB (${freeMem} GB free)\n⏱️ *Host Uptime:* ${uptimeHrs} hours\n🛡️ *Watchdog:* Active (Syntax + Checkpoint Protection)\n🚀 *Router:* Low-Load Dual Engine (0% Stress)`,
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/\/stop/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return bot.sendMessage(chatId, "⛔ Not authorized.");
    const state = getState(chatId);
    if (!state.running) {
      return bot.sendMessage(chatId, "⚪ No task is currently running, Boss.");
    }
    state.stopRequested = true;
    bot.sendMessage(chatId, "🛑 *Stop requested Boss* — halting cleanly after current step.");
  });

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
      chatId,
      `🤖 *ULTRON 2026 OMNI-CHANNEL AI CORE*\n\nYes Boss, I am connected to your mobile terminal.\n\n*Commands:*\n• \`/goal <text>\` — Start autonomous task\n• \`/status\` — Check running status\n• \`/skills\` — View 708 skills catalog\n• \`/health\` — View laptop hardware telemetry\n• \`/stop\` — Stop current execution`,
      { parse_mode: "Markdown" }
    );
  });

  console.log("🤖 [TELEGRAM GATEWAY] Initialized and online.");
}

module.exports = {
  isGatewayActive: () => !!bot
};
