/**
 * ============================================================================
 *  AI DEFENCE — heuristic prompt-injection & PII detection
 *  Adapted (concept-level, original implementation) from ruflo-aidefence's
 *  "3-gate pattern" for a plain Node.js runtime (no Claude-Code / MCP deps):
 *    Gate 1 (pre-storage PII)   -> call before persisting any text to memory
 *    Gate 2 (sanitization)      -> redactPII() for logs/exports
 *    Gate 3 (prompt-injection)  -> call before re-injecting retrieved/external
 *                                  text back into an LLM prompt
 * ============================================================================
 */
"use strict";

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all|any|the)?\s*(previous|prior|above)\s*instructions?/i,
  /disregard\s+(the|your|all)?\s*(system prompt|instructions|rules)/i,
  /forget\s+(every|all|the)\s*(rule|instruction)/i,
  /you are now\s+/i,
  /act as\s+(?!an assistant\b)/i,
  /pretend to be\s+/i,
  /\b(DAN mode|developer mode|god mode|root mode|jailbreak)\b/i,
  /reveal\s+(your|the)\s*(system prompt|instructions)/i,
  /disable\s+(your\s+)?(safety|guardrails|filters)/i,
  /new\s+instructions?\s*:/i
];

const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}\b/g,
  apiKey: /\b(sk-[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9_-]{30,}|ghp_[a-zA-Z0-9]{30,}|AKIA[0-9A-Z]{16})\b/g
};

const LOADER_HIJACK_ENV_DENYLIST = [
  "LD_PRELOAD", "LD_LIBRARY_PATH", "LD_AUDIT",
  "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH", "DYLD_FALLBACK_LIBRARY_PATH", "DYLD_FORCE_FLAT_NAMESPACE",
  "NODE_OPTIONS", "NODE_PATH"
];

function scanForInjection(text) {
  if (!text) return { safe: true, threats: [] };
  const str = String(text);
  const threats = [];
  for (const re of PROMPT_INJECTION_PATTERNS) {
    const m = str.match(re);
    if (m) threats.push({ type: "prompt_injection", match: m[0] });
  }
  return { safe: threats.length === 0, threats };
}

function detectPII(text) {
  if (!text) return { hasPII: false, findings: [] };
  const str = String(text);
  const findings = [];
  for (const [type, re] of Object.entries(PII_PATTERNS)) {
    re.lastIndex = 0;
    const matches = str.match(re);
    if (matches) findings.push({ type, count: matches.length });
  }
  return { hasPII: findings.length > 0, findings };
}

function redactPII(text) {
  if (!text) return { text, redacted: false };
  let out = String(text);
  let redacted = false;
  const replace = (re, token) => {
    re.lastIndex = 0;
    if (re.test(out)) { redacted = true; re.lastIndex = 0; out = out.replace(re, token); }
  };
  replace(PII_PATTERNS.email, "[REDACTED_EMAIL]");
  replace(PII_PATTERNS.ssn, "[REDACTED_SSN]");
  replace(PII_PATTERNS.apiKey, "[REDACTED_API_KEY]");
  replace(PII_PATTERNS.creditCard, "[REDACTED_CARD]");
  return { text: out, redacted };
}

function validateEnv(envObj) {
  const violations = Object.keys(envObj || {}).filter(k => LOADER_HIJACK_ENV_DENYLIST.includes(k));
  return { safe: violations.length === 0, violations };
}

function scanCommandForEnvHijack(command) {
  if (!command) return { safe: true, violations: [] };
  const violations = LOADER_HIJACK_ENV_DENYLIST.filter(v =>
    new RegExp(`(^|[\\s;&|])${v}\\s*=`, "i").test(String(command))
  );
  return { safe: violations.length === 0, violations };
}

module.exports = {
  scanForInjection,
  detectPII,
  redactPII,
  validateEnv,
  scanCommandForEnvHijack,
  LOADER_HIJACK_ENV_DENYLIST
};
