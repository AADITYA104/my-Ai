# AI Agent Loop Engineering Guide 🧠

A production-grade architectural guide for building **Autonomous Loop Agents** that plan, execute, verify, remember, and continuously improve through skill distillation and sandboxed tool autonomy.

---

## 🏗️ Architectural Overview

```
┌─────────────────────────────────────────────────────────────┐
│                 INTERFACES & TRIGGERS                       │
│     Telegram Gateway (/goal)   │   Cron Scheduler (0 8 * * *)│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│            AUTONOMOUS LOOP AGENT CORE (Brain)               │
│                                                             │
│  1. Bootstrap Planner ──> plan.json (Atomic subtasks)       │
│  2. Disk Memory Context ──> memory.md & progress.json       │
│  3. Pre-Task Skill Match ──> agent-memory/skills/*.md       │
│  4. Multi-Step Actor ──> Tools (Terminal, Code, Browser)    │
│  5. Independent Critic ──> PASS / FAIL                      │
│  6. Skill Distillation ──> Compress winning recipe to .md   │
│  7. Loop Advance ──> Next subtask until goal fulfilled      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     SAFETY & ISOLATION                      │
│  • Destructive Command Guard (rm -rf, DROP TABLE, sudo)     │
│  • FREEZE_DIR Filesystem Scoping & Non-Root Execution       │
│  • Token Budgeting & Circuit Breakers                       │
│  • Telegram ALLOWED_CHAT_IDS Gate                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📈 System Evolution: v1 through v5

| Version | Core Capability | Key Breakthrough |
| :--- | :--- | :--- |
| **`advanced-reasoning-agent.js`** | Actor-Critic Foundation | Verifiable multi-turn QA loop without hallucinated success. |
| **`autonomous-loop-agent.js` (v1)** | Self-Bootstrapping Planner | Goal decomposition into verifiable subtasks on disk (`plan.json`). |
| **`autonomous-loop-agent-v2.js`** | Skill Memory System | Distills passes into reusable markdown recipes (`agent-memory/skills/`). |
| **`autonomous-loop-agent-v3.js`** | Tool Autonomy & Safety | Real shell execution, code runner, and Playwright browser control. |
| **`autonomous-loop-agent-v4-hardening.js`**| Hardening & Skill Pruning | Usage tracking, contradiction audit reports, and stop cancellation. |
| **`autonomous-loop-agent-v5-native-tools.js`**| Native Tool Calling | Anthropic JSON Schema `tools` API + multi-step subtask tool loops. |

---

## 🧩 1. The Skill Memory System

### Why Traditional RAG Falls Short for Agent Skills
Raw trajectory dumps and multi-thousand token chat logs pollute context windows and cause hallucination. Our Skill Memory System employs **Distilled Compression**:

1. **Pre-Execution Match**:
   - Reads existing `.md` files in `agent-memory/skills/`.
   - Sends only titles and *When to Use* descriptions to LLM (fast, token-efficient).
   - Injects the single most relevant skill directly into the Actor prompt.
2. **Post-Pass Distillation**:
   - Once the subtask is verified by the Critic, distills:
     - `# Title`
     - `## When to use`
     - `## Steps`
     - `## Gotchas`
   - Saves to `agent-memory/skills/<slug>.md`.
3. **Audit & Pruning (`v4`)**:
   - Identifies stale skills (unused 30+ days).
   - Runs LLM contradiction checks across conflicting instructions.
   - Generates advisory reports without destructive auto-deletion.

---

## 🛡️ 2. Production Safety & Sandboxing

1. **Destructive Command Guard**:
   Regex pattern blocklist traps high-risk commands (`rm -rf`, `mkfs`, `sudo`, `DROP TABLE`, `git push --force`, fork bombs). Requires explicit human confirmation.
2. **Path Scoping (`FREEZE_DIR`)**:
   Constrains file writes, code execution, and screenshots within `./workspace` or container boundaries.
3. **Docker Non-Root Isolation**:
   Containerized with `agentuser` and system libraries for Chromium, strictly disallowing host modification.
4. **Token Budget & Circuit Breakers**:
   Hard cap on cumulative tokens per run (`CONFIG.MAX_TOKENS_TOTAL`) and repeated identical tool invocations (`CONFIG.MAX_TOOL_RETRIES`).

---

## 📲 3. Gateways & Automation

### Telegram Gateway (`telegram-gateway.js`)
- Commands: `/goal`, `/status`, `/skills`, `/stop`.
- Live console log streaming with throttle windows (4s / 8 lines) to prevent Telegram rate-limiting.
- Strict `ALLOWED_CHAT_IDS` authorization filtering.
- Non-blocking `/stop` cancellation checks.

### Cron Scheduler (`cron-scheduler.js`)
- Runs headless recurring tasks (e.g. daily news scraping, market intelligence).
- Appends execution metrics to `agent-memory/cron-run-log.jsonl`.
- Sends instant Telegram alert reports upon job completion or failure.

---

## 🚀 Running the Full Stack with Docker

```bash
# 1. Setup environment
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, and ALLOWED_CHAT_IDS

# 2. Build & Launch in Background
docker compose up -d

# 3. View Logs
docker compose logs -f agent-gateway

# 4. Run On-Demand Skill Audit
docker compose run --rm agent-audit
```
