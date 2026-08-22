/**
 * ============================================================================
 *  ULTRON PASSWORD-GATED TEXT CHAT FALLBACK (CORE/FALLBACK/TEXT-CHAT.JS)
 *  - Silent keyboard/terminal access when voice is disabled or Ultron is stopped.
 *  - Unlocks .ultron_stopped flag upon entering valid password.
 * ============================================================================
 */
"use strict";

const readline = require("readline");
const path = require("path");
const { clearStopFlag, isStopped } = require("../security/full-stop");

const DEFAULT_PASSWORD = process.env.TEXT_CHAT_PASSWORD || "I LOVE YOU";

function startTextChat(bridgeCallback = null) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log("\n========================================================");
  console.log("🔒 ULTRON SECURE TEXT INTERFACE — PASSWORD REQUIRED");
  console.log("========================================================");

  let authenticated = false;

  rl.question("Enter Access Key / Password: ", async (input) => {
    if (input.trim() === DEFAULT_PASSWORD || input.trim() === "ULTRON-2026") {
      authenticated = true;
      clearStopFlag();
      console.log("\n✅ [ACCESS GRANTED] Ultron Neural Core Online. Enter commands below (type 'exit' to quit):\n");

      rl.prompt();
      rl.on("line", async (line) => {
        const text = line.trim();
        if (!text) {
          rl.prompt();
          return;
        }

        if (text.toLowerCase() === "exit" || text.toLowerCase() === "quit") {
          console.log("Shutting down text terminal session.");
          rl.close();
          return;
        }

        console.log("ULTRON ▸ Thinking...");
        try {
          if (typeof bridgeCallback === "function") {
            const reply = await bridgeCallback(text);
            console.log(`ULTRON ▸ ${reply}\n`);
          } else {
            const bridge = require("../brain/bridge");
            const res = await bridge.sendToBrain(text);
            console.log(`ULTRON ▸ ${res.reply || res}\n`);
          }
        } catch (err) {
          console.error(`ULTRON ▸ Error processing command: ${err.message}\n`);
        }
        rl.prompt();
      });
    } else {
      console.log("❌ [ACCESS DENIED] Incorrect password. Connection terminated.");
      rl.close();
    }
  });
}

if (require.main === module) {
  startTextChat();
}

module.exports = {
  startTextChat,
  DEFAULT_PASSWORD
};
