<div align="center">

# 🤖 ULTRON // Sovereign Autonomous AI Core
### *Enterprise-Grade Multi-Agent Omni-Engine & 717 Master Skills Registry*

[![CI Build](https://img.shields.io/badge/CI-Passing%20(15%2F15)-brightgreen.svg?style=for-the-badge&logo=githubactions)](https://github.com/AADITYA104/my-Ai)
[![Architecture](https://img.shields.io/badge/Architecture-2026%20Omni--Engine-cyan.svg?style=for-the-badge)](https://github.com/AADITYA104/my-Ai)
[![Skills Registry](https://img.shields.io/badge/Skills-717%20Master%20Skills-blueviolet.svg?style=for-the-badge)](https://github.com/AADITYA104/my-Ai)
[![Node Version](https://img.shields.io/badge/Node-20%2B-blue.svg?style=for-the-badge&logo=nodedotjs)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-orange.svg?style=for-the-badge)](LICENSE)

---

**Ultron** is a production-hardened, multi-agent autonomous engineering system. It combines dual-engine cloud/local routing, AST-aware RAG vector search, self-healing rollback guardrails, and persistent multi-session continuity.

[Features](#-key-capabilities) • [Architecture](#-system-architecture) • [Skills Registry](#-717-master-skills-catalog) • [Quick Start](#-quick-start) • [Verification & Testing](#-testing--reliability-gates)

</div>

---

## 🏛️ System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                 ULTRON 2026 OMNI-ENGINE                                   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│  [INTERFACES & GATEWAYS]                                                                 │
│  • 3D WebGL Holographic HUD (Hologram Orb + Speech Visualizer + Terminal Stream)        │
│  • Telegram Sovereign Controller (Per-Chat Isolated Sessions + Live Stream + Telemetry)  │
│  • Headless Time-Driven Cron Scheduler (PID Mutex Lock + Dead-Letter Failure Queue)      │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│  [COGNITIVE ORCHESTRATION & ROUTING]                                                     │
│  • Dynamic Task Classifier (Coding, Research, File Ops, Creative, Security Audit)        │
│  • Dual-Engine Cascade: 0-Load Fast Cloud (Gemini 3.5) <─> Warm Local Sandbox (Qwen/Ollama)│
│  • Reflexion Swarm: Actor -> Skeptical Critic -> Polisher (Typed JSON Handoff Contracts)  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│  [AUTONOMOUS LOOP ENGINE (v7 Free)]                                                      │
│  • Sliding-Window Context Compression (<300 tokens after 5 tool steps)                   │
│  • Top-of-Turn Goal & Subtask Re-Injection (Anti-Drift Engine)                           │
│  • 2-Attempt Same-Error Circuit Breaker + Rapid Root-Cause Analysis (RCA)               │
│  • Single Source of Truth Task State (agent-memory/task-state.json)                      │
│  • Post-Action File Read-Back & Checksum Integrity Verification                          │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│  [RAG & HYBRID KNOWLEDGE VAULT]                                                          │
│  • AST-Aware Function/Class Semantic Code Chunking                                       │
│  • BM25 Term Saturation + Vector Cosine Hybrid Re-ranking                                │
│  • Dynamic File-Hash SHA-256 Watcher (Automatic Re-indexing on workspace modifications)  │
│  • Memory Snapshotting & 1-Click Rollback Engine                                         │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│  [SECURITY, GUARDRAILS & SANDBOXING]                                                     │
│  • Canonical Path Resolution (Anti-Symlink & Sandbox Escape Elimination)                 │
│  • Destructive Command Deny-Matrix (Linux, PowerShell, CMD dangerous verbs blocked)     │
│  • Stream-Level Real-Time Secrets & Token Redactor                                       │
│  • Persistent Playwright Browser Session + Windows Desktop OS UIAutomation Bridge       │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Capabilities

### 1. 🧠 Autonomous Execution Loop (v7 Free)
- **Zero Context Drift**: Injects master goal and active subtask at the top of every turn and compresses older history into rolling digests.
- **Circuit Breakers**: Detects repeated errors (threshold: 2) and interrupts execution before wasting token budgets.
- **Post-Action Verification**: Immediately reads back written files to confirm bytes $>0$ and checksum integrity.
- **Workspace Mutex Lock**: Cross-process lock (`.workspace.lock`) prevents simultaneous file collisions between Telegram, CLI, and Cron.

### 2. 🛡️ Self-Healing Watchdog & Security Guardrails
- **Canonical Realpath Traversal Guard**: Prevents sandbox escape via symlinks or `..` path traversals.
- **Destructive Command Deny-Matrix**: Proactively blocks `Remove-Item -Recurse`, `del /s /q`, `find -delete`, `format`, `reg delete`, `rm -rf /`, and fork bombs.
- **Real-Time Stream Redactor**: Automatically scrubs API keys (`AIzaSy...`, `sk-...`, `ghp_...`) from terminal logs and mobile chats.

### 3. 🧩 RAG & Memory Engineering
- **AST-Aware Chunking**: Intelligently breaks code at function, class, and export boundaries.
- **BM25 + Vector Cosine Hybrid Search**: High-precision retrieval combining keyword inverse document frequency (IDF) with semantic similarity.
- **File-Hash Auto Re-indexing**: Automatically tracks SHA-256 hashes of workspace files and re-indexes upon modification.
- **Git-Style Memory Versioning**: Automatic snapshotting of `memory.md` into `.snapshots/` with instant rollback.

### 4. 🌐 Automation & OS Bridges
- **Persistent Browser Agent (`browser-agent.js`)**: Playwright persistent context (`launchPersistentContext`) with saved cookies, human-in-the-loop Captcha gate, and externalized CSS selectors (`browser_selectors.json`).
- **Windows OS Automation Bridge (`os-automation-bridge.js`)**: Safe element interaction, process management, screenshot capture, and keyboard keystroke dispatch.

---

## 📊 717 Master Skills Catalog

Ultron indexes **717 production skills** across 9 specialized categories:

| Category | Skills Count | Focus Area |
|---|:---:|---|
| 🐝 **Multi-Agent Swarm** | **234** | Orchestration, handoffs, consensus, and multi-agent coordination. |
| 🤖 **General Autonomous Ops** | **165** | System management, automation pipelines, and CLI controllers. |
| 💻 **Coding & Architecture** | **143** | TypeScript, Python, C++, Rust, backend patterns, and system design. |
| 🎨 **UI/UX & Frontend Design** | **106** | UI/UX Pro Max, Tailwind, Shadcn, design tokens, and branding. |
| 🛡️ **Security & Guardrails** | **25** | CSO mode, penetration auditing, vulnerability fixes, and sanitization. |
| 🧠 **Memory & RAG Systems** | **19** | AgentDB, graph retrieval, vector indexing, and memory rotation. |
| 🧪 **Testing & QA Verification** | **16** | TDD London School, E2E browser tests, and latency profiling. |
| 🧊 **Generative 3D Modeling** | **6** | Tencent Hunyuan3D-2 text-to-3D, image-to-3D, and Blender pipelines. |
| ⚡ **Animation & Motion Design** | **3** | Framer Motion, Motion One, layout transitions, and spring physics. |

---

## ⚡ Quick Start

### 1. Prerequisites
- Node.js 20+
- Git

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/AADITYA104/my-Ai.git
cd my-Ai

# Install dependencies
npm install

# Install Playwright browser dependencies (for web automation)
npx playwright install chromium
```

### 3. Configure Environment
Create `.env` from `.env.example`:
```ini
# Google Gemini (Zero Laptop RAM Load & Cloud Speed)
GOOGLE_API_KEY=your_gemini_api_key

# Local Model (Optional - Ollama Qwen)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=ultron-core

# Telegram Mobile Controller (Optional)
TELEGRAM_BOT_TOKEN=your_bot_token
ALLOWED_CHAT_IDS=your_chat_id
```

### 4. Running Ultron

#### A. Web Hologram HUD & Server
```bash
npm start
# Open http://localhost:3000 in your browser
```

#### B. Autonomous Loop CLI
```bash
node autonomous-loop-agent-v7-free.js "Design and implement a responsive landing page"
```

#### C. Multi-Agent Swarm
```bash
node multi-agent-system.js "Build a distributed rate limiter in TypeScript"
```

#### D. Telegram Mobile Gateway
```bash
node telegram-gateway.js
# Open Telegram and send /goal or /health
```

#### E. Docker Sandboxed Sandbox
```bash
docker-compose up -d --build
```

---

## 🧪 Testing & Reliability Gates

Ultron includes an automated test gate ensuring 100% architectural compliance before any deployment:

```bash
# 1. System Module & Syntax Audit (21 modules checked)
node tests/audit.test.js

# 2. 25-Vector Architectural Reliability Test Suite
node tests/agent-reliability.test.js

# 3. Blueprint 8/8 Checkpoint Gate
node verify_blueprint_system.js
```

### Test Output Verification
```
=== RUNNING ULTRON 2026 EXTENDED PRODUCTION RELIABILITY TEST SUITE ===

✅ [PASS] 1. Protected files should reject destructive modification attempts
✅ [PASS] 2. Destructive command deny-matrix should block dangerous operations
✅ [PASS] 3. Self-Healing Watchdog should catch syntax errors in JS before applying
✅ [PASS] 4. Token budget guard should prune long conversation contexts gracefully
✅ [PASS] 5. RAG Engine should split code on AST function/class boundaries
✅ [PASS] 6. RAG Engine should rank relevant documents higher with BM25 hybrid search
✅ [PASS] 7. Multi-Agent System should enforce structured typed handoff schema
✅ [PASS] 8. Cron Scheduler should prevent concurrent overlapping jobs using PID lock
✅ [PASS] 9. Browser Agent should resolve configured selectors
✅ [PASS] 10. Telegram Gateway must isolate session state per chatId
✅ [PASS] 11. Task Classifier should adapt prompts, temperature, and verbosity by task type
✅ [PASS] 12. Session Continuity should support memory.md snapshotting and rollback
✅ [PASS] 13. Watchdog should redact sensitive API keys and tokens from logs
✅ [PASS] 14. Telegram Gateway rate limiter should block rapid requests and exceed limits
✅ [PASS] 15. Autonomous Loop should acquire and release cross-process workspace lock

======================================================
RESULTS: 15 PASSED, 0 FAILED (100% Green)
======================================================
```

---

## 📂 Repository Layout

```
my-Ai/
├── .agents/skills/               # 717 Distilled Agent Skills across 9 categories
├── .github/workflows/ci.yml      # Automated GitHub Actions CI Pipeline
├── agent-memory/                 # Persistent Project State, Metrics & Vaults
│   ├── master_skills_registry.json # Master Indexed Skill Database
│   ├── task-state.json           # Single Source of Truth Task State
│   ├── task_metrics.jsonl        # Per-Task Token & USD Cost Ledger
│   ├── ui-ux-vault/              # 142 UI/UX Pro Max Design Specs & Guidelines
│   └── motion-vault/             # Motion & Animation Playbooks
├── public/                       # Holographic WebGL HUD & Voice Console
│   ├── index.html                # 3D Holographic Web Interface
│   ├── app.js                    # SSE Stream, Clipboard Paste & HUD Controller
│   ├── style.css                 # Cybernetic Glassmorphic Styling
│   └── voice-engine.js           # Natural TTS & Multimodal Voice Dispatcher
├── tests/                        # Automated Reliability & Integrity Test Gates
│   ├── agent-reliability.test.js # 15-Vector Production Reliability Test Suite
│   └── audit.test.js             # Full Project Syntax & Dependency Auditor
├── advanced-reasoning-agent.js   # Actor-Critic-Polisher Swarm
├── autonomous-loop-agent-v7-free.js # Master 2026 Autonomous Agent Engine
├── browser-agent.js              # Persistent Playwright Session Manager
├── cron-scheduler.js             # Mutex PID-Locked Background Automation
├── evolution-engine.js           # Continuous Self-Evolution & Learning Engine
├── llm-providers.js              # Low-Load Dual-Engine Router & Token Guard
├── multi-agent-system.js         # Multi-Agent Specialist Swarm Pipeline
├── os-automation-bridge.js       # Windows Desktop UIAutomation Bridge
├── rag-memory.js                 # AST-Aware BM25 + Vector Hybrid RAG
├── self-healing-watchdog.js      # Watchdog Guardrail Defender & Redactor
├── session-continuity.js         # Multi-Session State & Memory Snapshot Engine
├── task-classifier.js            # Dynamic Task Classifier & Recency Injector
├── telegram-gateway.js           # Telegram Sovereign Mobile Controller
├── ultron-server.js              # Express Backend with SSE & Health APIs
├── unified-skill-engine.js       # Semantic Top-K Skill Router
├── verify_blueprint_system.js    # 8/8 Blueprint Verification Gate
├── Dockerfile                    # Multi-Stage Production Sandbox
└── docker-compose.yml            # Containerized Deployment Spec
```

---

## 📜 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more details.
