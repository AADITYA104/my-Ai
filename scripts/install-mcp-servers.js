/**
 * ============================================================================
 *  POSTINSTALL: auto-install dependencies for bundled MCP servers
 *  mcp-servers/* and ponytail-mcp/ each have their own package.json (they're
 *  standalone MCP servers spawned as child processes by mcp-bridge.js /
 *  ruflo-bridge.js). Their node_modules aren't part of the main npm
 *  workspace and aren't committed to git (too large), so a plain
 *  `npm install` at the project root wouldn't otherwise reach them — this
 *  hook does that automatically so nothing manual is required.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const MCP_SERVER_DIRS = [
  path.join(__dirname, "..", "mcp-servers", "sequentialthinking"),
  path.join(__dirname, "..", "mcp-servers", "memory"),
  path.join(__dirname, "..", "ponytail-mcp")
];

for (const dir of MCP_SERVER_DIRS) {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) continue; // not bundled in this checkout — skip silently

  const nodeModules = path.join(dir, "node_modules");
  if (fs.existsSync(nodeModules)) continue; // already installed — skip

  console.log(`[postinstall] Installing dependencies for ${path.relative(path.join(__dirname, ".."), dir)}...`);
  try {
    // NOTE: no --omit=dev here — these are TypeScript packages whose own
    // "prepare"/"build" npm lifecycle script needs @types/node etc. to run
    // tsc. Pre-built dist/ files are already committed as a fallback, so
    // even if this install's build step fails, the server still works from
    // the existing dist/ — this just refreshes it when possible.
    execSync("npm install --no-audit --no-fund", { cwd: dir, stdio: "inherit" });
  } catch (err) {
    console.warn(`[postinstall] NOTE: dependency install/build for ${dir} hit an issue, but a pre-built dist/ is already included, so its MCP tools should still work. (${err.message})`);
  }
}
