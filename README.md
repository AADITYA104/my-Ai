# my-Ai 🤖

> **Production-Grade Autonomous Loop Agent Suite** featuring **Actor-Critic Verification**, **Distilled Skill Memory**, **Native Tool Autonomy** (Terminal, Subprocess Code, Playwright Browser), **Telegram Bot Gateway**, **Background Cron Scheduler**, and **Docker Sandboxing**.

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

## 📁 Repository Suite

| File | Purpose |
| :--- | :--- |
| **[`AI-Agent-Loop-Engineering-Guide.md`](file:///c:/Users/devmu/Downloads/my%20Ai/AI-Agent-Loop-Engineering-Guide.md)** | Deep architectural guide on Actor-Critic loops, skill distillation, and tool safety. |
| **[`advanced-reasoning-agent.js`](file:///c:/Users/devmu/Downloads/my%20Ai/advanced-reasoning-agent.js)** | Foundational Actor-Critic reasoning engine with iterative critique loops. |
| **[`autonomous-loop-agent.js`](file:///c:/Users/devmu/Downloads/my%20Ai/autonomous-loop-agent.js)** | **v1**: Self-bootstrapping planner decomposing goals into verifiable subtasks on disk. |
| **[`autonomous-loop-agent-v2.js`](file:///c:/Users/devmu/Downloads/my%20Ai/autonomous-loop-agent-v2.js)** | **v2**: Skill Memory System that matches and saves distilled `.md` recipes. |
| **[`autonomous-loop-agent-v3.js`](file:///c:/Users/devmu/Downloads/my%20Ai/autonomous-loop-agent-v3.js)** | **v3**: Tool Autonomy with `terminal_exec`, `code_exec`, and Playwright `browser_control`. |
| **[`autonomous-loop-agent-v4-hardening.js`](file:///c:/Users/devmu/Downloads/my%20Ai/autonomous-loop-agent-v4-hardening.js)** | **v4**: Hardening layer with skill usage tracking and contradiction audit reports. |
| **[`autonomous-loop-agent-v5-native-tools.js`](file:///c:/Users/devmu/Downloads/my%20Ai/autonomous-loop-agent-v5-native-tools.js)** | **v5 (Latest)**: Production Anthropic native JSON `tools` schema with multi-step execution. |
| **[`telegram-gateway.js`](file:///c:/Users/devmu/Downloads/my%20Ai/telegram-gateway.js)** | Telegram Bot Gateway with progress streaming, `/goal`, `/status`, `/skills`, and `/stop`. |
| **[`cron-scheduler.js`](file:///c:/Users/devmu/Downloads/my%20Ai/cron-scheduler.js)** | Headless recurring cron automation with JSONL run logging and Telegram alert reporting. |
| **[`Dockerfile`](file:///c:/Users/devmu/Downloads/my%20Ai/Dockerfile)** & **[`docker-compose.yml`](file:///c:/Users/devmu/Downloads/my%20Ai/docker-compose.yml)** | Fully containerized non-root sandboxed execution environment. |

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18+
- **Anthropic API Key**
- *(Optional)* Telegram Bot Token & Chat ID (from [@BotFather](https://t.me/BotFather))
- *(Optional)* Docker & Docker Compose

### 2. Installation
```bash
git clone https://github.com/AADITYA104/my-Ai.git
cd my-Ai
npm install
npx playwright install chromium
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and configure:
```bash
# Required
export ANTHROPIC_API_KEY="sk-ant-..."
export FREEZE_DIR="./workspace"

# Optional: Telegram & Notifications
export TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
export ALLOWED_CHAT_IDS="123456789"
export REPORT_CHAT_ID="123456789"
```

---

## 🛠️ Usage

### Run Latest Native Tool Agent (v5)
```bash
node autonomous-loop-agent-v5-native-tools.js "Research top 5 AI papers today and write a markdown summary to papers.md"
```

### Run Telegram Bot Gateway
```bash
npm run gateway
```
*Commands in Telegram:*
- `/goal <description>` — Starts agent on a goal.
- `/status` — Displays active run state.
- `/skills` — Lists all learned distilled skills.
- `/stop` — Gracefully stops current execution.

### Run Background Cron Scheduler
```bash
npm run scheduler
# Or trigger a job immediately for testing:
node cron-scheduler.js --run-now daily-market-news
```

### Run Skill Library Audit
```bash
npm run audit
```

---

## 🐳 Docker Deployment

Run the complete sandboxed stack:

```bash
# Start Telegram Gateway & Cron Scheduler
docker compose up -d

# View live gateway logs
docker compose logs -f agent-gateway

# Run on-demand skill audit in container
docker compose run --rm agent-audit
```

---

## 🔒 Safety & Best Practices

1. **Always set `ALLOWED_CHAT_IDS`**: Never allow public unauthenticated access to the Telegram bot.
2. **Use `FREEZE_DIR`**: Constrains file modifications and screenshots within the specified workspace.
3. **Container Sandboxing**: Run agents executing real shell commands inside Docker containers or virtual machines.

---

## 📄 License

MIT © [AADITYA104](https://github.com/AADITYA104)
