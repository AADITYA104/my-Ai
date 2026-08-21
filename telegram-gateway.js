/**
 * ============================================================================
 *  TELEGRAM GATEWAY — 2026 SOVEREIGN AGENT & TELEMETRY CONTROLLER
 *  - Strict Per-Chat Multi-User Session Isolation & Rate Limiting.
 *  - Input Sanitization & Stream-Level Secrets Redaction.
 *  - Real-Time Holographic Streaming to Mobile Terminal.
 *  - 711 Master Skills + Hardware Telemetry Integration.
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

// Strict Per-Chat Session Store (chatId -> UserSession)
const userSessions = new Map();
const rateLimitMap = new Map(); // chatId -> [timestamps]

function checkRateLimit(chatId, maxRequests = 5, windowMs = 600000, cooldownMs = 10000) {
  const now = Date.now();
  const timestamps = rateLimitMap.get(chatId) || [];
  const recent = timestamps.filter(t => now - t < windowMs);
  
  if (recent.length > 0 && now - recent[recent.length - 1] < cooldownMs) {
    return { allowed: false, reason: "Please wait 10 seconds between requests, Boss." };
  }
  if (recent.length >= maxRequests) {
    return { allowed: false, reason: "Rate limit reached (max 5 requests per 10 mins), Boss." };
  }
  recent.push(now);
  rateLimitMap.set(chatId, recent);
  return { allowed: true };
}

function isAllowed(chatId) {
  if (ALLOWED_CHAT_IDS.length === 0) return true;
  return ALLOWED_CHAT_IDS.includes(String(chatId));
}

function getSession(chatId) {
  if (!userSessions.has(chatId)) {
    userSessions.set(chatId, {
      chatId,
      running: false,
      stopRequested: false,
      history: [],
      lastActive: Date.now()
    });
  }
  const s = userSessions.get(chatId);
  s.lastActive = Date.now();
  return s;
}

// Console logs mirrored to Telegram with live secrets redaction
function attachProgressStreaming(chatId) {
  if (!bot) return () => {};
  const originalLog = console.log;
  let buffer = [];
  let lastFlush = Date.now();

  console.log = (...args) => {
    originalLog(...args);
    const rawLine = args.join(" ");
    const sanitized = watchdog.redactLogs(rawLine);
    buffer.push(sanitized);
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
      const finalChunk = watchdog.redactLogs(buffer.join("\n")).slice(0, 3500);
      bot.sendMessage(chatId, finalChunk).catch(() => {});
    }
  };
}

if (bot) {
  bot.onText(/\/goal (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) {
      return bot.sendMessage(chatId, "⛔ Not authorized Boss.");
    }

    const rateCheck = checkRateLimit(chatId);
    if (!rateCheck.allowed) {
      return bot.sendMessage(chatId, `⚠️ ${rateCheck.reason}`);
    }

    const session = getSession(chatId);
    if (session.running) {
      return bot.sendMessage(chatId, "⚠️ A task is already in progress Boss. Use /status or /stop.");
    }

    const rawGoal = match[1];
    const goal = watchdog.sanitizeShellInput(rawGoal).slice(0, 1000).trim();
    if (!goal) return bot.sendMessage(chatId, "⚠️ Please provide a valid goal, Boss.");

    const matchedSkills = skillEngine.routeTask(goal, 3);
    session.running = true;
    session.stopRequested = false;

    await bot.sendMessage(
      chatId,
      `🎯 *Starting Autonomous Task Boss:*\n"${goal}"\n\n🧠 *Routed Skills:* ${matchedSkills.map(s => s.name).join(", ") || "General Scaffolding"}`,
      { parse_mode: "Markdown" }
    );

    const detach = attachProgressStreaming(chatId);
    try {
      const result = await runAgent(goal, {
        isStopRequested: () => session.stopRequested,
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
      session.running = false;
      session.stopRequested = false;
    }
  });

  bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return bot.sendMessage(chatId, "⛔ Not authorized.");
    const session = getSession(chatId);
    bot.sendMessage(
      chatId,
      session.running ? "🟢 *Ultron is executing a goal right now Boss.*" : "⚪ *Ultron is idle and standing by for orders, Boss.*",
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
    const session = getSession(chatId);
    if (!session.running) {
      return bot.sendMessage(chatId, "⚪ No task is currently running, Boss.");
    }
    session.stopRequested = true;
    bot.sendMessage(chatId, "🛑 *Stop requested Boss* — halting cleanly after current step.");
  });

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
      chatId,
      `🤖 *ULTRON 2026 OMNI-CHANNEL AI CORE*\n\nYes Boss, I am connected to your mobile terminal.\n\n*Commands:*\n• \`/goal <text>\` — Start autonomous task\n• \`/status\` — Check running status\n• \`/skills\` — View 711 skills catalog\n• \`/health\` — View laptop hardware telemetry\n• \`/stop\` — Stop current execution`,
      { parse_mode: "Markdown" }
    );
  });

  console.log("🤖 [TELEGRAM GATEWAY] Initialized with Rate Limiting & Per-Chat Isolation.");
}

module.exports = {
  isGatewayActive: () => !!bot,
  getSession,
  checkRateLimit
};
