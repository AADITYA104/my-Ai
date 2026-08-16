# my-Ai 🤖

> **Autonomous Loop Agent** with **Skill Memory System** and **Tool Autonomy** (Terminal Execution, Code Execution, and Browser Automation with Playwright).

---

## 🌟 Highlights

1. **Autonomous Loop (Actor-Critic)**
   - Bootstraps goals into verifiable subtasks (`plan.json`).
   - Executes subtasks with actor-critic verification before marking them complete.
   - Preserves state across iterations (`progress.json`, `memory.md`).

2. **Skill Memory System (v2+)**
   - **Pre-execution check**: Before executing any subtask, checks `agent-memory/skills/*.md` using cheap relevance matching.
   - **Post-verification learning**: Distills successful subtask completions into concise, reusable markdown skill guides.
   - **Compound improvement**: Familiar tasks execute faster and with higher precision over time.

3. **Tool Autonomy & Safety Layer (v3)**
   - **Terminal Execution** (`terminal_exec`): Runs shell commands with guardrails.
   - **Code Runner** (`code_exec`): Executes isolated JavaScript or Python code snippets via subprocess.
   - **Browser Control** (`browser_control`): Navigates, captures screenshots, clicks, and extracts DOM text using Playwright.
   - **Safety & Guardrails**:
     - `DESTRUCTIVE_PATTERNS` blocks destructive shell commands (`rm -rf`, `sudo`, `DROP TABLE`, `git push --force`, fork bombs, etc.).
     - Interactive human-in-the-loop terminal prompt (`yes`/`no`) for dangerous commands.
     - `FREEZE_DIR` environment variable to sandbox file operations to a specific directory.

---

## 📁 Repository Structure

```text
my-Ai/
├── autonomous-loop-agent-v2.js   # Autonomous agent with Skill Memory
├── autonomous-loop-agent-v3.js   # Autonomous agent with Skill Memory + Tool Autonomy
├── package.json                  # Node.js manifest and script runners
├── .gitignore                    # Ignored artifacts, credentials, node_modules
├── .env.example                  # Environment configuration template
└── README.md                     # Documentation
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18+ (with native `fetch` support)
- **Anthropic API Key**

### 2. Installation

```bash
git clone https://github.com/AADITYA104/my-Ai.git
cd my-Ai
npm install
npx playwright install chromium
```

### 3. Configure Environment

Copy `.env.example` or set environment variables:

```bash
# Linux / macOS
export ANTHROPIC_API_KEY="your_api_key"
export FREEZE_DIR="./workspace"

# Windows PowerShell
$env:ANTHROPIC_API_KEY="your_api_key"
$env:FREEZE_DIR="./workspace"
```

---

## 🛠️ Usage

### Run v2 (Skill Memory System)
```bash
node autonomous-loop-agent-v2.js "Analyze this repository and document all exported functions in DOCS.md"
```

### Run v3 (Full Tool Autonomy)
```bash
node autonomous-loop-agent-v3.js "Fetch top tech news headlines from Hacker News and save a markdown report in report.md"
```

---

## 🔒 Safety & Best Practices

- **Never disable safety gates** when running on machines with sensitive production keys or root access.
- Always configure `FREEZE_DIR` to limit the agent's file access scope.
- We recommend executing autonomous agents inside a containerized environment (e.g., Docker, Firecracker microVM, or isolated devcontainer).

---

## 📄 License

MIT © [AADITYA104](https://github.com/AADITYA104)
