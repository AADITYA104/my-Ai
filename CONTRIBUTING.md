# Contributing to Ultron 2026 🤖

Thank you for your interest in contributing to **Ultron**, the 2026 Sovereign Autonomous AI Assistant and Multi-Agent Omni-Engine.

---

## 🏛️ Development Philosophy & Core Rules

1. **Ponytail Root-Cause Philosophy**:
   - Always find the true root cause before editing code.
   - Prefer minimal, high-leverage diffs over large rewrites.
   - Never remove unrelated code, comments, or docstrings.
2. **Zero-Crash Guardrails**:
   - All file modifications must pass through `self-healing-watchdog.js`.
   - Never bypass canonical path checks or destructive command filters.
3. **Single Source of Truth**:
   - State and progress must be transacted through `agent-memory/task-state.json`.
4. **Test-First Verification**:
   - Any new feature or bug fix must be covered by assertions in `tests/agent-reliability.test.js` or `tests/audit.test.js`.

---

## 🛠️ Local Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/AADITYA104/my-Ai.git
cd my-Ai

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env

# 4. Run automated test suites
node tests/audit.test.js
node tests/agent-reliability.test.js
node verify_blueprint_system.js

# 5. Start the Web & Holographic HUD Server
npm start
```

---

## 🧪 Testing Checklist

Before submitting a Pull Request, verify:
- [ ] `node tests/audit.test.js` reports `ZERO ISSUES FOUND`.
- [ ] `node tests/agent-reliability.test.js` passes 15/15 tests.
- [ ] `node verify_blueprint_system.js` passes 8/8 checkpoints.
- [ ] No API keys, credentials, or `.env` files are staged for commit.
