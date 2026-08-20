/**
 * ============================================================================
 *  COMPREHENSIVE CODEBASE & SYSTEM DIAGNOSTIC AUDITOR
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const issues = [];

function check(title, fn) {
  try {
    const res = fn();
    if (res && res.error) {
      issues.push({ title, error: res.error, fix: res.fix });
    } else {
      console.log(`✅ [OK] ${title}`);
    }
  } catch (err) {
    issues.push({ title, error: err.message });
  }
}

console.log("=== STARTING FULL SYSTEM AUDIT ===\n");

// 1. Check all JS files for syntax errors
const rootDir = path.resolve(__dirname, "..");
const jsFiles = fs.readdirSync(rootDir).filter(f => f.endsWith(".js"));
for (const file of jsFiles) {
  check(`Syntax Check: ${file}`, () => {
    try {
      execSync(`node -c "${path.join(rootDir, file)}"`, { stdio: "pipe" });
      return { ok: true };
    } catch (e) {
      return { error: `Syntax error in ${file}: ${e.stderr ? e.stderr.toString() : e.message}` };
    }
  });
}

// 2. Check package.json dependencies
check("Package Dependencies Integrity", () => {
  const pkgPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(pkgPath)) return { error: "package.json missing" };
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const missing = [];
  for (const dep of Object.keys(deps)) {
    try {
      require.resolve(dep, { paths: [rootDir] });
    } catch (_) {
      missing.push(dep);
    }
  }
  if (missing.length > 0) {
    return { error: `Missing node_modules: ${missing.join(", ")}`, fix: "npm install" };
  }
  return { ok: true };
});

// 3. Check ultron-server.js route definitions and imports
check("Ultron Server Route & Module Checks", () => {
  const serverCode = fs.readFileSync(path.join(rootDir, "ultron-server.js"), "utf-8");
  const missingImports = [];
  const reqMatches = serverCode.match(/require\(['"]\.\/([^'"]+)['"]\)/g) || [];
  for (const req of reqMatches) {
    const rel = req.match(/require\(['"]\.\/([^'"]+)['"]\)/)[1];
    const candidateJs = rel.endsWith(".js") ? rel : rel + ".js";
    const candidateJson = rel.endsWith(".json") ? rel : rel + ".json";
    if (!fs.existsSync(path.join(rootDir, candidateJs)) && !fs.existsSync(path.join(rootDir, candidateJson)) && !fs.existsSync(path.join(rootDir, rel))) {
      missingImports.push(rel);
    }
  }
  if (missingImports.length > 0) {
    return { error: `Server requires non-existent local modules: ${missingImports.join(", ")}` };
  }
  return { ok: true };
});

// 4. Check Skill Engine & Master Skills Registry
check("Master Skills Registry & Routing", () => {
  const skillEngine = require("../unified-skill-engine");
  const stats = skillEngine.getStats();
  if (stats.total_skills === 0) return { error: "No skills loaded in registry" };
  const match = skillEngine.findMatchingSkills("write high-performance secure rust backend");
  if (!match || match.length === 0) return { error: "Semantic routing returned no results for query" };
  return { ok: true };
});

// 5. Check Session Continuity state file
check("Session Continuity Ledger Integrity", () => {
  const sessionContinuity = require("../session-continuity");
  const state = sessionContinuity.getState();
  if (!state || !state.project_goal) return { error: "project-state.json is malformed" };
  return { ok: true };
});

// 6. Check Self Healing Watchdog protected paths
check("Self Healing Watchdog Safeguards", () => {
  const watchdog = require("../self-healing-watchdog");
  if (!watchdog.isProtectedPath(".env")) return { error: ".env is not protected" };
  if (!watchdog.validateJsSyntax("const x = 1;")) return { error: "validateJsSyntax failed valid syntax" };
  if (watchdog.validateJsSyntax("const x = ;")) return { error: "validateJsSyntax failed invalid syntax" };
  return { ok: true };
});

console.log("\n=== AUDIT SUMMARY ===");
if (issues.length === 0) {
  console.log("🎉 ZERO ISSUES FOUND! System is 100% healthy.");
} else {
  console.log(`Found ${issues.length} issues:`);
  issues.forEach((iss, i) => console.log(`${i + 1}. [${iss.title}]: ${iss.error}`));
  process.exit(1);
}
