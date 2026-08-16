/**
 * ============================================================================
 *  TELEGRAM GATEWAY — talk to your autonomous agent from your phone
 * ============================================================================
 *
 * Wraps autonomous-loop-agent-v5-native-tools.js (Brain + Skill Memory + Native Tools)
 * behind a Telegram bot. Send it a goal, it runs the full loop, and streams
 * progress + the final result back into the chat.
 *
 * COMMANDS:
 *   /goal <text>   — starts the agent on a new goal
 *   /status        — shows if a goal is currently running for this chat
 *   /skills        — lists everything the agent has learned so far
 *   /stop          — requests the current run to stop after its current step
 *
 * SAFETY NOTES:
 *   - ALLOWED_CHAT_IDS below restricts who can command the agent.
 *   - Only one goal runs per chat at a time to prevent file lock corruption.
 * ============================================================================
 */

const TelegramBot = require("node-telegram-bot-api");
const { runAgent, listSkills } = require("./autonomous-loop-agent-v5-native-tools");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT_IDS = (process.env.ALLOWED_CHAT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!TOKEN) throw new Error("Set TELEGRAM_BOT_TOKEN environment variable");
if (ALLOWED_CHAT_IDS.length === 0) {
  console.warn("⚠️  ALLOWED_CHAT_IDS is empty — bot will refuse ALL commands until you set it.");
}

const bot = new TelegramBot(TOKEN, { polling: true });

// chatId -> { running: bool, stopRequested: bool }
const chatState = new Map();

function isAllowed(chatId) {
  return ALLOWED_CHAT_IDS.includes(String(chatId));
}

function getState(chatId) {
  if (!chatState.has(chatId)) {
    chatState.set(chatId, { running: false, stopRequested: false });
  }
  return chatState.get(chatId);
}

// ---------------------------------------------------------------------------
// Console logs also get mirrored to Telegram, throttled to avoid spam
// ---------------------------------------------------------------------------
function attachProgressStreaming(chatId) {
  const originalLog = console.log;
  let buffer = [];
  let lastFlush = Date.now();

  console.log = (...args) => {
    originalLog(...args);
    buffer.push(args.join(" "));
    const now = Date.now();
    if (now - lastFlush > 4000 || buffer.length > 8) {
      const chunk = buffer.join("\n").slice(0, 3500);
      buffer = [];
      lastFlush = now;
      if (chunk.trim()) bot.sendMessage(chatId, chunk).catch(() => {});
    }
  };

  return () => {
    console.log = originalLog; // restore
    if (buffer.length) {
      bot.sendMessage(chatId, buffer.join("\n").slice(0, 3500)).catch(() => {});
    }
  };
}

// ---------------------------------------------------------------------------
// COMMAND HANDLERS
// ---------------------------------------------------------------------------
bot.onText(/\/goal (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAllowed(chatId)) {
    return bot.sendMessage(chatId, "⛔ Not authorized for this bot.");
  }

  const state = getState(chatId);
  if (state.running) {
    return bot.sendMessage(chatId, "⚠️ A goal is already running. Use /status or /stop.");
  }

  const goal = match[1];
  state.running = true;
  state.stopRequested = false;
  await bot.sendMessage(chatId, `🎯 Starting goal:\n${goal}`);

  const detach = attachProgressStreaming(chatId);
  try {
    const result = await runAgent(goal, {
      isStopRequested: () => state.stopRequested,
    });
    await bot.sendMessage(
      chatId,
      `${result.success ? "✅ Done" : "⚠️ Stopped / Incomplete"}\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
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
  bot.sendMessage(chatId, state.running ? "🟢 A goal is currently running." : "⚪ Idle — no goal running.");
});

bot.onText(/\/skills/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAllowed(chatId)) return bot.sendMessage(chatId, "⛔ Not authorized.");
  const skills = listSkills();
  if (skills.length === 0) return bot.sendMessage(chatId, "📚 No skills learned yet.");
  const list = skills.map((s, i) => `${i + 1}. *${s.title}* — ${s.whenToUse || "N/A"}`).join("\n");
  bot.sendMessage(chatId, `📚 *Learned skills (${skills.length}):*\n${list}`, { parse_mode: "Markdown" });
});

bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAllowed(chatId)) return bot.sendMessage(chatId, "⛔ Not authorized.");
  const state = getState(chatId);
  if (!state.running) {
    return bot.sendMessage(chatId, "⚪ No goal is currently running.");
  }
  state.stopRequested = true;
  bot.sendMessage(chatId, "🛑 Stop requested — halting execution cleanly after the current step.");
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    isAllowed(chatId)
      ? "🤖 *Agent Gateway Ready*\n\nCommands:\n• `/goal <text>` — Start new goal\n• `/status` — Check active state\n• `/skills` — List learned skills\n• `/stop` — Stop current goal"
      : `⛔ Not authorized.\nYour chat id is \`${chatId}\` — add it to \`ALLOWED_CHAT_IDS\` to use this bot.`,
    { parse_mode: "Markdown" }
  );
});

console.log("Telegram gateway running. Waiting for messages...");
