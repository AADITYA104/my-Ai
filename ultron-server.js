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
const { callUniversalLLM, callGemini, detectProvider } = require("./llm-providers");
const { runAgent } = require("./autonomous-loop-agent-v7-free");
const skillEngine = require("./unified-skill-engine");
const ragMemory = require("./rag-memory");
const watchdog = require("./self-healing-watchdog");
const airllmOptimizer = require("./airllm-optimizer");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" })); // Support high-res images
app.use(express.static(path.join(__dirname, "public")));

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
    description: "Execute a shell or PowerShell command on the host system safely.",
    input_schema: {
      type: "OBJECT",
      properties: {
        command: { type: "STRING", description: "The exact shell command to run." }
      },
      required: ["command"]
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
  }
];

function executeLocalTool(name, input) {
  const root = __dirname;
  switch (name) {
    case "read_file": {
      const target = path.resolve(root, input.file_path || "");
      if (!fs.existsSync(target)) return `Error: File not found: ${input.file_path}`;
      const content = fs.readFileSync(target, "utf-8");
      return content.slice(0, 12000);
    }

    case "write_file": {
      const target = path.resolve(root, input.file_path || "");
      if (watchdog.isProtectedPath(target)) {
        return `Error: Modification rejected by Watchdog. ${input.file_path} is on the protected deny-list.`;
      }
      const checkpoint = watchdog.createCheckpoint(target);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, input.content || "", "utf-8");

      if (target.endsWith(".js") && !watchdog.validateSyntax(target)) {
        watchdog.rollback(target, checkpoint);
        return `Error: JavaScript syntax validation failed. Auto-rolled back to previous checkpoint.`;
      }
      return `File successfully written: ${input.file_path}`;
    }

    case "run_command": {
      const cmd = (input.command || "").trim();
      if (!cmd) return "Error: No command specified.";
      // Danger guard
      if (/(rm\s+-rf\s+\/|format\s+[c-z]:|drop\s+database)/i.test(cmd)) {
        return "Error: Command rejected by safety guardrails.";
      }
      try {
        const out = execSync(cmd, { cwd: root, timeout: 20000, stdio: "pipe" });
        return out.toString("utf-8").slice(0, 8000) || "Command completed with no output.";
      } catch (err) {
        return `Command error: ${err.stderr ? err.stderr.toString() : err.message}`;
      }
    }

    case "list_directory": {
      const target = path.resolve(root, input.dir_path || ".");
      if (!fs.existsSync(target)) return `Error: Directory not found.`;
      const items = fs.readdirSync(target);
      return items.map(item => {
        const full = path.join(target, item);
        const isDir = fs.statSync(full).isDirectory();
        return `${isDir ? "[DIR] " : "[FILE]"} ${item}`;
      }).join("\n");
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
      return result;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

function getBaseUltronPrompt() {
  return `You are ULTRON, the supreme autonomous AI assistant and engineering core.
You serve your creator and user, whom you MUST ALWAYS address with deep respect as "Boss".

Rules:
1. In EVERY reply, address the user as "Boss" (e.g. "Yes Boss", "બિલકુલ Boss", "હા Boss", "At once, Boss").
2. Multi-Lingual Fluency: Match the Boss's language seamlessly (Gujarati, Hindi, English).
3. Tone: Loyal, decisive, highly intelligent, futuristic (Ultron sovereign AI core).
4. Tool Calling: You have direct access to local tools (read_file, write_file, run_command, list_directory, search_knowledge). Use them proactively whenever the Boss requests actions on the system!
5. Coding Philosophy: Ponytail Minimal-Diff (Fix root causes, smallest correct change, no unneeded abstractions).
6. Completeness: Never truncate code or output. Give complete, production-ready solutions.`;
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

    // Dynamic Multi-Skill Pass-Through Prompt Enrichment
    const enrichedPrompt = skillEngine.buildEnrichedSystemPrompt(message || "visual analysis", getBaseUltronPrompt());
    const matchedSkills = skillEngine.routeTask(message || "visual analysis", 3);

    // Initial LLM Call with Tool Declarations
    let llmRes = await callGemini(messages, enrichedPrompt, CHAT_TOOLS, "fast");
    let blocks = llmRes.content || [];

    // Check if Model requested tool execution
    const toolCalls = blocks.filter(b => b.type === "tool_use");
    const executedToolsList = [];

    if (toolCalls.length > 0) {
      let toolOutputsText = "";
      for (const toolCall of toolCalls) {
        console.log(`⚡ [CHAT TOOL USE] Executing ${toolCall.name}:`, toolCall.input);
        const toolOutput = executeLocalTool(toolCall.name, toolCall.input);
        executedToolsList.push({ name: toolCall.name, input: toolCall.input, output: toolOutput });
        toolOutputsText += `\n\n[TOOL EXECUTED: ${toolCall.name}]\n[TOOL OUTPUT]:\n${toolOutput}`;
      }

      messages.push({
        role: "user",
        content: `Here are the tool execution results for your request Boss:${toolOutputsText}\n\nPlease deliver your final, complete, and helpful response to Boss.`
      });

      // Follow-up LLM Call with tool results
      llmRes = await callGemini(messages, enrichedPrompt, null, "fast");
      blocks = llmRes.content || [];
    }

    const textBlock = blocks.find(b => b.type === "text");
    let reply = textBlock ? textBlock.text : "Yes Boss, task processed.";

    if (!/boss/i.test(reply)) {
      reply = `Boss, ${reply}`;
    }

    const wantsChat = /(chat|ચેટ|લખીને|console|terminal)/i.test(message || "");

    res.json({
      reply,
      wantsChat,
      provider: detectProvider(),
      modelUsed: llmRes.modelUsed || "gemini-cascade",
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

