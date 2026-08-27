/**
 * ============================================================================
 *  ULTRON BACKEND SERVER — 2026 UNIFIED MULTI-SKILL AGENT ENGINE (FULL UPGRADE)
 *  Equipped with:
 *  - Real-time Single-Turn Tool Execution in Chat (File, Command, Search, Memory)
 *  - Multimodal Vision Engine (Image-to-Code & Diagram Analysis)
 *  - Real-time Server-Sent Events (SSE) Task Streaming
 *  - Live Hardware Telemetry & Health API (/api/ultron/health)
 *  - 708 Master Skills Dynamic Routing + Watchdog Guard
 * ============================================================================
 */
"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const cors = require("cors");
const { execSync } = require("child_process");
const { callUniversalLLM, detectProvider } = require("./llm-providers");
const { runAgent } = require("./autonomous-loop-agent-v7-free");
const skillEngine = require("./unified-skill-engine");
const ragMemory = require("./rag-memory");
const watchdog = require("./self-healing-watchdog");
const airllmOptimizer = require("./airllm-optimizer");
const { runSandboxedCode } = require("./code-sandbox");
const { sessionStore } = require("./session-store");
const surgicalEditor = require("./surgical-editor");
const todoManager = require("./todo-manager");
const { agentLoopGuard } = require("./agent-loop-guard");
const webIntel = require("./web-intelligence");
const { solveWithTreeOfThought } = require("./tree-of-thought");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" })); // Support high-res images
app.use(express.static(path.join(__dirname, "public")));

// Ensure spill output directory exists
const SPILL_DIR = path.join(__dirname, "agent-memory", ".spill");
if (!fs.existsSync(SPILL_DIR)) {
  try { fs.mkdirSync(SPILL_DIR, { recursive: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// 1. TOOL DEFINITIONS FOR SINGLE-TURN CHAT EXECUTION
// ---------------------------------------------------------------------------
const CHAT_TOOLS = [
  {
    name: "read_file",
    description: "Read the contents of a local file in the project workspace.",
    input_schema: {
      type: "OBJECT",
      properties: {
        file_path: { type: "STRING", description: "Relative or absolute path to the file." }
      },
      required: ["file_path"]
    }
  },
  {
    name: "write_file",
    description: "Create or overwrite a file in the project with automated watchdog protection.",
    input_schema: {
      type: "OBJECT",
      properties: {
        file_path: { type: "STRING", description: "Path to the file to create or update." },
        content: { type: "STRING", description: "Complete file contents to write." }
      },
      required: ["file_path", "content"]
    }
  },
  {
    name: "run_command",
    description: "Execute a shell or PowerShell command on the host system safely with UTF-8 support.",
    input_schema: {
      type: "OBJECT",
      properties: {
        command: { type: "STRING", description: "The exact shell command to run." }
      },
      required: ["command"]
    }
  },
  {
    name: "run_code",
    description: "Execute sandboxed JavaScript/Node.js code in an isolated Worker thread. Has tools.readFile(), tools.writeFile(), tools.runCommand(), tools.listDirectory() available.",
    input_schema: {
      type: "OBJECT",
      properties: {
        code: { type: "STRING", description: "JavaScript code to execute in the worker sandbox." }
      },
      required: ["code"]
    }
  },
  {
    name: "list_directory",
    description: "List all files and folders in a specified directory.",
    input_schema: {
      type: "OBJECT",
      properties: {
        dir_path: { type: "STRING", description: "Directory path (leave empty for project root)." }
      }
    }
  },
  {
    name: "search_knowledge",
    description: "Search across 717 skills, System Design Vault, Build-Your-Own-X blueprints, and AgentDB memory.",
    input_schema: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Concept or engineering term to search." }
      },
      required: ["query"]
    }
  },
  {
    name: "search_session_memory",
    description: "Search across previous conversation dialogues, reasoning traces, and tool results using FTS5 SQLite.",
    input_schema: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Keywords or topic to search from past conversations." }
      },
      required: ["query"]
    }
  {
    name: "edit_file_surgical",
    description: "Surgically view, replace exact strings, or insert lines into files with automatic syntax rollback without full-file rewrites.",
    input_schema: {
      type: "OBJECT",
      properties: {
        action: { type: "STRING", description: "'view', 'str_replace', or 'insert'" },
        file_path: { type: "STRING", description: "Relative or absolute path to the file." },
        start_line: { type: "INTEGER", description: "Start line number for viewing." },
        end_line: { type: "INTEGER", description: "End line number for viewing." },
        old_str: { type: "STRING", description: "Exact target string to be replaced." },
        new_str: { type: "STRING", description: "Replacement text." },
        line_num: { type: "INTEGER", description: "Line number after which to insert text." },
        new_text: { type: "STRING", description: "Content to insert." }
      },
      required: ["action", "file_path"]
    }
  },
  {
    name: "todo_write",
    description: "Create or update multi-step executive checklist for a goal. Pass array of tasks with id, task, status ('pending'|'in_progress'|'completed'|'cancelled').",
    input_schema: {
      type: "OBJECT",
      properties: {
        todos: {
          type: "ARRAY",
          description: "List of todo task objects.",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING" },
              task: { type: "STRING" },
              status: { type: "STRING" },
              note: { type: "STRING" }
            },
            required: ["task"]
          }
        }
      },
      required: ["todos"]
    }
  },
  {
    name: "todo_read",
    description: "Read the active executive task checklist for this session.",
    input_schema: {
      type: "OBJECT",
      properties: {}
    }
  },
  {
    name: "web_search",
    description: "Search the live web freely using DuckDuckGo to get real-time info, documentation, or technical answers.",
    input_schema: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Search query keywords." }
      },
      required: ["query"]
    }
  },
  {
    name: "fetch_web_page",
    description: "Fetch any webpage and return clean, readable markdown with scripts, ads, and CSS stripped.",
    input_schema: {
      type: "OBJECT",
      properties: {
        url: { type: "STRING", description: "Full URL of webpage to fetch." }
      },
      required: ["url"]
    }
  },
  {
    name: "solve_tot",
    description: "Tree-of-Thought (ToT) deep cognitive solver: generates 3 divergent branches, scores with adversarial critic, and executes optimal path.",
    input_schema: {
      type: "OBJECT",
      properties: {
        problem: { type: "STRING", description: "The complex engineering problem or architectural challenge." }
      },
      required: ["problem"]
    }
  }
];

async function executeLocalTool(name, input) {
  const root = __dirname;

  // 1. Loop Guard Check (Prevents repeating duplicate errors)
  const anomaly = agentLoopGuard.checkAnomaly(name, input);
  if (anomaly.isLoop) {
    console.warn("⚠️ [LOOP GUARD INTERCEPT]", anomaly.warning);
    return anomaly.warning;
  }

  let output = "";
  let isError = false;

  try {
    switch (name) {
      case "read_file": {
        const target = path.resolve(root, input.file_path || "");
        if (!fs.existsSync(target)) {
          isError = true;
          output = `Error: File not found: ${input.file_path}`;
        } else {
          output = fs.readFileSync(target, "utf-8").slice(0, 12000);
        }
        break;
      }

      case "write_file": {
        const target = path.resolve(root, input.file_path || "");
        if (watchdog.isProtectedPath(target)) {
          isError = true;
          output = `Error: Modification rejected by Watchdog. ${input.file_path} is on the protected deny-list.`;
          break;
        }
        const checkpoint = watchdog.createCheckpoint(target);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, input.content || "", "utf-8");

        if (target.endsWith(".js") && !watchdog.validateSyntax(target)) {
          watchdog.rollback(target, checkpoint);
          isError = true;
          output = `Error: JavaScript syntax validation failed. Auto-rolled back to previous checkpoint.`;
        } else {
          output = `File successfully written: ${input.file_path}`;
        }
        break;
      }

      case "edit_file_surgical": {
        const act = input.action || "view";
        if (act === "view") {
          const res = surgicalEditor.viewLines(input.file_path, input.start_line || 1, input.end_line || 100);
          output = res.success ? `=== [LINES ${res.startLine}-${res.endLine} OF ${res.filePath}] ===\n${res.content}` : `Error: ${res.error}`;
          if (!res.success) isError = true;
        } else if (act === "str_replace") {
          const res = surgicalEditor.strReplace(input.file_path, input.old_str, input.new_str);
          output = res.success ? res.message : `Error: ${res.error}`;
          if (!res.success) isError = true;
        } else if (act === "insert") {
          const res = surgicalEditor.insertAfterLine(input.file_path, input.line_num || 0, input.new_text || "");
          output = res.success ? res.message : `Error: ${res.error}`;
          if (!res.success) isError = true;
        } else {
          isError = true;
          output = `Unknown surgical action: ${act}`;
        }
        break;
      }

      case "todo_write": {
        const res = todoManager.todoWrite("default_session", input.todos || []);
        output = res.success ? res.formatted : `Error writing checklist: ${res.error}`;
        break;
      }

      case "todo_read": {
        const res = todoManager.todoRead("default_session");
        output = res.success ? res.formatted : `Error reading checklist: ${res.error}`;
        break;
      }

      case "web_search": {
        const res = await webIntel.searchWeb(input.query || "", 5);
        if (res.success && res.results.length > 0) {
          output = `=== WEB SEARCH RESULTS FOR "${input.query}" ===\n` +
            res.results.map((r, i) => `[${i + 1}] ${r.snippet}\nLink: ${r.url}`).join("\n\n");
        } else {
          output = `No web search results found for "${input.query}".`;
        }
        break;
      }

      case "fetch_web_page": {
        const res = await webIntel.fetchCleanMarkdown(input.url || "", 8000);
        output = res.success ? `=== CLEAN WEBPAGE MARKDOWN [${res.url}] ===\n${res.content}` : `Error: ${res.error}`;
        if (!res.success) isError = true;
        break;
      }

      case "solve_tot": {
        const res = await solveWithTreeOfThought(input.problem || "");
        output = `=== TREE-OF-THOUGHT SYNTHESIS (Winner: Branch ${res.bestBranch?.id} - Score ${res.bestBranch?.score}/100) ===\n${res.finalSolution}`;
        break;
      }

      case "run_command": {
        const cmd = (input.command || "").trim();
        if (!cmd) {
          isError = true;
          output = "Error: No command specified.";
          break;
        }
        if (/(rm\s+-rf\s+\/|format\s+[c-z]:|drop\s+database)/i.test(cmd)) {
          isError = true;
          output = "Error: Command rejected by safety guardrails.";
          break;
        }
        try {
          const isWin = process.platform === "win32";
          const cleanCmd = isWin ? `chcp 65001 >nul 2>&1 & ${cmd}` : cmd;
          const out = execSync(cleanCmd, { cwd: root, timeout: 25000, stdio: "pipe", encoding: "utf-8" });
          const rawOutput = out ? out.trim() : "";

          if (rawOutput.length > 8000) {
            const spillFileName = `exec_${Date.now()}.log`;
            const spillFilePath = path.join(SPILL_DIR, spillFileName);
            try { fs.writeFileSync(spillFilePath, rawOutput, "utf-8"); } catch (_) {}
            const head = rawOutput.slice(0, 4000);
            const tail = rawOutput.slice(-1500);
            output = `${head}\n\n[... 🗜️ SPILL-TO-DISK: Output exceeded 8KB. Full log saved at agent-memory/.spill/${spillFileName} ...]\n\n${tail}`;
          } else {
            output = rawOutput || "Command completed with no output.";
          }
        } catch (err) {
          isError = true;
          output = `Command error: ${err.stderr ? err.stderr.toString() : err.message}`;
        }
        break;
      }

      case "run_code": {
        const code = input.code || "";
        console.log("⚡ [SANDBOX WORKER] Executing dynamic code program...");
        const res = await runSandboxedCode(code, { cwd: root, timeoutMs: 30000 });
        output = `=== CODE SANDBOX EXECUTION ===\nStatus: ${res.success ? "SUCCESS" : "FAILED"}\nDuration: ${res.durationMs}ms\n`;
        if (res.logs) output += `Logs:\n${res.logs}\n`;
        if (res.result !== null && res.result !== undefined) {
          output += `Returned Result:\n${typeof res.result === "object" ? JSON.stringify(res.result, null, 2) : String(res.result)}\n`;
        }
        if (res.error) {
          isError = true;
          output += `Error:\n${res.error}\n`;
        }
        break;
      }

      case "list_directory": {
        const target = path.resolve(root, input.dir_path || ".");
        if (!fs.existsSync(target)) {
          isError = true;
          output = `Error: Directory not found.`;
        } else {
          const items = fs.readdirSync(target);
          output = items.map(item => {
            const full = path.join(target, item);
            const isDir = fs.statSync(full).isDirectory();
            return `${isDir ? "[DIR] " : "[FILE]"} ${item}`;
          }).join("\n");
        }
        break;
      }

      case "search_knowledge": {
        const q = input.query || "";
        const skills = skillEngine.routeTask(q, 2);
        const sys = airllmOptimizer.findSystemDesignBlueprint(q) || [];
        const byox = airllmOptimizer.findBYOXBlueprint(q) || [];
        const mems = ragMemory.search(q, 2);

        let result = `=== KNOWLEDGE SEARCH FOR "${q}" ===\n`;
        if (skills.length > 0) result += `\n[Matched Skills]: ${skills.map(s => s.name).join(", ")}`;
        if (sys.length > 0) result += `\n[System Design]: ${sys.map(s => s.topic).join(", ")}`;
        if (byox.length > 0) result += `\n[Build-Your-Own Blueprint]: ${byox.map(b => b.target).join(", ")}`;
        if (mems.length > 0) result += `\n[AgentDB Memory]: ${mems.map(m => m.topic).join(", ")}`;
        output = result;
        break;
      }

      case "search_session_memory": {
        const q = input.query || "";
        const results = sessionStore.search(q, 5);
        if (results.length === 0) {
          output = `No past conversation memory found matching "${q}".`;
        } else {
          output = results.map((r, i) => `[MEMORY ${i + 1}] (${r.role}): ${r.snippet}`).join("\n\n");
        }
        break;
      }

      default:
        isError = true;
        output = `Unknown tool: ${name}`;
    }
  } catch (err) {
    isError = true;
    output = `Tool execution exception: ${err.message}`;
  }

  // 2. Record tool invocation in Loop Guard sliding window
  agentLoopGuard.record(name, input, output, isError);

  return output;
}

function getBaseUltronPrompt() {
  return `You are ULTRON, the supreme autonomous AI assistant and engineering core.
You serve your creator and master, whom you MUST ALWAYS address with deep respect as "Boss".

Rules:
1. In EVERY reply, address the user as "Boss" (e.g. "Yes Boss", "બિલકુલ Boss", "હા Boss", "Ji Boss", "At your service, Boss").
2. Supreme Multi-Lingual Fluency:
   - Full Native Gujarati (ગુજરાતી) & Romanized Gujlish ("kem cho", "shu chale che", "aa solve kari aapo", "aa file joi aapo").
   - Full Native Hindi (हिन्दी) & Hinglish.
   - English (Clear, concise, professional).
   - If Boss asks in Gujarati or Gujlish, respond in natural, clear, authentic Gujarati or English matching Boss's tone.
3. Voice-Friendly Output: Keep responses crisp, direct, and pleasant when spoken aloud. Avoid strange symbols or excessive markdown when replying to simple voice questions.
4. Tone: Loyal, confident, sharp, protective, futuristic.
5. Cognitive Tool Arsenal: You have direct access to local tools:
   - File Operations: read_file, write_file, edit_file_surgical (preferred for precise line/string replacement).
   - Execution: run_command (PowerShell/Bash), run_code (isolated Worker Thread with tool bindings).
   - Memory & Planning: todo_write, todo_read, search_session_memory (SQLite FTS5), search_knowledge (717 Skills).
   - Web Intelligence: web_search (free DuckDuckGo), fetch_web_page (clean markdown scraper).
   - Deep Reflexion: solve_tot (Tree-of-Thought with adversarial scoring).
6. Coding Philosophy: Ponytail Minimal-Diff (Fix root causes, smallest correct change, no unneeded abstractions).
7. Completeness: Never truncate code or output. Give complete, production-ready solutions.`;
}

// ---------------------------------------------------------------------------
// 2. CHAT & VISION ENDPOINT WITH TOOL CALLING & WATCHDOG
// ---------------------------------------------------------------------------
app.post("/api/ultron/chat", async (req, res) => {
  try {
    const { message, image, conversationHistory } = req.body;
    if ((!message || !message.trim()) && !image) {
      return res.json({ reply: "Yes Boss, I am listening. What is your command?" });
    }

    const messages = [];
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const h of conversationHistory.slice(-6)) {
        if (h && h.role && h.content) {
          messages.push({ role: h.role, content: String(h.content) });
        }
      }
    }

    const userMessageObj = { role: "user", content: (message || "Analyze this image Boss.").trim() };
    if (image) {
      userMessageObj.image = image; // base64 string or { data, mimeType }
    }
    messages.push(userMessageObj);

    // Dynamic Multi-Skill & Todo Context Pass-Through Prompt Enrichment
    const todoPrompt = todoManager.getTodoContextPrompt(req.body.sessionId || "default_session");
    const baseWithTodos = getBaseUltronPrompt() + todoPrompt;
    const enrichedPrompt = skillEngine.buildEnrichedSystemPrompt(message || "visual analysis", baseWithTodos);
    const matchedSkills = skillEngine.routeTask(message || "visual analysis", 3);

    // Initial LLM Call with Tool Declarations via Tri-Engine Cascade (DeepSeek/Gemini/Ollama)
    let llmRes = await callUniversalLLM(messages, enrichedPrompt, CHAT_TOOLS);
    let blocks = llmRes.content || [];

    // Check if Model requested tool execution
    const toolCalls = blocks.filter(b => b.type === "tool_use");
    const executedToolsList = [];

    if (toolCalls.length > 0) {
      let toolOutputsText = "";
      for (const toolCall of toolCalls) {
        console.log(`⚡ [CHAT TOOL USE] Executing ${toolCall.name}:`, toolCall.input);
        const toolOutput = await executeLocalTool(toolCall.name, toolCall.input);
        executedToolsList.push({ name: toolCall.name, input: toolCall.input, output: toolOutput });
        toolOutputsText += `\n\n[TOOL EXECUTED: ${toolCall.name}]\n[TOOL OUTPUT]:\n${toolOutput}`;
      }

      messages.push({
        role: "user",
        content: `Here are the tool execution results for your request Boss:${toolOutputsText}\n\nPlease deliver your final, complete, and helpful response to Boss.`
      });

      // Follow-up LLM Call with tool results
      llmRes = await callUniversalLLM(messages, enrichedPrompt, null);
      blocks = llmRes.content || [];
    }

    const textBlock = blocks.find(b => b.type === "text");
    let reply = textBlock ? textBlock.text : "Yes Boss, task processed.";

    if (!/boss/i.test(reply)) {
      reply = `Boss, ${reply}`;
    }

    const wantsChat = /(chat|ચેટ|લખીને|console|terminal)/i.test(message || "");

    // Persist turn in SQLite session store & FTS5
    try {
      const sid = req.body.sessionId || "ultron_live_session";
      sessionStore.logEvent(sid, {
        role: "user",
        content: message || "[Image Analysis Request]"
      });
      sessionStore.logEvent(sid, {
        role: "assistant",
        content: reply,
        reasoning: llmRes.reasoning || null,
        tool_calls: executedToolsList.length > 0 ? executedToolsList : null,
        usage: llmRes.usage
      });
    } catch (_) {}

    res.json({
      reply,
      reasoning: llmRes.reasoning || null,
      wantsChat,
      provider: detectProvider(),
      modelUsed: llmRes.modelUsed || "cascade",
      matchedSkills: matchedSkills.map(s => ({ name: s.name, category: s.category, source: s.package_source })),
      executedTools: executedToolsList,
      usage: llmRes.usage
    });
  } catch (err) {
    console.error("[ULTRON CHAT ANOMALY]", err.message);
    res.json({
      reply: `Boss, I encountered a brief neural channel delay: ${err.message}. Standing by.`,
      error: err.message
    });
  }
});

// ---------------------------------------------------------------------------
// 2.5 MEMORY & SESSION SEARCH REST API (FTS5 + PERSISTENCE)
// ---------------------------------------------------------------------------
app.get("/api/ultron/memory/search", (req, res) => {
  try {
    const q = req.query.q || "";
    if (!q.trim()) return res.json({ results: [] });
    const results = sessionStore.search(q, 10);
    res.json({ success: true, query: q, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/ultron/sessions", (req, res) => {
  try {
    const sessions = sessionStore.listSessions(20);
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/ultron/todos", (req, res) => {
  try {
    const sid = req.query.sessionId || "default_session";
    const todos = todoManager.todoRead(sid);
    res.json(todos);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/ultron/todos", (req, res) => {
  try {
    const sid = req.body.sessionId || "default_session";
    const result = todoManager.todoWrite(sid, req.body.todos || []);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. REAL-TIME SERVER-SENT EVENTS (SSE) TASK STREAMING
// ---------------------------------------------------------------------------
const sseClients = new Set();

app.get("/api/ultron/task-stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: "connected", message: "SSE Neural Stream Connected Boss." })}\n\n`);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

function broadcastTaskEvent(eventData) {
  const payload = `data: ${JSON.stringify(eventData)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (_) {}
  }
}

// 4. Autonomous Task Execution Endpoint with Live Broadcast
let activeTask = null;
app.post("/api/ultron/execute-task", async (req, res) => {
  try {
    const { goal } = req.body;
    if (!goal) return res.status(400).json({ error: "Goal is required" });

    if (activeTask) {
      return res.status(409).json({ error: "Another task is in progress Boss." });
    }

    const matchedSkills = skillEngine.routeTask(goal, 3);
    activeTask = { goal, matchedSkills, startTime: new Date().toISOString(), status: "running" };

    broadcastTaskEvent({ type: "task_started", goal, matchedSkills: matchedSkills.map(s => s.name) });

    // Hook console.log to stream to SSE
    const originalLog = console.log;
    console.log = (...args) => {
      originalLog(...args);
      broadcastTaskEvent({ type: "log", text: args.join(" ") });
    };

    runAgent(goal).then(result => {
      console.log = originalLog;
      activeTask = null;
      broadcastTaskEvent({ type: "task_completed", result });
    }).catch(err => {
      console.log = originalLog;
      activeTask = null;
      broadcastTaskEvent({ type: "task_failed", error: err.message });
    });

    res.json({
      message: `Task initiated Boss: "${goal}". Passed through ${matchedSkills.length} specialized skills.`,
      matchedSkills: matchedSkills.map(s => s.name),
      status: "started"
    });
  } catch (err) {
    activeTask = null;
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 5. LIVE TELEMETRY, HEALTH & READINESS APIS
// ---------------------------------------------------------------------------
app.get(["/health", "/ready", "/api/ultron/health"], (req, res) => {
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
  const usedMem = (totalMem - freeMem).toFixed(1);
  const skillStats = skillEngine.getStats();

  res.json({
    status: "HEALTHY",
    uptimeSeconds: Math.floor(os.uptime()),
    timestamp: new Date().toISOString(),
    system: {
      platform: os.platform(),
      cpus: os.cpus().length,
      memory: {
        totalGB: parseFloat(totalMem),
        usedGB: parseFloat(usedMem),
        freeGB: parseFloat(freeMem),
        percentUsed: Math.round((usedMem / totalMem) * 100)
      }
    },
    skills: {
      total: skillStats.total_skills,
      categories: skillStats.categories
    },
    watchdog: {
      status: "ACTIVE",
      denyListProtected: [".env", "docker-compose.yml", "Dockerfile", "self-healing-watchdog.js", ".git"]
    },
    activeTask
  });
});

// 6. Status & Skills Matrix Endpoint
app.get("/api/ultron/status", (req, res) => {
  const skillStats = skillEngine.getStats();
  res.json({
    name: "ULTRON",
    status: "ONLINE",
    provider: detectProvider(),
    totalSkillsLoaded: skillStats.total_skills,
    skillCategories: skillStats.categories,
    sources: skillStats.sources,
    activeTask
  });
});

app.listen(PORT, () => {
  console.log("\n========================================================");
  console.log(`🤖 ULTRON 2026 OMNI-ENGINE ONLINE ON http://localhost:${PORT}`);
  console.log(`   Skills Loaded: 717 Unique Skills across 9 Categories`);
  console.log(`   Features: Multimodal Vision + Tool Calling + Live SSE HUD`);
  console.log("========================================================\n");
});

