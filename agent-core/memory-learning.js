"use strict";

const crypto = require("crypto");

const DEFAULT_MAX_TEXT = 1200;
const DEFAULT_MAX_ITEMS = 8;
const SENSITIVE_KEY = /pass(word)?|secret|token|api[_-]?key|authorization|cookie|credential|private[_-]?key/i;

function clip(value, max = DEFAULT_MAX_TEXT) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeScalar(value) {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return clip(value, 400);
  return null;
}

function sanitizeObject(value, depth = 0) {
  if (depth > 2 || value == null) return null;
  if (typeof value !== "object") return safeScalar(value);
  if (Array.isArray(value)) return value.slice(0, DEFAULT_MAX_ITEMS).map(item => sanitizeObject(item, depth + 1));
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, DEFAULT_MAX_ITEMS)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (/content|stdout|stderr|body|output|result/i.test(key) && typeof item === "string") {
      output[key] = clip(item, 500);
    } else {
      const safe = sanitizeObject(item, depth + 1);
      if (safe !== null) output[key] = safe;
    }
  }
  return output;
}

function stableFingerprint(material) {
  return crypto.createHash("sha256").update(JSON.stringify(material)).digest("hex").slice(0, 40);
}

function meaningfulFailure(reason, state) {
  if (state === "failed") return true;
  return /verification failed|planner failed|executor|tool denied|approval|required|indeterminate|duplicate side effects|operation.*doubt/i.test(String(reason || ""));
}

class MemoryLearning {
  constructor(options = {}) {
    this.memory = options.memory || null;
    this.maxText = Number.isFinite(options.maxText) ? Math.max(200, options.maxText) : DEFAULT_MAX_TEXT;
    this.recentFingerprints = new Set();
  }

  fingerprint(snapshot) {
    const task = snapshot?.task || {};
    const plan = snapshot?.plan || {};
    const resultShape = Array.isArray(snapshot?.results)
      ? snapshot.results.map(entry => ({ step: entry?.step?.id, attempts: entry?.attempts, verification: entry?.verification?.pass }))
      : [];
    return stableFingerprint({
      goal: clip(task.goal || plan.goal, 500),
      state: task.state,
      reason: clip(snapshot?.reason, 500),
      steps: resultShape
    });
  }

  buildLesson(snapshot) {
    const task = snapshot?.task || {};
    const state = String(snapshot?.state || task.state || "unknown");
    const reason = clip(snapshot?.reason || "", this.maxText);
    const results = Array.isArray(snapshot?.results) ? snapshot.results : [];
    const steps = results.slice(-DEFAULT_MAX_ITEMS).map(entry => ({
      id: safeScalar(entry?.step?.id),
      description: clip(entry?.step?.description || "", 260),
      attempts: safeScalar(entry?.attempts),
      verified: entry?.verification?.pass === true,
      tool: safeScalar(entry?.step?.tool)
    }));
    const goal = clip(task.goal || snapshot?.plan?.goal || "", this.maxText);
    const fingerprint = this.fingerprint(snapshot);
    const success = state === "completed" && snapshot?.success === true;
    const tag = success ? "success-pattern" : "failure-pattern";
    const topic = `${success ? "Successful" : "Failed"} task pattern: ${goal.slice(0, 140)}`;
    const content = [
      `Outcome: ${state}.`,
      `Goal: ${goal}.`,
      reason ? `Reason: ${reason}.` : "Reason: final verification passed.",
      `Steps observed: ${steps.length}.`,
      steps.length ? `Step summary: ${JSON.stringify(steps)}.` : "No completed steps were recorded.",
      `Reusable lesson: ${success
        ? "The recorded plan and execution path reached verified completion; prefer this pattern when the task context is materially similar."
        : meaningfulFailure(reason, state)
          ? "The recorded path did not complete; inspect the failure reason and step pattern before repeating the same approach."
          : "The task stopped before a reusable strategy could be established."}`
    ].join(" ");
    return { fingerprint, topic, content: clip(content, this.maxText), tags: ["lesson", tag, "learned"], category: "task-learning", metadata: { taskId: safeScalar(task.id), sessionId: safeScalar(task.sessionId), state, fingerprint } };
  }

  alreadyStored(fingerprint) {
    if (this.recentFingerprints.has(fingerprint)) return true;
    const memories = Array.isArray(this.memory?.memories) ? this.memory.memories : [];
    return memories.some(entry => entry && (entry.fingerprint === fingerprint || entry.metadata?.fingerprint === fingerprint || entry.tags?.includes("learned") && entry.content?.includes(`fingerprint:${fingerprint}`)));
  }

  learn(snapshot) {
    if (!this.memory || typeof this.memory.store !== "function" || !snapshot) return { stored: false, reason: "memory unavailable" };
    const lesson = this.buildLesson(snapshot);
    if (this.alreadyStored(lesson.fingerprint)) return { stored: false, duplicate: true, fingerprint: lesson.fingerprint };
    try {
      const id = this.memory.store(lesson.topic, `${lesson.content} fingerprint:${lesson.fingerprint}`, lesson.tags, lesson.category);
      const stored = Array.isArray(this.memory.memories) ? this.memory.memories.find(entry => entry.id === id) : null;
      if (stored) stored.metadata = lesson.metadata;
      this.recentFingerprints.add(lesson.fingerprint);
      if (typeof this.memory.save === "function") this.memory.save();
      return { stored: true, id, fingerprint: lesson.fingerprint };
    } catch (error) {
      return { stored: false, reason: clip(error.message, 300), fingerprint: lesson.fingerprint };
    }
  }
}

function createMemoryLearning(options = {}) {
  return new MemoryLearning(options);
}

module.exports = { MemoryLearning, createMemoryLearning, stableFingerprint, sanitizeObject };
