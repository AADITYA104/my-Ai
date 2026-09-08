"use strict";

const { evaluateToolCall, classifyTool } = require("./autonomy-policy");

function validateInputSchema(name, input, schema) {
  if (!schema) return { valid: true };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, reason: `Invalid input for ${name}: expected an object.` };
  }
  for (const [field, rule] of Object.entries(schema)) {
    const value = input[field];
    if (rule.required && (value === undefined || value === null || (rule.type === "string" && !String(value).trim()))) {
      return { valid: false, reason: `Invalid input for ${name}: missing ${field}.` };
    }
    if (value === undefined || value === null) continue;
    const type = Array.isArray(value) ? "array" : typeof value;
    if (rule.type && type !== rule.type) {
      return { valid: false, reason: `Invalid input for ${name}: ${field} must be ${rule.type}.` };
    }
    if (rule.enum && !rule.enum.includes(value)) {
      return { valid: false, reason: `Invalid input for ${name}: ${field} has an unsupported value.` };
    }
  }
  return { valid: true };
}

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
  list() {
    return [...this.tools.values()].map(t => ({
      name: t.name,
      kind: classifyTool(t.name),
      description: t.description || "",
      inputSchema: t.inputSchema || null
    }));
  }

  async execute(name, input = {}, context = {}) {
    const tool = this.get(name);
    if (!tool) throw new Error(`Tool not registered: ${name}`);
    const inputCheck = validateInputSchema(name, input, tool.inputSchema);
    if (!inputCheck.valid) {
      const error = new Error(inputCheck.reason);
      error.code = "INVALID_TOOL_INPUT";
      throw error;
    }
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

module.exports = { ToolRegistry, validateInputSchema };
