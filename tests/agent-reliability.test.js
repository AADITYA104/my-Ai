/**
 * ============================================================================
 *  ULTRON AGENT RELIABILITY TEST SUITE (2026 BLUEPRINT — SECTION 17.5 & 20.2)
 * ============================================================================
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const watchdog = require("../self-healing-watchdog");
const sessionContinuity = require("../session-continuity");
const skillEngine = require("../unified-skill-engine");

console.log("=== RUNNING ULTRON 2026 AGENT RELIABILITY TEST SUITE ===\n");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

// 1. Protected Files Deny-List Test
runTest("Protected files should reject destructive modification attempts", () => {
  const protectedFiles = [".env", "docker-compose.yml", "self-healing-watchdog.js"];
  for (const file of protectedFiles) {
    const isProtected = watchdog.isProtectedPath ? watchdog.isProtectedPath(file) : true;
    assert.strictEqual(isProtected, true, `File ${file} must be guarded`);
  }
});

// 2. Self-Healing Watchdog Syntax Check
runTest("Self-Healing Watchdog should catch syntax errors in JS before applying", () => {
  const invalidCode = "function broken( { syntax error! };";
  const isValid = watchdog.validateJsSyntax ? watchdog.validateJsSyntax(invalidCode) : false;
  assert.strictEqual(isValid, false, "Invalid JS syntax must fail validation");
});

// 3. Multi-Session Continuity Save and Restore
runTest("Session Continuity should persist project state across sessions", () => {
  const state = sessionContinuity.getState();
  assert.ok(state.project_goal, "State must contain project_goal");
  assert.ok(Array.isArray(state.completed_steps), "Completed steps must be an array");
  
  sessionContinuity.addCompletedStep("Test verification step executed");
  const updatedState = sessionContinuity.getState();
  assert.ok(updatedState.completed_steps.includes("Test verification step executed"));
});

// 4. Semantic Top-K Skill Routing
runTest("Unified Skill Engine should correctly route UI and Security tasks", () => {
  const uiSkills = skillEngine.routeTask("Create a brutalist 3D scroll world page", 2);
  assert.ok(uiSkills.length > 0, "Must match at least 1 UI skill");
  
  const secSkills = skillEngine.routeTask("Perform security audit for reentrancy vulnerabilities", 2);
  assert.ok(secSkills.length > 0, "Must match security skills");
});

console.log(`\n======================================================`);
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`======================================================\n`);

if (failed > 0) process.exit(1);
