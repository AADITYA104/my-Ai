# my-Ai 🤖

> **Production-Grade Autonomous Loop Agent Suite** featuring **12-Pillar Advanced Architecture**: Actor-Critic Verification, Distilled Skill Memory, RAG Vector Memory, Multi-Agent Collaboration, Session State Management, Native Tool Autonomy (Terminal, Subprocess Code, Playwright Browser), Telegram Bot Gateway, Background Cron Scheduler, and Docker Sandboxing.

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
│  3. RAG Knowledge Retrieval ──> Voyage AI Vector Store      │
│  4. Pre-Task Skill Match ──> agent-memory/skills/*.md       │
│  5. Multi-Step Actor ──> Native Tools (Terminal, Code, Web) │
│  6. Independent Critic ──> PASS / FAIL                      │
│  7. Skill Distillation ──> Compress winning recipe to .md   │
│  8. Loop Advance ──> Next subtask until goal fulfilled      │
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

## 🏛️ 12-Pillar Agent Architecture Status

| Pillar | Implementation | Status |
| :--- | :--- | :---: |
| **1. Memory & Context** | Flat disk memory (`memory.md`) + Vector memory with Voyage AI embeddings (`rag-memory.js`). | ✅ Complete |
| **2. Tool Use / Function Calling** | Native Anthropic JSON schema `tools` API + sandboxed terminal, code runner, and Playwright browser. | ✅ Complete |
| **3. RAG (Documents & PDFs)** | Semantic chunking with overlap + PDF/text parsing + cosine similarity search (`rag-memory.js`). | ✅ Complete |
| **4. Multi-Step Reasoning** | Self-bootstrapping planner + multi-step Actor + strict independent Critic verification loop. | ✅ Complete |
| **5. Multi-Agent System** | Specialist collaboration team: Architect, Researcher, Coder, and Security Auditor (`multi-agent-system.js`). | ✅ Complete |
| **6. Prompt Engineering** | Dynamic role-based system prompts, few-shot distilled skill injections, and structured output parsing. | ✅ Complete |
| **7. Streaming & Real-Time** | Throttled console progress streaming to Telegram bot gateway (`telegram-gateway.js`). | ✅ Complete |
| **8. State & Session Management** | Multi-turn user session tracking, history compression, and state persistence (`session-manager.js`). | ✅ Complete |
| **9. Guardrails & Safety** | `DESTRUCTIVE_PATTERNS` regex filter + human confirmation gate + `FREEZE_DIR` sandboxing + token caps. | ✅ Complete |
| **10. Evaluation & Monitoring** | Advisory skill library contradiction audit report (`skill-audit-report.md`) + cron JSONL run logs. | ✅ Complete |
| **11. Personalization** | Per-user profiles with language, verbosity, and coding style preferences (`session-manager.js`). | ✅ Complete |
| **12. Autonomous Capabilities** | Self-correcting loop until success + Hermes-style compound skill memory distillation. | ✅ Complete |

---

## 📁 Repository Suite

| File | Purpose |
| :--- | :--- |
| **[`AI-Agent-Loop-Engineering-Guide.md`](file:///c:/Users/devmu/Downloads/my%20Ai/AI-Agent-Loop-Engineering-Guide.md)** | Architectural deep-dive on Actor-Critic, Skill Distillation, RAG, and Safety. |
| **[`rag-memory.js`](file:///c:/Users/devmu/Downloads/my%20Ai/rag-memory.js)** | **RAG & Vector Memory**: Voyage AI embeddings, PDF/text ingestion, and semantic retrieval. |
| **[`multi-agent-system.js`](file:///c:/Users/devmu/Downloads/my%20Ai/multi-agent-system.js)** | **Multi-Agent Orchestration**: Architect, Researcher, Coder, and Security Auditor team pipeline. |
| **[`session-manager.js`](file:///c:/Users/devmu/Downloads/my%20Ai/session-manager.js)** | **State & Personalization**: Multi-turn sessions, context compression, and user profile management. |
| **[`autonomous-loop-agent-v5-native-tools.js`](file:///c:/Users/devmu/Downloads/my%20Ai/autonomous-loop-agent-v5-native-tools.js)** | **v5 (Flagship)**: Anthropic Native Tool Calling + RAG Vector Context + Skill Memory + Multi-Step Tool Loop. |
| **[`autonomous-loop-agent-v4-hardening.js`](file:///c:/Users/devmu/Downloads/my%20Ai/autonomous-loop-agent-v4-hardening.js)** | **v4**: Hardening layer with skill usage tracking and contradiction audit reports. |
| **[`autonomous-loop-agent-v3.js`](file:///c:/Users/devmu/Downloads/my%20Ai/autonomous-loop-agent-v3.js)** | **v3**: Tool Autonomy with `terminal_exec`, `code_exec`, and Playwright `browser_control`. |
| **[`autonomous-loop-agent-v2.js`](file:///c:/Users/devmu/Downloads/my%20Ai/autonomous-loop-agent-v2.js)** | **v2**: Distilled Skill Memory System (`agent-memory/skills/`). |
| **[`autonomous-loop-agent.js`](file:///c:/Users/devmu/Downloads/my%20Ai/autonomous-loop-agent.js)** | **v1**: Self-bootstrapping planner decomposing goals into verifiable subtasks. |
| **[`advanced-reasoning-agent.js`](file:///c:/Users/devmu/Downloads/my%20Ai/advanced-reasoning-agent.js)** | Foundational Actor-Critic critique loop. |
| **[`telegram-gateway.js`](file:///c:/Users/devmu/Downloads/my%20Ai/telegram-gateway.js)** | Telegram Bot Gateway with progress streaming, `/goal`, `/status`, `/skills`, and `/stop`. |
| **[`cron-scheduler.js`](file:///c:/Users/devmu/Downloads/my%20Ai/cron-scheduler.js)** | Headless recurring cron automation with JSONL run logging and Telegram alerts. |
| **[`Dockerfile`](file:///c:/Users/devmu/Downloads/my%20Ai/Dockerfile)** & **[`docker-compose.yml`](file:///c:/Users/devmu/Downloads/my%20Ai/docker-compose.yml)** | Fully containerized non-root sandboxed execution environment. |

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.com/AADITYA104/my-Ai.git
cd my-Ai
npm install
npx playwright install chromium
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export VOYAGE_API_KEY="pa-..."
export FREEZE_DIR="./workspace"
export TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
export ALLOWED_CHAT_IDS="123456789"
```

---

## 🛠️ Usage Examples

### 1. Ingest Documents into RAG Knowledge Base
```bash
node rag-memory.js ingest ./docs/spec.pdf
node rag-memory.js search "how does attendance tracking work"
```

### 2. Run Multi-Agent Collaboration Pipeline
```bash
npm run multi-agent "Build a token bucket rate limiter with Redis backend"
```

### 3. Run Autonomous Loop Agent with RAG & Tools (v5)
```bash
npm start "Analyze the uploaded spec and generate an implementation plan in PLAN.md"
```

### 4. Run Telegram Gateway
```bash
npm run gateway
```

---

## 📄 License

MIT © [AADITYA104](https://github.com/AADITYA104)
