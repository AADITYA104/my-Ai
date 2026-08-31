/**
 * ============================================================================
 *  RUFLO MCP BRIDGE
 *  Connects to a REAL, unmodified ruflo MCP server (v3/@claude-flow/cli's
 *  bin/mcp-server.js) as a child process, speaking the actual MCP JSON-RPC
 *  protocol over stdio. This is not a reimplementation — it drives the real
 *  ruflo binary, giving you its actual 333 tools (agent_*, swarm_*,
 *  memory_* with real HNSW vector search, hooks_* self-learning, etc.)
 *  from plain Node.js, with no Claude Code / MCP-client host required.
 *
 *  SETUP (one-time, on your own machine — see docs/ruflo-bridge-setup.md):
 *    1. Clone https://github.com/ruvnet/claude-flow (or unzip the ruflo
 *       release) somewhere, e.g. C:\tools\ruflo\v3
 *    2. cd v3 && npx pnpm install
 *    3. npx pnpm -r --filter "./@claude-flow/shared" --filter "./@claude-flow/security" \
 *         --filter "./@claude-flow/memory" --filter "./@claude-flow/cli-core" \
 *         --filter "./@claude-flow/mcp" --filter "./@claude-flow/neural" \
 *         --filter "./@claude-flow/providers" --filter "./@claude-flow/swarm" \
 *         --filter "./@claude-flow/hooks" build
 *    4. cd @claude-flow/cli && npx tsc
 *    5. Set RUFLO_MCP_PATH in .env to the absolute path of
 *       v3/@claude-flow/cli/bin/mcp-server.js
 *  This exact sequence was verified end-to-end in a Linux sandbox (pnpm
 *  install, every build step, and a live tools/list handshake all
 *  succeeded — 333 tools returned). On Windows, better-sqlite3's native
 *  build step needs a C++ toolchain (Visual Studio Build Tools with
 *  "Desktop development with C++") unless a prebuilt binary is available
 *  for your Node version.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const { spawn } = require("child_process");

class RufloMCPBridge {
  constructor(serverPath) {
    this.serverPath = serverPath || process.env.RUFLO_MCP_PATH || "";
    this.proc = null;
    this.buf = "";
    this.pending = new Map();
    this.nextId = 1;
    this.ready = false;
  }

  isConfigured() {
    return !!this.serverPath && fs.existsSync(this.serverPath);
  }

  start() {
    if (this.proc) return;
    if (!this.isConfigured()) {
      throw new Error(
        `Ruflo MCP server not found. Set RUFLO_MCP_PATH in .env to the absolute path of ` +
        `v3/@claude-flow/cli/bin/mcp-server.js after building ruflo (see docs/ruflo-bridge-setup.md). ` +
        `Current value: "${this.serverPath || "(unset)"}"`
      );
    }
    this.proc = spawn("node", [this.serverPath], { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stdout.on("data", (d) => this._onData(d));
    this.proc.stderr.on("data", () => {}); // ruflo logs startup info to stderr; swallow by default
    this.proc.on("exit", () => { this.proc = null; this.ready = false; });
    this.proc.on("error", (err) => { this.proc = null; this.ready = false; console.warn("[RUFLO BRIDGE] spawn error:", err.message); });
  }

  _onData(chunk) {
    this.buf += chunk.toString();
    const lines = this.buf.split("\n");
    this.buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (_) { continue; }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || "Ruflo MCP error"));
        else resolve(msg.result);
      }
    }
  }

  _send(method, params, expectReply = true) {
    return new Promise((resolve, reject) => {
      const id = expectReply ? this.nextId++ : undefined;
      const payload = { jsonrpc: "2.0", method, params };
      if (id !== undefined) {
        payload.id = id;
        this.pending.set(id, { resolve, reject });
        setTimeout(() => {
          if (this.pending.has(id)) {
            this.pending.delete(id);
            reject(new Error(`Ruflo MCP call timed out: ${method}`));
          }
        }, 30000);
      }
      this.proc.stdin.write(JSON.stringify(payload) + "\n");
      if (!expectReply) resolve();
    });
  }

  async initialize() {
    if (this.ready) return;
    this.start();
    await this._send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "my-ai-ultron", version: "1.0" }
    });
    await this._send("notifications/initialized", {}, false);
    this.ready = true;
  }

  /** List all real ruflo MCP tools (agent_*, swarm_*, memory_*, hooks_*, config_*, ...). */
  async listTools() {
    await this.initialize();
    const res = await this._send("tools/list", {});
    return res.tools || [];
  }

  /** Call any real ruflo tool by name, e.g. callTool("memory_store", {...}). */
  async callTool(name, args = {}) {
    await this.initialize();
    const res = await this._send("tools/call", { name, arguments: args });
    return res;
  }

  stop() {
    if (this.proc) { this.proc.kill(); this.proc = null; this.ready = false; }
  }
}

module.exports = new RufloMCPBridge();
module.exports.RufloMCPBridge = RufloMCPBridge;
