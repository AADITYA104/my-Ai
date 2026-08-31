/**
 * ============================================================================
 *  MCP BRIDGE — generic multi-server MCP client
 *  Same proven stdio JSON-RPC pattern already verified twice this session
 *  (ruflo-bridge.js, ponytail-mcp), generalized so any number of local MCP
 *  servers can be registered and called through one interface instead of
 *  duplicating the spawn/JSON-RPC plumbing per server.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

class MCPServerConnection {
  constructor(name, command, args) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.proc = null;
    this.buf = "";
    this.pending = new Map();
    this.nextId = 1;
    this.ready = false;
  }

  start() {
    if (this.proc) return;
    this.proc = spawn(this.command, this.args, { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stdout.on("data", (d) => this._onData(d));
    this.proc.stderr.on("data", () => {}); // most MCP servers log startup info to stderr
    this.proc.on("exit", () => { this.proc = null; this.ready = false; });
    this.proc.on("error", (err) => { this.proc = null; this.ready = false; console.warn(`[MCP:${this.name}] spawn error:`, err.message); });
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
        if (msg.error) reject(new Error(msg.error.message || `MCP error from ${this.name}`));
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
          if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`MCP call to ${this.name} timed out: ${method}`)); }
        }, 30000);
      }
      this.proc.stdin.write(JSON.stringify(payload) + "\n");
      if (!expectReply) resolve();
    });
  }

  async initialize() {
    if (this.ready) return;
    this.start();
    await this._send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "my-ai-ultron", version: "1.0" } });
    await this._send("notifications/initialized", {}, false);
    this.ready = true;
  }

  async listTools() {
    await this.initialize();
    const res = await this._send("tools/list", {});
    return res.tools || [];
  }

  async callTool(name, args = {}) {
    await this.initialize();
    return this._send("tools/call", { name, arguments: args });
  }

  stop() {
    if (this.proc) { this.proc.kill(); this.proc = null; this.ready = false; }
  }
}

class MCPBridge {
  constructor() {
    this.servers = new Map();
  }

  /** Register a server by name + spawn command. Doesn't start it yet (lazy). */
  register(name, command, args) {
    this.servers.set(name, new MCPServerConnection(name, command, args));
  }

  /** Auto-register the servers bundled with this project, if their entry
   * point exists (built or TS source run via a runner). Safe to call even
   * if none are set up yet — isConfigured()/listTools() will just report
   * nothing available. */
  autoRegisterBundled() {
    const root = __dirname;
    const candidates = [
      { name: "sequentialthinking", dist: path.join(root, "mcp-servers", "sequentialthinking", "dist", "index.js") },
      { name: "memory", dist: path.join(root, "mcp-servers", "memory", "dist", "index.js") },
      { name: "ruflo", envPath: "RUFLO_MCP_PATH" },
      { name: "ponytail", dist: path.join(root, "ponytail-mcp", "index.js") }
    ];
    for (const c of candidates) {
      const entry = c.envPath ? process.env[c.envPath] : c.dist;
      if (entry && fs.existsSync(entry)) this.register(c.name, "node", [entry]);
    }
  }

  isConfigured(name) {
    return this.servers.has(name);
  }

  listServers() {
    return [...this.servers.keys()];
  }

  async listTools(name) {
    const server = this.servers.get(name);
    if (!server) throw new Error(`MCP server "${name}" is not registered. Registered: ${this.listServers().join(", ") || "(none)"}`);
    return server.listTools();
  }

  async callTool(serverName, toolName, args) {
    const server = this.servers.get(serverName);
    if (!server) throw new Error(`MCP server "${serverName}" is not registered. Registered: ${this.listServers().join(", ") || "(none)"}`);
    return server.callTool(toolName, args);
  }

  stopAll() {
    for (const server of this.servers.values()) server.stop();
  }
}

const instance = new MCPBridge();
instance.autoRegisterBundled();
module.exports = instance;
module.exports.MCPBridge = MCPBridge;
