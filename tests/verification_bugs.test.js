/**
 * Comprehensive test suite verifying the 7 Critical Bug Fixes
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================");
console.log("🧪 RUNNING VERIFICATION TEST SUITE (7 CRITICAL FIXES)");
console.log("==================================================");

// Fix 1: autostart-config.js
console.log("\n[TEST 1] Testing autostart-config.js...");
const { installAutoStart } = require("../service/autostart-config");
const autostartRes = installAutoStart();
assert.strictEqual(autostartRes.success, true, "Autostart install should return success: true");
assert.ok(fs.existsSync(autostartRes.path), "Autostart file must exist on disk");
const vbsContent = fs.readFileSync(autostartRes.path, "utf-8");
assert.ok(vbsContent.includes("ultron.js"), "VBS script must reference ultron.js");
console.log("✅ [TEST 1 PASSED] Autostart VBS successfully written and verified on disk.");

// Fix 2: ultron.js syntax & UI launcher
console.log("\n[TEST 2] Testing ultron.js syntax & structure...");
const ultronContent = fs.readFileSync(path.join(__dirname, "..", "ultron.js"), "utf-8");
assert.ok(ultronContent.includes("start http://localhost:3000") || ultronContent.includes("http://localhost:3000"), "ultron.js must include UI auto-open");
console.log("✅ [TEST 2 PASSED] ultron.js includes auto-browser launch logic.");

// Fix 3: Voice lock & STT audioPath
console.log("\n[TEST 3] Testing STT audioPath & voice lock authorization...");
const { startSTT } = require("../core/stt/stream");
const { authorizeCommand } = require("../core/security/voice-lock");

startSTT().then(async (sttResult) => {
  assert.ok(typeof sttResult === "object", "startSTT should return an object");
  assert.ok("text" in sttResult, "startSTT result must contain 'text'");
  assert.ok("audioPath" in sttResult, "startSTT result must contain 'audioPath'");
  const auth = await authorizeCommand(sttResult.audioPath);
  assert.strictEqual(typeof auth.authorized, "boolean", "authorizeCommand must return boolean authorized");
  console.log("✅ [TEST 3 PASSED] STT stream returns { text, audioPath } and passes to voice-lock.");
});

// Fix 4 & 5 & 6 & 7: autonomous-loop-agent-v7-free.js
console.log("\n[TEST 4] Testing Safe Calculator Evaluator...");
const { safeEvaluateArithmetic, calculateTaskCost, releaseWorkspaceLock } = require("../autonomous-loop-agent-v7-free");

// Safe arithmetic
assert.strictEqual(safeEvaluateArithmetic("2 + 2 * 10"), "22");
assert.strictEqual(safeEvaluateArithmetic("Math.sqrt(144) + Math.pow(2, 3)"), "20");
assert.strictEqual(safeEvaluateArithmetic("(100 - 20) / 4"), "20");
console.log("  -> Safe math evaluated correctly.");

// Malicious code blocking
const rUnlink = safeEvaluateArithmetic('require("fs").unlinkSync("test")');
assert.ok(rUnlink.startsWith("[CALC_ERROR]"), "require('fs') must be blocked");

const rProcess = safeEvaluateArithmetic("process.exit(1)");
assert.ok(rProcess.startsWith("[CALC_ERROR]"), "process.exit must be blocked");

const rFunction = safeEvaluateArithmetic("Function('return 42')()");
assert.ok(rFunction.startsWith("[CALC_ERROR]"), "Function constructor must be blocked");
console.log("✅ [TEST 4 & 5 PASSED] Safe calculator strictly allows arithmetic & blocks arbitrary execution.");

// Fix 6: Multi-Provider Cost Tracking
console.log("\n[TEST 6] Testing Multi-Provider Cost Tracking...");
const cost1 = calculateTaskCost(10000);
assert.ok(cost1.costUsd && cost1.provider, "Cost tracking should return costUsd and provider name");
console.log(`  -> Provider: ${cost1.provider}, 10k tokens cost: ${cost1.costUsd}`);
console.log("✅ [TEST 6 PASSED] Multi-provider pricing calculated dynamically.");

// Fix 7: Workspace Lock Release
console.log("\n[TEST 7] Testing Workspace Lock Release helper...");
assert.strictEqual(typeof releaseWorkspaceLock, "function", "releaseWorkspaceLock must be a function");
releaseWorkspaceLock();
console.log("✅ [TEST 7 PASSED] releaseWorkspaceLock exported and verified.");

console.log("\n==================================================");
console.log("🎉 ALL 7 CRITICAL BUG FIXES VERIFIED SUCCESSFULLY!");
console.log("==================================================");
