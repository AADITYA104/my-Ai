/**
 * ============================================================================
 *  [5/10] OUTPUT GUARDRAILS
 *  Production agents validate what goes OUT, not just what comes in.
 *  Reuses ai-defence's PII/injection scanners on the output side (don't
 *  echo back a secret the user pasted earlier in the conversation) and adds
 *  format/schema checks for structured output, plus a length/truncation
 *  safety net so a runaway generation doesn't flood a downstream channel
 *  (Telegram, TTS, etc).
 * ============================================================================
 */
"use strict";

const aidefence = require("./ai-defence");

/** Check a final text response before it's returned/spoken/sent. */
function checkOutput(text, { maxLength = 8000 } = {}) {
  const issues = [];
  const str = String(text || "");

  const pii = aidefence.detectPII(str);
  if (pii.hasPII) issues.push(`Output contains possible PII: ${pii.findings.map(f => f.type).join(", ")}`);

  if (str.length > maxLength) issues.push(`Output exceeds max length (${str.length} > ${maxLength}) — likely a runaway generation.`);

  // Detect the model accidentally echoing back its own system prompt/instructions
  if (/you are (ultron|an ai assistant)\b.{0,50}(system prompt|instructions)/i.test(str)) {
    issues.push("Output appears to leak system-prompt content.");
  }

  return { safe: issues.length === 0, issues, sanitized: issues.length > 0 ? aidefence.redactPII(str).text.slice(0, maxLength) : str };
}

/** Validate a structured (JSON) output against a minimal required-keys schema
 * — catches the common "model returned almost-right JSON" failure mode. */
function validateStructuredOutput(rawText, requiredKeys = []) {
  let parsed;
  try {
    const match = String(rawText).match(/\{[\s\S]*\}/);
    if (!match) return { valid: false, error: "No JSON object found in output.", parsed: null };
    parsed = JSON.parse(match[0]);
  } catch (err) {
    return { valid: false, error: `Invalid JSON: ${err.message}`, parsed: null };
  }
  const missing = requiredKeys.filter(k => !(k in parsed));
  if (missing.length > 0) {
    return { valid: false, error: `Missing required keys: ${missing.join(", ")}`, parsed };
  }
  return { valid: true, error: null, parsed };
}

module.exports = { checkOutput, validateStructuredOutput };
