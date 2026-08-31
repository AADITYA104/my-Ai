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

// SECURITY: no hardcoded fallback/bypass password. A universal bypass
// baked into public source code ("ULTRON-2026") defeats the entire point
// of a password gate — anyone who reads this file on GitHub has it. You
// MUST set TEXT_CHAT_PASSWORD in .env before this fallback interface works.
const CONFIGURED_PASSWORD = process.env.TEXT_CHAT_PASSWORD || "";

function startTextChat(bridgeCallback = null) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log("\n========================================================");
  console.log("🔒 ULTRON SECURE TEXT INTERFACE — PASSWORD REQUIRED");
  console.log("========================================================");

  if (!CONFIGURED_PASSWORD) {
    console.log("❌ [MISCONFIGURED] TEXT_CHAT_PASSWORD is not set in .env. Refusing to start an unauthenticated fallback shell.");
    rl.close();
    return;
  }

  rl.question("Enter Access Key / Password: ", async (input) => {
    if (input.trim() === CONFIGURED_PASSWORD) {
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

        // [PONYTAIL MODE] Handle mode-switch commands locally, same as the HTTP chat endpoint.
        const ponytailModeCmd = require("../../ponytail-mode").parseModeCommand(text);
        if (ponytailModeCmd) {
          const applied = require("../../ponytail-mode").setMode(ponytailModeCmd);
          console.log(`ULTRON ▸ ${applied === "off" ? "Ponytail mode is off. Back to normal." : `Ponytail mode switched to ${applied}.`}\n`);
          rl.prompt();
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
  startTextChat
};
