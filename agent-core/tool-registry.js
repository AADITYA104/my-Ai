"use strict";

const { evaluateToolCall, classifyTool } = require("./autonomy-policy");

class ToolRegistry {
  constructor() { this.tools = new Map(); }

  register(definition) {
    if (!definition || typeof definition.name !== "string" || typeof definition.execute !== "function") {
      throw new TypeError("Tool definition requires name and execute().");
    }
    this.tools.set(definition.name, Object.freeze({ ...definition }));
    return this;
  }

  has(name) { return this.tools.has(name); }
  get(name) { return this.tools.get(name) || null; }
  list() { return [...this.tools.values()].map(t => ({ name: t.name, kind: classifyTool(t.name), description: t.description || "" })); }

  async execute(name, input = {}, context = {}) {
    const tool = this.get(name);
    if (!tool) throw new Error(`Tool not registered: ${name}`);
    const policy = evaluateToolCall(name, input, context);
    if (!policy.allowed) {
      const error = new Error(policy.reason);
      error.code = policy.requiresApproval ? "APPROVAL_REQUIRED" : "TOOL_DENIED";
      error.policy = policy;
      throw error;
    }
    return tool.execute(input, { ...context, policy });
  }
}

module.exports = { ToolRegistry };
