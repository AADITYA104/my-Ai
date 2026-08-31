/**
 * ============================================================================
 *  [9/10] TOOL-CALL RATE LIMITER (token bucket)
 *  A well-known autonomous-agent failure mode is a runaway tool-calling
 *  loop — a confused agent calling the same (or different) tool hundreds of
 *  times in a minute, burning API cost/rate limits or hammering a real
 *  system (opening 50 browser tabs, sending 50 messages). A token-bucket
 *  limiter per tool name is the standard guard used in production agent
 *  runtimes to cap this without blocking normal usage.
 * ============================================================================
 */
"use strict";

class TokenBucket {
  constructor(capacity, refillPerSecond) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerSecond = refillPerSecond;
    this.lastRefill = Date.now();
  }

  _refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSecond);
    this.lastRefill = now;
  }

  tryConsume(n = 1) {
    this._refill();
    if (this.tokens >= n) { this.tokens -= n; return true; }
    return false;
  }
}

class ToolRateLimiter {
  constructor({ perToolCapacity = 10, perToolRefillPerSecond = 0.5, globalCapacity = 30, globalRefillPerSecond = 2 } = {}) {
    this.perToolCapacity = perToolCapacity;
    this.perToolRefillPerSecond = perToolRefillPerSecond;
    this.buckets = new Map(); // toolName -> TokenBucket
    this.globalBucket = new TokenBucket(globalCapacity, globalRefillPerSecond);
  }

  _bucketFor(toolName) {
    if (!this.buckets.has(toolName)) {
      this.buckets.set(toolName, new TokenBucket(this.perToolCapacity, this.perToolRefillPerSecond));
    }
    return this.buckets.get(toolName);
  }

  /** Returns { allowed: true } or { allowed: false, reason } — call before
   * every tool execution in the agent loop. */
  checkAndConsume(toolName) {
    if (!this.globalBucket.tryConsume(1)) {
      return { allowed: false, reason: `Global tool-call rate limit hit — the agent is calling tools too fast overall. Slow down.` };
    }
    const bucket = this._bucketFor(toolName);
    if (!bucket.tryConsume(1)) {
      return { allowed: false, reason: `Rate limit hit for tool "${toolName}" — it's been called too many times in a short window. This usually means the agent is stuck in a loop.` };
    }
    return { allowed: true };
  }
}

module.exports = { ToolRateLimiter, TokenBucket };
