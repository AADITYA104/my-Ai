/**
 * ============================================================================
 *  ULTRON VISION & PERCEPTION ENGINE (TOOLS/VISION.JS)
 *  - Real-time Screen Capture & Desktop State Understanding
 *  - Optical Character Recognition (OCR) for Reading Active Windows
 *  - Multimodal Visual Analysis with Fallbacks
 * ============================================================================
 */
"use strict";

const path = require("path");
const fs = require("fs");
const osBridge = require("../os-automation-bridge");

class VisionTool {
  constructor() {
    this.tempDir = path.join(__dirname, "..", "agent-memory", "vision_temp");
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Take a full desktop screenshot and save to temp file
   */
  async captureScreen() {
    const filePath = path.join(this.tempDir, `screen_${Date.now()}.png`);
    const res = osBridge.captureScreen(filePath);
    if (res.success) {
      return {
        success: true,
        filePath,
        message: "Screenshot captured successfully."
      };
    }
    return {
      success: false,
      error: res.error || "Screen capture failed."
    };
  }

  /**
   * Read active screen text using OCR
   */
  async readScreenText() {
    const snap = await this.captureScreen();
    if (!snap.success) {
      return { success: false, error: snap.error };
    }

    try {
      // If Tesseract is installed, run OCR
      const Tesseract = require("tesseract.js");
      const { data } = await Tesseract.recognize(snap.filePath, "eng");
      return {
        success: true,
        text: data.text,
        imagePath: snap.filePath
      };
    } catch (err) {
      console.warn(`[OCR FALLBACK] Tesseract not available: ${err.message}`);
      // Fallback: extract active window titles
      const windows = osBridge.getActiveWindows();
      return {
        success: true,
        imagePath: snap.filePath,
        activeWindows: windows,
        text: `Active application windows:\n${windows.map(w => `- ${w.ProcessName}: ${w.MainWindowTitle}`).join("\n")}`
      };
    }
  }
}

module.exports = new VisionTool();
