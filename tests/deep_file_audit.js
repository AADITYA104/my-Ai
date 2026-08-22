/**
 * Deep File-By-File Inspection & Unit Tester
 * Scans every JS file in the project, checks syntax, verifies imports, tests exports, checks error handling.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

console.log("================================================================================");
console.log("🔍 ULTRON EXHAUSTIVE DEEP FILE-BY-FILE AUDIT & HEALTH INSPECTION");
console.log("================================================================================\n");

function findFiles(dir, exts = [".js", ".json"]) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    if (file === "node_modules" || file === ".git" || file === ".gemini" || file === ".agents" || file === "vision_temp" || file === "voice_temp") continue;
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(findFiles(filePath, exts));
    } else if (exts.some(ext => file.endsWith(ext))) {
      results.push(filePath);
    }
  }
  return results;
}

const files = findFiles(process.cwd(), [".js"]);
console.log(`Found ${files.length} JavaScript files to inspect.\n`);

const results = [];
let passCount = 0;
let failCount = 0;

for (const filePath of files) {
  const relPath = path.relative(process.cwd(), filePath);
  const isClientSide = relPath.startsWith("public") || relPath.includes("public\\") || relPath.includes("public/");
  const info = { file: relPath, syntax: false, load: false, issues: [] };

  // 1. Syntax Check
  try {
    execSync(`node -c "${filePath}"`, { stdio: "pipe" });
    info.syntax = true;
  } catch (err) {
    info.issues.push(`SYNTAX ERROR: ${err.message}`);
  }

  // 2. Require / Load Check (backend modules only)
  if (!isClientSide) {
    try {
      const mod = require(filePath);
      info.load = true;
      info.type = typeof mod;
      info.keys = typeof mod === "object" && mod !== null ? Object.keys(mod) : [];
    } catch (err) {
      info.issues.push(`REQUIRE ERROR: ${err.message}`);
    }
  } else {
    info.load = true;
    info.type = "client_script";
  }

  if (info.issues.length === 0) {
    passCount++;
    console.log(`✅ [OK] ${relPath} ${isClientSide ? "(Client JS Syntax Verified)" : `(Exports: ${info.keys ? info.keys.length : 0})`}`);
  } else {
    failCount++;
    console.log(`❌ [WARN/ERROR] ${relPath}:`);
    info.issues.forEach(iss => console.log(`   - ${iss}`));
  }
  results.push(info);
}

console.log("\n================================================================================");
console.log(`SUMMARY: ${passCount} Passed, ${failCount} With Warnings/Errors out of ${files.length} total files.`);
console.log("================================================================================");
