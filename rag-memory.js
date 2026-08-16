/**
 * ============================================================================
 *  RAG + VECTOR MEMORY — semantic search over documents & conversation history
 * ============================================================================
 *
 * WHY THIS OVER FLAT FILE-BASED MEMORY:
 *   Flat memory files (memory.md) grow unbounded and pollute the context window.
 *   Vector memory stores numerical embeddings per chunk, allowing high-precision
 *   semantic retrieval of the top-K relevant paragraphs across thousands of
 *   ingested document pages or long-term conversation memories.
 *
 * EMBEDDINGS PROVIDER: Voyage AI (Anthropic's recommended partner).
 *   Model: voyage-3-lite (or voyage-3).
 *
 * DEPENDENCIES:
 *   npm install pdf-parse
 *
 * USAGE:
 *   node rag-memory.js ingest ./docs/my-notes.pdf
 *   node rag-memory.js search "how does attendance tracking work"
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-3-lite";
const STORE_PATH = path.join(__dirname, "agent-memory", "vector-store.json");
const CHUNK_SIZE = 800; // characters per chunk
const CHUNK_OVERLAP = 100; // overlap between sequential chunks

// ---------------------------------------------------------------------------
// EMBEDDING API CLIENT
// ---------------------------------------------------------------------------
async function embed(texts) {
  if (!VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY is not set. Get a free API key at https://www.voyageai.com");
  }

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: Array.isArray(texts) ? texts : [texts],
      model: VOYAGE_MODEL,
    }),
  });

  const data = await res.json();
  if (!data.data) {
    throw new Error(`Voyage AI embedding failed: ${JSON.stringify(data)}`);
  }
  return data.data.map((d) => d.embedding);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

// ---------------------------------------------------------------------------
// VECTOR STORE (Persisted JSON)
// ---------------------------------------------------------------------------
function loadStore() {
  if (!fs.existsSync(STORE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function chunkText(text) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// INGESTION (Text, PDFs, Markdown, JSON, Code)
// ---------------------------------------------------------------------------
async function ingestText(text, metadata = {}) {
  const cleanText = text.trim();
  if (!cleanText) return { chunksAdded: 0 };

  const chunks = chunkText(cleanText);
  const embeddings = await embed(chunks);
  const store = loadStore();

  chunks.forEach((chunk, i) => {
    store.push({
      id: `${metadata.source || "doc"}-${Date.now()}-${i}`,
      text: chunk,
      embedding: embeddings[i],
      metadata: { ...metadata, chunkIndex: i, ingestedAt: new Date().toISOString() },
    });
  });

  saveStore(store);
  return { chunksAdded: chunks.length };
}

async function ingestFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  let text = "";
  const ext = path.extname(resolved).toLowerCase();

  if (ext === ".pdf") {
    let pdfParse;
    try {
      pdfParse = require("pdf-parse");
    } catch {
      throw new Error("pdf-parse is required for PDF ingestion. Run: npm install pdf-parse");
    }
    const buffer = fs.readFileSync(resolved);
    const data = await pdfParse(buffer);
    text = data.text;
  } else {
    text = fs.readFileSync(resolved, "utf-8");
  }

  return await ingestText(text, { source: path.basename(resolved), fullPath: resolved });
}

async function rememberConversationTurn(summary, tags = []) {
  return await ingestText(summary, { source: "conversation-memory", type: "memory", tags });
}

// ---------------------------------------------------------------------------
// RETRIEVAL & SEARCH
// ---------------------------------------------------------------------------
async function semanticSearch(query, topK = 5) {
  const store = loadStore();
  if (store.length === 0) return [];
  if (!VOYAGE_API_KEY) {
    console.warn("⚠️ VOYAGE_API_KEY not set — skipping semantic search.");
    return [];
  }

  const [queryEmbedding] = await embed([query]);

  const scored = store.map((entry) => ({
    ...entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(({ text, metadata, score }) => ({ text, metadata, score }));
}

// ---------------------------------------------------------------------------
// CONTEXT INJECTION BUILDER FOR ACTOR
// ---------------------------------------------------------------------------
async function buildRagContext(taskDescription, topK = 3) {
  if (!VOYAGE_API_KEY) return "";
  try {
    const results = await semanticSearch(taskDescription, topK);
    if (results.length === 0) return "";
    return (
      "\nRELEVANT RETRIEVED CONTEXT FROM KNOWLEDGE BASE:\n" +
      results
        .map((r, i) => `[${i + 1}] (Source: ${r.metadata.source || "doc"}, Score: ${r.score.toFixed(3)})\n${r.text}`)
        .join("\n\n") +
      "\n"
    );
  } catch (err) {
    console.warn(`[RAG Warning]: ${err.message}`);
    return "";
  }
}

module.exports = {
  ingestText,
  ingestFile,
  semanticSearch,
  buildRagContext,
  rememberConversationTurn,
};

// ---------------------------------------------------------------------------
// CLI RUNNER
// ---------------------------------------------------------------------------
if (require.main === module) {
  (async () => {
    const [, , command, arg] = process.argv;

    if (!command) {
      console.log("Usage:\n  node rag-memory.js ingest <file-path>\n  node rag-memory.js search <query-string>");
      process.exit(0);
    }

    if (!VOYAGE_API_KEY) {
      console.error("❌ Set VOYAGE_API_KEY in your environment (get one at https://www.voyageai.com)");
      process.exit(1);
    }

    if (command === "ingest") {
      if (!arg) {
        console.error("Provide a file path to ingest: node rag-memory.js ingest ./path/to/file");
        process.exit(1);
      }
      console.log(`⏳ Ingesting: ${arg}...`);
      const result = await ingestFile(arg);
      console.log(`✅ Ingestion complete: ${result.chunksAdded} chunks embedded & saved to vector store.`);
    } else if (command === "search") {
      if (!arg) {
        console.error("Provide a search query: node rag-memory.js search \"your query\"");
        process.exit(1);
      }
      console.log(`🔍 Searching knowledge base for: "${arg}"...`);
      const results = await semanticSearch(arg);
      console.log(`\nFound ${results.length} relevant chunks:\n`);
      results.forEach((r, i) => {
        console.log(`[${i + 1}] Score: ${r.score.toFixed(3)} | Source: ${r.metadata.source}`);
        console.log(`----------------------------------------------------------------`);
        console.log(r.text.trim());
        console.log(`\n`);
      });
    } else {
      console.log(`Unknown command: ${command}`);
    }
  })();
}
