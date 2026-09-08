"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function safeKey(value) {
  const raw = String(value || "default");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

class TaskStore {
  constructor(options = {}) {
    this.root = path.resolve(options.root || path.join(__dirname, "..", "agent-memory", "tasks"));
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }

  pathFor(taskId, sessionId = "default_session") {
    if (!taskId) throw new Error("Task id is required.");
    return path.join(this.root, `${safeKey(sessionId)}-${safeKey(taskId)}.json`);
  }

  save(task, sessionId = "default_session", snapshot = {}) {
    if (!task || !task.id) throw new Error("A valid task is required.");
    const target = this.pathFor(task.id, sessionId);
    const tmp = `${target}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
    const record = {
      version: 1,
      sessionId: String(sessionId),
      task,
      plan: snapshot.plan || null,
      results: Array.isArray(snapshot.results) ? snapshot.results : [],
      reason: snapshot.reason || null,
      finalVerification: snapshot.finalVerification || null,
      savedAt: new Date().toISOString()
    };
    try {
      fs.writeFileSync(tmp, JSON.stringify(record, null, 2), { encoding: "utf8", mode: 0o600 });
      fs.renameSync(tmp, target);
    } catch (error) {
      try { fs.unlinkSync(tmp); } catch (_) {}
      throw error;
    }
    return record;
  }

  load(taskId, sessionId = "default_session") {
    const target = this.pathFor(taskId, sessionId);
    try {
      const record = JSON.parse(fs.readFileSync(target, "utf8"));
      if (!record || record.version !== 1 || !record.task || record.task.id !== taskId || record.sessionId !== String(sessionId)) {
        throw new Error("Invalid persisted task record.");
      }
      return record;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  remove(taskId, sessionId = "default_session") {
    const target = this.pathFor(taskId, sessionId);
    try { fs.unlinkSync(target); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

module.exports = { TaskStore, safeKey };
