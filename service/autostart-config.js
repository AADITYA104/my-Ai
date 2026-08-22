/**
 * ============================================================================
 *  ULTRON BACKGROUND SERVICE & AUTO-START CONFIGURATOR (SERVICE/AUTOSTART-CONFIG.JS)
 *  - Configures laptop boot auto-start for Windows / macOS / Linux.
 *  - Auto-restart on unexpected crashes.
 * ============================================================================
 */
"use strict";

const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

function installAutoStart() {
  const platform = process.platform;
  const projectRoot = path.resolve(__dirname, "..");
  const ultronScript = path.join(projectRoot, "ultron.js");

  console.log(`🔧 [AUTOSTART] Installing Ultron background auto-start for ${platform}...`);

  if (platform === "win32") {
    const startupFolder = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
    const vbsSource = path.join(projectRoot, "ultron-autostart.vbs");
    const vbsDest = path.join(startupFolder, "ultron-autostart.vbs");

    if (fs.existsSync(vbsSource) && fs.existsSync(startupFolder)) {
      try {
        fs.copyFileSync(vbsSource, vbsDest);
        console.log(`✅ [WINDOWS AUTOSTART] Installed successfully to:\n   ${vbsDest}`);
        return { success: true, path: vbsDest };
      } catch (err) {
        console.error(`❌ [WINDOWS AUTOSTART ERROR] ${err.message}`);
        return { success: false, error: err.message };
      }
    }
  } else if (platform === "linux") {
    const serviceContent = `[Unit]
Description=ULTRON Autonomous AI Core
After=network.target

[Service]
ExecStart=/usr/bin/node ${ultronScript}
WorkingDirectory=${projectRoot}
Restart=always
User=${process.env.USER || "root"}

[Install]
WantedBy=multi-user.target
`;
    console.log("ℹ️ [LINUX SYSTEMD SERVICE]:\n" + serviceContent);
  }

  return { success: true };
}

if (require.main === module) {
  installAutoStart();
}

module.exports = {
  installAutoStart
};
