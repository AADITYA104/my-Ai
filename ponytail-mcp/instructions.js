// Pure instruction selection for the Ponytail MCP server. No MCP/SDK imports,
// so this stays unit-testable on its own.
// NOTE: re-wired to this project's own ponytail-mode.js / ponytail-instructions.js
// (ported at the project root) instead of a separate hooks/ copy — one
// implementation, not two copies that could drift apart.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getPonytailInstructions } = require("../ponytail-instructions.js");
const { getCurrentMode, normalizeMode } = require("../ponytail-mode.js");

// The three intensities the server offers. "off" has no instructions to serve.
export const MODES = ["lite", "full", "ultra"];

// Resolve a requested mode to a runtime intensity. Unknown, empty, or "off"
// falls back to the configured default, then to "full".
// ponytail: keep the surface to these three; "off"/"review" aren't served here.
export function resolveMode(requested) {
  const asked = normalizeMode(requested);
  if (asked && asked !== "off") return asked;

  const fallback = normalizeMode(getCurrentMode());
  return fallback && fallback !== "off" ? fallback : "full";
}

export function buildInstructions(requested) {
  return getPonytailInstructions(resolveMode(requested));
}
