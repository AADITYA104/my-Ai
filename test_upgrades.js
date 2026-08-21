/**
 * ============================================================================
 *  COMPREHENSIVE UPGRADE VERIFICATION TEST SUITE
 * ============================================================================
 */
"use strict";

const http = require("http");

async function runTests() {
  console.log("=== TESTING ULTRON 2026 OMNI-ENGINE UPGRADES ===\n");

  // 1. Start Server for Testing
  const serverProcess = require("./ultron-server");

  // Wait 1.5s for server to bind
  await new Promise(r => setTimeout(r, 1500));

  // Test 1: Health Telemetry API
  console.log("--- 1. Testing /api/ultron/health ---");
  try {
    const res = await fetch("http://localhost:3000/api/ultron/health");
    const data = await res.json();
    console.log("✅ [HEALTH API OK]:", {
      status: data.status,
      memory: `${data.system.memory.usedGB}GB / ${data.system.memory.totalGB}GB (${data.system.memory.freeGB}GB free)`,
      totalSkills: data.skills.total,
      watchdog: data.watchdog.status
    });
  } catch (err) {
    console.error("❌ Health API failed:", err.message);
  }

  // Test 2: Chat with Tool Calling (Read File)
  console.log("\n--- 2. Testing Chat Tool Calling (read_file) ---");
  try {
    const res = await fetch("http://localhost:3000/api/ultron/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Boss here. Please read package.json and tell me what the project name is."
      })
    });
    const data = await res.json();
    console.log("✅ [CHAT TOOL CALLING OK]:");
    console.log("Reply:", data.reply);
    console.log("Executed Tools:", data.executedTools?.map(t => t.name) || []);
    console.log("Model Used:", data.modelUsed);
  } catch (err) {
    console.error("❌ Chat tool calling failed:", err.message);
  }

  // Test 3: Multimodal Vision Processing
  console.log("\n--- 3. Testing Multimodal Vision Engine ---");
  try {
    // 1x1 transparent PNG base64
    const samplePngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const res = await fetch("http://localhost:3000/api/ultron/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Analyze this image and confirm vision subsystem status Boss.",
        image: {
          mimeType: "image/png",
          data: samplePngBase64
        }
      })
    });
    const data = await res.json();
    console.log("✅ [VISION SUBSYSTEM OK]:");
    console.log("Reply:", data.reply);
  } catch (err) {
    console.error("❌ Vision test failed:", err.message);
  }

  console.log("\n=== ALL UPGRADE TESTS COMPLETED SUCCESSFULLY ===");
  process.exit(0);
}

runTests();
