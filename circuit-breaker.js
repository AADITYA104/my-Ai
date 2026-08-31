/**
 * ============================================================================
 *  [2/10] CIRCUIT BREAKER
 *  Standard resilience pattern in every production agent/microservice
 *  system: stop hammering a dependency that's failing (Ollama down, Gemini
 *  rate-limited, a flaky tool) instead of retrying forever and burning
 *  time/tokens. States: CLOSED (normal) -> OPEN (fail fast) -> HALF_OPEN
 *  (test recovery) -> CLOSED.
 * ============================================================================
 */
"use strict";

class CircuitBreaker {
  constructor(name, { failureThreshold = 5, resetTimeoutMs = 30000, halfOpenMaxCalls = 1 } = {}) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.halfOpenMaxCalls = halfOpenMaxCalls;
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenCalls = 0;
  }

  _canAttempt() {
    if (this.state === "CLOSED") return true;
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = "HALF_OPEN";
        this.halfOpenCalls = 0;
        return true;
      }
      return false;
    }
    // HALF_OPEN: allow a limited number of probe calls through
    return this.halfOpenCalls < this.halfOpenMaxCalls;
  }

  _onSuccess() {
    this.failureCount = 0;
    this.state = "CLOSED";
    this.halfOpenCalls = 0;
  }

  _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === "HALF_OPEN") {
      this.state = "OPEN"; // probe failed -> back to OPEN immediately
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
    }
  }

  /** Wrap an async function call with circuit-breaker protection. */
  async call(fn) {
    if (!this._canAttempt()) {
      const retryInMs = Math.max(0, this.resetTimeoutMs - (Date.now() - this.lastFailureTime));
      throw new Error(`[CIRCUIT_OPEN:${this.name}] Failing fast — dependency unhealthy, retry in ~${Math.ceil(retryInMs / 1000)}s.`);
    }
    if (this.state === "HALF_OPEN") this.halfOpenCalls++;
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  getStatus() {
    return { name: this.name, state: this.state, failureCount: this.failureCount };
  }
}

// Shared registry so the same dependency (e.g. "ollama") reuses one breaker
// across every module that calls it, instead of each caller tracking its own.
const registry = new Map();
function getBreaker(name, options) {
  if (!registry.has(name)) registry.set(name, new CircuitBreaker(name, options));
  return registry.get(name);
}

function getAllStatuses() {
  return [...registry.values()].map(b => b.getStatus());
}

module.exports = { CircuitBreaker, getBreaker, getAllStatuses };
