"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function safeKey(value) {
  const raw = String(value || "default");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
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

  lockPathFor(taskId, sessionId = "default_session") {
    return `${this.pathFor(taskId, sessionId)}.lock`;
  }

  withLock(taskId, sessionId, fn) {
    const lockPath = this.lockPathFor(taskId, sessionId);
    let fd = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        fd = fs.openSync(lockPath, "wx", 0o600);
        break;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        sleepSync(10);
      }
    }
    if (fd === null) throw new Error("Task store lock timeout.");
    try {
      return fn();
    } finally {
      try { fs.closeSync(fd); } catch (_) {}
      try { fs.unlinkSync(lockPath); } catch (_) {}
    }
  }

  save(task, sessionId = "default_session", snapshot = {}) {
    if (!task || !task.id) throw new Error("A valid task is required.");
    return this.withLock(task.id, sessionId, () => {
      const target = this.pathFor(task.id, sessionId);
      const current = this.load(task.id, sessionId);
      const tmp = `${target}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
      const record = {
        version: 2,
        sessionId: String(sessionId),
        task,
        plan: snapshot.plan || null,
        results: Array.isArray(snapshot.results) ? snapshot.results : [],
        operations: snapshot.operations && typeof snapshot.operations === "object" ? snapshot.operations : current?.operations || {},
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
    });
  }

  load(taskId, sessionId = "default_session") {
    const target = this.pathFor(taskId, sessionId);
    try {
      const record = JSON.parse(fs.readFileSync(target, "utf8"));
      if (!record || ![1, 2].includes(record.version) || !record.task || record.task.id !== taskId || record.sessionId !== String(sessionId)) {
        throw new Error("Invalid persisted task record.");
      }
      if (!record.operations || typeof record.operations !== "object") record.operations = {};
      return record;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  claimOperation(taskId, sessionId = "default_session", operationId, metadata = {}) {
    if (!operationId) throw new Error("Operation id is required.");
    return this.withLock(taskId, sessionId, () => {
      const record = this.load(taskId, sessionId);
      if (!record) throw new Error(`Persisted task not found: ${taskId}`);
      const existing = record.operations[operationId];
      if (existing) return { ...existing };
      record.operations[operationId] = {
        state: "started",
        startedAt: new Date().toISOString(),
        executionId: metadata.executionId || operationId
      };
      this.writeRecord(record, taskId, sessionId);
      return { ...record.operations[operationId] };
    });
  }

  completeOperation(taskId, sessionId = "default_session", operationId, result) {
    if (!operationId) throw new Error("Operation id is required.");
    return this.withLock(taskId, sessionId, () => {
      const record = this.load(taskId, sessionId);
      if (!record) throw new Error(`Persisted task not found: ${taskId}`);
      const existing = record.operations[operationId];
      if (existing && existing.state === "completed") return { ...existing };
      record.operations[operationId] = {
        state: "completed",
        startedAt: existing?.startedAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
        executionId: existing?.executionId || operationId,
        result
      };
      this.writeRecord(record, taskId, sessionId);
      return { ...record.operations[operationId] };
    });
  }

  writeRecord(record, taskId, sessionId) {
    const target = this.pathFor(taskId, sessionId);
    const tmp = `${target}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
    try {
      record.version = 2;
      fs.writeFileSync(tmp, JSON.stringify(record, null, 2), { encoding: "utf8", mode: 0o600 });
      fs.renameSync(tmp, target);
    } catch (error) {
      try { fs.unlinkSync(tmp); } catch (_) {}
      throw error;
    }
  }

  remove(taskId, sessionId = "default_session") {
    const target = this.pathFor(taskId, sessionId);
    try { fs.unlinkSync(target); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try { fs.unlinkSync(this.lockPathFor(taskId, sessionId)); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

module.exports = { TaskStore, safeKey };