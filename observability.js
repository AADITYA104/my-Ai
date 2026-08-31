/**
 * ============================================================================
 *  OBSERVABILITY — structured JSON logging + lightweight tracing spans
 *  Adapted (concept-level, original implementation) from ruflo-observability.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LOG_PATH = path.join(__dirname, "agent-memory", "observability.jsonl");
const activeSpans = new Map();

function logEvent(level, message, data = {}) {
  const entry = { ts: new Date().toISOString(), level, message, ...data };
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
  } catch (_) {}
  return entry;
}

function startSpan(name, parentId = null) {
  const id = crypto.randomBytes(6).toString("hex");
  activeSpans.set(id, { name, parentId, startedAt: Date.now() });
  return id;
}

function endSpan(id, extra = {}) {
  const span = activeSpans.get(id);
  if (!span) return null;
  const durationMs = Date.now() - span.startedAt;
  activeSpans.delete(id);
  return logEvent("trace", `span:${span.name}`, { spanId: id, parentId: span.parentId, durationMs, ...extra });
}

function getRecentEvents(limit = 50) {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, "utf-8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
}

module.exports = { logEvent, startSpan, endSpan, getRecentEvents };
