/**
 * ============================================================================
 *  [7/10] TOOL CALL SCHEMA VALIDATOR
 *  Production tool-calling agents validate arguments against the tool's
 *  declared JSON schema BEFORE execution — LLMs regularly hallucinate a
 *  missing required field, send a string where a number was declared, or
 *  invent a parameter name that's close-but-wrong. Catching this before
 *  execution turns a confusing runtime error into a clear, immediately
 *  actionable message the agent can react to.
 * ============================================================================
 */
"use strict";

function typeMatches(value, expectedType) {
  switch (expectedType) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && !Number.isNaN(value);
    case "boolean": return typeof value === "boolean";
    case "object": return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array": return Array.isArray(value);
    default: return true; // unknown/unspecified type -> don't block on it
  }
}

/**
 * Validate `args` against a TOOL_DEFINITIONS-style entry:
 * { name, input_schema: { type: "object", properties: {...}, required: [...] } }
 */
function validateToolCall(toolDef, args) {
  const errors = [];
  if (!toolDef || !toolDef.input_schema) return { valid: true, errors: [] }; // nothing to validate against

  const schema = toolDef.input_schema;
  const props = schema.properties || {};
  const required = schema.required || [];

  for (const key of required) {
    if (args == null || !(key in args)) {
      errors.push(`Missing required parameter "${key}" for tool "${toolDef.name}".`);
    }
  }

  for (const [key, value] of Object.entries(args || {})) {
    const propSchema = props[key];
    if (!propSchema) {
      errors.push(`Unknown parameter "${key}" for tool "${toolDef.name}" (not in schema — check for a typo/hallucinated field name).`);
      continue;
    }
    if (propSchema.type && !typeMatches(value, propSchema.type)) {
      errors.push(`Parameter "${key}" for tool "${toolDef.name}" should be ${propSchema.type}, got ${Array.isArray(value) ? "array" : typeof value}.`);
    }
    if (propSchema.enum && !propSchema.enum.includes(value)) {
      errors.push(`Parameter "${key}" for tool "${toolDef.name}" must be one of [${propSchema.enum.join(", ")}], got "${value}".`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Convenience: build a lookup map once, then validate by tool name. */
function makeValidator(toolDefinitions) {
  const byName = new Map(toolDefinitions.map(t => [t.name, t]));
  return (toolName, args) => validateToolCall(byName.get(toolName), args);
}

module.exports = { validateToolCall, makeValidator };
