"use strict";

const { callUniversalLLM } = require("./llm-providers");
const rag = require("./rag-memory");

async function main() {
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";
  const expectedModel = process.env.OLLAMA_MODEL || "ultron-core";
  const report = [];

  async function check(name, fn) {
    try {
      const detail = await fn();
      report.push({ name, ok: true, detail });
    } catch (err) {
      report.push({ name, ok: false, detail: err.message });
    }
  }

  await check("Ollama API", async () => {
    const res = await fetch(`${host}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const names = (data.models || []).map(m => m.name);
    if (!names.some(n => n === expectedModel || n === `${expectedModel}:latest`)) {
      throw new Error(`${expectedModel} not found. Available: ${names.join(", ") || "(none)"}`);
    }
    return names.join(", ");
  });

  await check("Local chat", async () => {
    const res = await callUniversalLLM(
      [{ role: "user", content: "Reply exactly: CONNECTED" }],
      "You are a local health check."
    );
    const text = (res.content || []).map(part => part.text || "").join("").trim();
    if (res.modelUsed !== `local-ollama (${expectedModel})`) throw new Error(`Used ${res.modelUsed}`);
    if (!/CONNECTED/i.test(text)) throw new Error(`Unexpected reply: ${text}`);
    return `${res.modelUsed}: ${text}`;
  });

  await check("Tool calling", async () => {
    const tools = [{
      name: "calculator",
      description: "Evaluates arithmetic.",
      input_schema: {
        type: "object",
        properties: { expression: { type: "string" } },
        required: ["expression"]
      }
    }];
    const res = await callUniversalLLM(
      [{ role: "user", content: "Use the calculator tool for 7*8. Do not answer directly." }],
      "You are testing tool calling.",
      tools
    );
    const call = (res.content || []).find(part => part.type === "tool_use");
    if (!call) throw new Error("No tool_use block returned");
    return `${call.name} ${JSON.stringify(call.input)}`;
  });

  await check("RAG fallback", async () => {
    await rag.ingestText("local qwen ollama impeccable ruflo gstack health check", { source: "health-check-local" });
    const hits = await rag.semanticSearch("qwen ollama gstack", 2);
    if (!hits.length) throw new Error("No RAG hits");
    return `${hits.length} hit(s), top source: ${hits[0].metadata.source}`;
  });

  for (const item of report) {
    console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
  }

  if (report.some(item => !item.ok)) process.exit(1);
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
