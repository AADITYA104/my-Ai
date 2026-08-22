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
    try {
      const startupFolder = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
      if (!fs.existsSync(startupFolder)) {
        fs.mkdirSync(startupFolder, { recursive: true });
      }
      const vbsDest = path.join(startupFolder, "ultron-autostart.vbs");
      const vbsContent = `Set WshShell = CreateObject("WScript.Shell")\r\nWshShell.Run "node ""${ultronScript}""", 0, False\r\n`;
      fs.writeFileSync(vbsDest, vbsContent, "utf-8");
      console.log(`✅ [WINDOWS AUTOSTART] Installed successfully to:\n   ${vbsDest}`);
      return { success: true, path: vbsDest };
    } catch (err) {
      console.error(`❌ [WINDOWS AUTOSTART ERROR] ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  if (platform === "linux") {
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
    const servicePath = "/etc/systemd/system/ultron.service";
    try {
      fs.writeFileSync(servicePath, serviceContent, "utf-8");
      execSync("systemctl daemon-reload && systemctl enable ultron && systemctl start ultron", { stdio: "inherit" });
      console.log("✅ [LINUX AUTOSTART] systemd service installed & started successfully.");
      return { success: true, path: servicePath };
    } catch (err) {
      console.error(`❌ [LINUX AUTOSTART ERROR] Root permissions required. Run with sudo: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  if (platform === "darwin") {
    const launchAgentsDir = path.join(process.env.HOME || "", "Library", "LaunchAgents");
    const plistPath = path.join(launchAgentsDir, "com.ultron.plist");
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ultron</string>
    <key>ProgramArguments</key>
    <array>
        <string>node</string>
        <string>${ultronScript}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${projectRoot}</string>
</dict>
</plist>`;
    try {
      if (!fs.existsSync(launchAgentsDir)) {
        fs.mkdirSync(launchAgentsDir, { recursive: true });
      }
      fs.writeFileSync(plistPath, plist, "utf-8");
      execSync(`launchctl load "${plistPath}"`, { stdio: "inherit" });
      console.log(`✅ [MACOS AUTOSTART] launchd agent installed to:\n   ${plistPath}`);
      return { success: true, path: plistPath };
    } catch (err) {
      console.error(`❌ [MACOS AUTOSTART ERROR] ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  return { success: false, error: `Unsupported platform: ${platform}` };
}

if (require.main === module) {
  installAutoStart();
}

module.exports = {
  installAutoStart
};
