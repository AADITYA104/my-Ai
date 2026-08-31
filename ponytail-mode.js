/**
 * ============================================================================
 *  PONYTAIL MODE — lazy-senior-dev intensity state management
 *  Ported directly (not just concept-adapted) from ponytail's
 *  hooks/ponytail-config.js — this logic is pure Node fs/path/os with zero
 *  Claude-Code-specific dependency, so it runs unchanged here. Trimmed the
 *  Claude-Code-only bits (statusline hide/quiet-startup, ~/.claude dir).
 *  Default mode resolution order: env var -> local config file -> "full".
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_MODE = "full";
const RUNTIME_MODES = ["off", "lite", "full", "ultra"];
const CONFIG_PATH = path.join(__dirname, "agent-memory", "ponytail-mode.json");

function normalizeMode(mode) {
  if (typeof mode !== "string") return null;
  const normalized = mode.trim().toLowerCase();
  return RUNTIME_MODES.includes(normalized) ? normalized : null;
}

/** "stop ponytail" / "normal mode" as a standalone message turns it off —
 * matching anywhere mid-sentence would false-trigger on ordinary requests
 * like "add a normal mode toggle". */
function isDeactivationCommand(text) {
  const t = String(text || "").trim().toLowerCase().replace(/[.!?\s]+$/, "");
  return t === "stop ponytail" || t === "normal mode";
}

/** Parse a "/ponytail lite|full|ultra|off" style command. Returns the mode,
 * or null if the text isn't a ponytail mode-switch command. */
function parseModeCommand(text) {
  const t = String(text || "").trim().toLowerCase();
  const m = t.match(/^[/@$]ponytail\s*(\w+)?$/);
  if (m) return normalizeMode(m[1]) || "full"; // "/ponytail" alone -> full (the documented default)
  if (isDeactivationCommand(text)) return "off";
  return null;
}

function getCurrentMode() {
  const envMode = process.env.PONYTAIL_DEFAULT_MODE;
  if (envMode && normalizeMode(envMode)) return normalizeMode(envMode);
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8").replace(/^\uFEFF/, ""));
    if (normalizeMode(config.mode)) return normalizeMode(config.mode);
  } catch (_) {}
  return DEFAULT_MODE;
}

function setMode(mode) {
  const normalized = normalizeMode(mode);
  if (!normalized) return null;
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ mode: normalized, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  } catch (_) {}
  return normalized;
}

module.exports = { DEFAULT_MODE, RUNTIME_MODES, normalizeMode, isDeactivationCommand, parseModeCommand, getCurrentMode, setMode };
