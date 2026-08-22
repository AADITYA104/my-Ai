/**
 * ============================================================================
 *  ULTRON DESKTOP OS AUTOMATION BRIDGE (2026 ARCHITECTURE)
 *  - Safe Windows UI Automation & Element-Based Controls.
 *  - Coordinate / Script simulation with Watchdog Guardrail Check.
 *  - Screen & App Lifecycle Management.
 * ============================================================================
 */
"use strict";

const { execSync, spawnSync } = require("child_process");
const watchdog = require("./self-healing-watchdog");

class OSAutomationBridge {
  constructor() {
    this.isWindows = process.platform === "win32";
  }

  /**
   * Get list of active visible windows and processes
   */
  getActiveWindows() {
    if (!this.isWindows) return [];
    try {
      const psCmd = 'Get-Process | Where-Object {$_.MainWindowTitle -ne ""} | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json';
      const out = execSync(`powershell -NoProfile -Command "${psCmd}"`, { encoding: "utf-8", timeout: 10000 });
      return JSON.parse(out);
    } catch (_) {
      return [];
    }
  }

  /**
   * Safe application launcher
   */
  launchApp(appNameOrPath) {
    if (watchdog.isDestructiveCommand(appNameOrPath)) {
      return { success: false, error: "Blocked by watchdog deny-matrix." };
    }
    try {
      if (this.isWindows) {
        execSync(`start "" "${appNameOrPath}"`, { timeout: 10000 });
      } else {
        execSync(`xdg-open "${appNameOrPath}"`, { timeout: 10000 });
      }
      return { success: true, message: `Launched ${appNameOrPath}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Send keyboard keystroke sequence safely via PowerShell WScript.Shell
   */
  sendKeystrokes(keys) {
    if (!this.isWindows) return { success: false, error: "Only supported on Windows" };
    // Guard against dangerous injections
    const sanitized = keys.replace(/["`$]/g, "");
    try {
      const script = `$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('${sanitized}')`;
      execSync(`powershell -NoProfile -Command "${script}"`, { timeout: 10000 });
      return { success: true, message: `Sent keys: ${sanitized}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Capture screenshot via native PowerShell .NET Graphics
   */
  captureScreen(outputPath) {
    if (!this.isWindows) return { success: false, error: "Only supported on Windows" };
    try {
      const safePath = outputPath.replace(/\\/g, "\\\\");
      const psLines = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "Add-Type -AssemblyName System.Drawing",
        "$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds",
        "$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)",
        "$graphic = [System.Drawing.Graphics]::FromImage($bitmap)",
        "$origin = New-Object System.Drawing.Point(0, 0)",
        "$graphic.CopyFromScreen($screen.Location, $origin, $screen.Size)",
        `$bitmap.Save('${safePath}', [System.Drawing.Imaging.ImageFormat]::Png)`,
        "$graphic.Dispose()",
        "$bitmap.Dispose()"
      ].join("; ");
      // Encode as Base64 to avoid inline quoting issues
      const encoded = Buffer.from(psLines, "utf16le").toString("base64");
      execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 15000 });
      return { success: true, path: outputPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = new OSAutomationBridge();
