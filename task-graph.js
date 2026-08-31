/**
 * ============================================================================
 *  [3/10] TASK GRAPH (DAG-based planning)
 *  Major agent frameworks (LangGraph, CrewAI) plan work as a dependency
 *  graph, not a flat ordered list — subtasks with no dependency on each
 *  other can run in parallel, and a subtask only starts once everything it
 *  depends on has actually finished. This wraps a plain array of
 *  {id, description, dependsOn:[ids]} subtasks into an executable graph.
 * ============================================================================
 */
"use strict";

class TaskGraph {
  constructor(subtasks) {
    // subtasks: [{ id, description, dependsOn: [id, id, ...] }]
    this.nodes = new Map(subtasks.map(t => [t.id, { ...t, status: "pending", result: null }]));
    this._validateNoCycles();
  }

  _validateNoCycles() {
    const visiting = new Set(), visited = new Set();
    const visit = (id, path = []) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`Task graph has a cycle: ${[...path, id].join(" -> ")}`);
      visiting.add(id);
      for (const dep of this.nodes.get(id)?.dependsOn || []) {
        if (!this.nodes.has(dep)) throw new Error(`Task ${id} depends on unknown task ${dep}`);
        visit(dep, [...path, id]);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of this.nodes.keys()) visit(id);
  }

  /** Tasks whose dependencies are all "done" and that haven't run yet — these
   * can all be dispatched in parallel right now. */
  getReadyTasks() {
    return [...this.nodes.values()].filter(t =>
      t.status === "pending" &&
      (t.dependsOn || []).every(dep => this.nodes.get(dep)?.status === "done")
    );
  }

  markRunning(id) { const t = this.nodes.get(id); if (t) t.status = "running"; }

  /**
   * [CONDITIONAL EDGES] Adapted from LangGraph's add_conditional_edges — a
   * task's own `route(result)` function (set when the task was constructed)
   * can dynamically SKIP nodes that turn out to be unnecessary based on the
   * actual result, instead of the graph being purely static dependencies
   * decided up-front. Returns the ids that got skipped, if any.
   */
  markDone(id, result) {
    const t = this.nodes.get(id);
    if (!t) return [];
    t.status = "done";
    t.result = result;
    if (typeof t.route === "function") {
      try {
        const skipIds = t.route(result) || [];
        for (const skipId of skipIds) {
          const skipNode = this.nodes.get(skipId);
          if (skipNode && skipNode.status === "pending") {
            skipNode.status = "done";
            skipNode.result = { skipped: true, reason: `Skipped by ${id}'s routing decision.` };
          }
        }
        return skipIds;
      } catch (_) { /* a broken route() shouldn't break execution */ }
    }
    return [];
  }

  markFailed(id, error) { const t = this.nodes.get(id); if (t) { t.status = "failed"; t.result = error; } }

  isComplete() {
    return [...this.nodes.values()].every(t => t.status === "done" || t.status === "failed");
  }

  hasFailures() {
    return [...this.nodes.values()].some(t => t.status === "failed");
  }

  /**
   * Execute the whole graph, running independent tasks concurrently (up to
   * maxConcurrency at once) and respecting dependency order. `runner(task)`
   * should return a Promise resolving to the task's result.
   */
  async executeAll(runner, { maxConcurrency = 3, stopOnFailure = true } = {}) {
    const inFlight = new Map();

    while (!this.isComplete()) {
      if (stopOnFailure && this.hasFailures()) break;

      const ready = this.getReadyTasks().filter(t => !inFlight.has(t.id));
      const capacity = maxConcurrency - inFlight.size;
      for (const task of ready.slice(0, Math.max(0, capacity))) {
        this.markRunning(task.id);
        const p = Promise.resolve()
          .then(() => runner(task))
          .then(result => { this.markDone(task.id, result); inFlight.delete(task.id); })
          .catch(err => { this.markFailed(task.id, err.message || String(err)); inFlight.delete(task.id); });
        inFlight.set(task.id, p);
      }

      if (inFlight.size === 0) {
        // Nothing ready and nothing running -> either done, all failed
        // upstream of remaining tasks, or a dependency was never satisfiable.
        break;
      }
      await Promise.race(inFlight.values());
    }

    // Drain any still-in-flight promises before returning.
    await Promise.allSettled(inFlight.values());
    return this.getSummary();
  }

  getSummary() {
    const all = [...this.nodes.values()];
    return {
      total: all.length,
      done: all.filter(t => t.status === "done").length,
      failed: all.filter(t => t.status === "failed").length,
      pending: all.filter(t => t.status === "pending").length,
      results: Object.fromEntries(all.map(t => [t.id, { status: t.status, result: t.result }]))
    };
  }
}

module.exports = { TaskGraph };
