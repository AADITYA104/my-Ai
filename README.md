# my-Ai 🤖

> **Autonomous Loop Agent** featuring **Skill Memory System**, **Tool Autonomy** (Terminal, Code, Playwright Browser), **Telegram Gateway Interface**, and **Background Cron Scheduler**.

```
┌─────────────────────────────────────────────────────────┐
│     YOU (Telegram) ──────── OR ──────── Cron (Schedule) │
└────────────────────┬────────────────────┬───────────────┘
                     ▼                    ▼
           telegram-gateway.js    cron-scheduler.js
                     │                    │
                     └─────────┬──────────┘
                               ▼
                autonomous-loop-agent-v3.js  (Brain)
             (Bootstrap → Plan → Actor → Critic → Loop)
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
      Skill Memory       Tool Autonomy       Guardrails
     (agent-memory/      (terminal, code,   (FREEZE_DIR,
      skills/*.md)          browser)        confirmation,
                                            tokens, retries)
```

---

## 🌟 Key Features

1. **Actor-Critic Autonomous Loop**
   - Bootstraps goals into verifiable subtasks (`plan.json`).
   - Executes subtasks iteratively with independent critic verification.
   - Preserves state across iterations (`progress.json`, `memory.md`).

2. **Skill Memory System**
   - **Relevance check before execution**: Looks up previously solved patterns in `agent-memory/skills/*.md`.
   - **Distills winning strategies**: When a subtask passes verification, distills concise steps, when-to-use conditions, and gotchas into a reusable `.md` skill.
   - **Continuous learning**: Solves familiar problems faster and more reliably over time.

3. **Tool Autonomy & Safety**
   - **`terminal_exec`**: Shell command execution with `DESTRUCTIVE_PATTERNS` filtering and interactive confirmation gates (`rm -rf`, `DROP TABLE`, `sudo`, `git push --force`, etc.).
   - **`code_exec`**: Subprocess execution for JS and Python snippets with timeout enforcement.
   - **`browser_control`**: Headless browser automation (navigation, screenshots, clicking, text extraction) powered by Playwright.
   - **`FREEZE_DIR` sandboxing**: Confines filesystem writes to a scoped directory.

4. **Telegram Gateway (`telegram-gateway.js`)**
   - Control your agent directly from Telegram.
   - Commands: `/goal <text>`, `/status`, `/skills`, `/stop`.
   - Live throttled console log streaming.
   - `ALLOWED_CHAT_IDS` authorization guardrail.
   - Graceful `/stop` cancellation wired directly into the execution loop.

5. **Cron Scheduler (`cron-scheduler.js`)**
   - Time-based background recurring automation (e.g. daily news digests, automated audits, lead scraping).
   - Dedicated run logging in `agent-memory/cron-run-log.jsonl`.
   - Automatic Telegram status alerts and failure reports.

---

## 📁 Repository Structure

```text
my-Ai/
├── autonomous-loop-agent-v2.js   # Agent loop + Skill Memory System
├── autonomous-loop-agent-v3.js   # Agent loop + Skill Memory + Tool Autonomy + Cancellation
├── telegram-gateway.js           # Telegram Bot interface with streaming & controls
├── cron-scheduler.js             # Background cron automation runner & alerts
├── package.json                  # Dependencies & npm scripts
├── .gitignore                    # Ignored directories, env files & logs
├── .env.example                  # Environment configuration template
└── README.md                     # Documentation
```

---

## 🚀 Quick Setup

### 1. Prerequisites
- **Node.js**: v18+
- **Anthropic API Key**
- *(Optional for Telegram)* Telegram Bot Token from [@BotFather](https://t.me/BotFather)

### 2. Install Dependencies

```bash
git clone https://github.com/AADITYA104/my-Ai.git
cd my-Ai
npm install
npx playwright install chromium
```

### 3. Configure Environment Variables

Create `.env` or set environment variables:

```bash
# Required for agent operations
export ANTHROPIC_API_KEY="sk-ant-..."
export FREEZE_DIR="./workspace"

# Optional: Required for Telegram Gateway & Scheduler
export TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
export ALLOWED_CHAT_IDS="123456789"
export REPORT_CHAT_ID="123456789"
```

---

## 🛠️ Usage

### Run CLI Autonomous Loop (v3)
```bash
node autonomous-loop-agent-v3.js "Fetch top tech news headlines and save a markdown summary in report.md"
```

### Run Telegram Gateway
```bash
npm run gateway
# or: node telegram-gateway.js
```
*In Telegram:*
- `/goal Scrape today's AI news and write a summary`
- `/skills`
- `/status`
- `/stop`

### Run Cron Scheduler (Background Daemon)
```bash
npm run scheduler
# or: node cron-scheduler.js
```
*To test a scheduled job immediately:*
```bash
node cron-scheduler.js --run-now daily-market-news
```

---

## 🔒 Production Safety Warnings

- **Never leave `ALLOWED_CHAT_IDS` empty** when running Telegram Gateway.
- Always scope filesystem changes with `FREEZE_DIR`.
- For production workloads with terminal and code execution, run inside an isolated container (Docker, VM, or devcontainer).

---

## 📄 License

MIT © [AADITYA104](https://github.com/AADITYA104)
