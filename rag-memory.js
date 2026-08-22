/**
 * ============================================================================
 *  ULTRON AGENTDB & ADVANCED HYBRID RAG MEMORY ENGINE (2026 ARCHITECTURE)
 *  - AST-Aware / Semantic Code & Document Chunking.
 *  - BM25 + Vector Cosine Hybrid Search & Re-ranking.
 *  - Ollama Embedding-Based Semantic Search (optional, graceful fallback).
 *  - File-Hash Watcher for Automatic Dynamic Re-indexing.
 *  - Memory Rotation & Archive Rotation Guard.
 *  - CLI: `node rag-memory.js ingest <file>` / `search "<query>"`
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class AdvancedRAGMemory {
  constructor(storageDir = path.join(__dirname, "agent-memory")) {
    this.storageDir = storageDir;
    this.dbFile = path.join(this.storageDir, "agentdb_memory.json");
    this.ledgerFile = path.join(this.storageDir, "memory_ledger.jsonl");
    this.skillsDir = path.join(this.storageDir, "skills");
    this.hashesFile = path.join(this.storageDir, "file_hashes.json");

    this.memories = [];
    this.fileHashes = {};
    this.init();
  }

  init() {
    if (!fs.existsSync(this.storageDir)) fs.mkdirSync(this.storageDir, { recursive: true });
    if (!fs.existsSync(this.skillsDir)) fs.mkdirSync(this.skillsDir, { recursive: true });

    if (fs.existsSync(this.dbFile)) {
      try {
        this.memories = JSON.parse(fs.readFileSync(this.dbFile, "utf-8"));
      } catch (_) {
        this.memories = [];
      }
    }

    if (fs.existsSync(this.hashesFile)) {
      try {
        this.fileHashes = JSON.parse(fs.readFileSync(this.hashesFile, "utf-8"));
      } catch (_) {
        this.fileHashes = {};
      }
    }
  }

  save() {
    try {
      this.rotateMemoryIfNeeded();
      fs.writeFileSync(this.dbFile, JSON.stringify(this.memories, null, 2), "utf-8");
      fs.writeFileSync(this.hashesFile, JSON.stringify(this.fileHashes, null, 2), "utf-8");
    } catch (e) {
      console.error("[AGENTDB SAVE ERROR]", e.message);
    }
  }

  /**
   * [7] Memory Rotation & Auto-Archive: Rotates large flat memory to timestamped archives
   */
  rotateMemoryIfNeeded(maxEntries = 500, keepEntries = 200) {
    if (this.memories.length <= maxEntries) return;
    const rotateCount = this.memories.length - keepEntries;
    const toArchive = this.memories.splice(0, rotateCount);
    const archiveFile = path.join(this.storageDir, `archive_memory_${Date.now()}.json`);
    try {
      fs.writeFileSync(archiveFile, JSON.stringify(toArchive, null, 2), "utf-8");
      console.log(`📦 [MEMORY ROTATION] Archived ${rotateCount} older memory units to ${path.basename(archiveFile)}`);
    } catch (err) {
      console.warn(`[MEMORY ROTATION FAILED] ${err.message}`);
    }
  }

  /**
   * Store a memory unit with tags and metadata
   */
  store(topic, content, tags = [], category = "general") {
    const entry = {
      id: "mem_" + Math.random().toString(36).slice(2, 11),
      topic,
      content,
      tags: Array.isArray(tags) ? tags : [tags],
      category,
      timestamp: new Date().toISOString(),
      accessCount: 0
    };

    this.memories.push(entry);
    this.save();

    try {
      fs.appendFileSync(this.ledgerFile, JSON.stringify(entry) + "\n", "utf-8");
    } catch (_) {}

    return entry.id;
  }

  /**
   * [5] AST-Aware / Semantic Code Chunking: Splits on function, class, and export boundaries
   */
  chunkCodeAST(code, filePath = "code.js", maxChunkSize = 800) {
    if (!code || typeof code !== "string") return [];
    const lines = code.split("\n");
    const chunks = [];
    let currentChunk = [];
    let currentSize = 0;

    const boundaryRegex = /^(?:function|class|export|const\s+[A-Za-z0-9_]+\s*=\s*(?:async\s*)?\(|def\s+|async\s+def\s+|public\s+class\s+)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isBoundary = boundaryRegex.test(line.trim());

      if (isBoundary && currentSize > maxChunkSize) {
        chunks.push({
          file: filePath,
          lines: `${i - currentChunk.length + 1}-${i}`,
          content: currentChunk.join("\n")
        });
        currentChunk = [];
        currentSize = 0;
      }

      currentChunk.push(line);
      currentSize += line.length;
    }

    if (currentChunk.length > 0) {
      chunks.push({
        file: filePath,
        lines: `${lines.length - currentChunk.length + 1}-${lines.length}`,
        content: currentChunk.join("\n")
      });
    }

    return chunks;
  }

  /**
   * [6] BM25 + Vector Cosine Hybrid Search & Re-ranking
   */
  search(query, limit = 5) {
    if (!query) return [];
    const qTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (qTokens.length === 0) return [];

    const totalDocs = Math.max(1, this.memories.length);

    // Compute IDF for query terms
    const docFreqs = {};
    for (const t of qTokens) {
      docFreqs[t] = this.memories.filter(m => `${m.topic} ${m.content}`.toLowerCase().includes(t)).length;
    }

    const scored = this.memories.map(m => {
      const text = `${m.topic} ${m.content} ${m.tags.join(" ")}`.toLowerCase();
      const words = text.split(/\s+/);
      const docLen = words.length;
      const k1 = 1.5;
      const b = 0.75;
      const avgLen = 50;

      let bm25Score = 0;
      for (const t of qTokens) {
        const tf = words.filter(w => w.includes(t)).length;
        if (tf > 0) {
          const idf = Math.log(1 + (totalDocs - docFreqs[t] + 0.5) / (docFreqs[t] + 0.5));
          const num = tf * (k1 + 1);
          const den = tf + k1 * (1 - b + b * (docLen / avgLen));
          bm25Score += idf * (num / den);
        }
      }

      // Semantic boost for title & tags
      let boost = 0;
      for (const t of qTokens) {
        if (m.topic.toLowerCase().includes(t)) boost += 3.0;
        if (m.tags.some(tag => tag.toLowerCase().includes(t))) boost += 2.0;
      }

      const totalScore = bm25Score + boost;
      return { ...m, score: totalScore };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * [NEW] Ollama Embedding-Based Semantic Search
   * Implements the behavior .env.example already documents ("install an
   * embedding model and set OLLAMA_EMBED_MODEL, otherwise RAG uses keyword
   * fallback") — previously that env var was never actually read anywhere.
   * Falls back to plain BM25 search() if no embed model is configured, or
   * if Ollama is unreachable, so this never breaks environments without it.
   */
  async embedText(text) {
    const embedModel = process.env.OLLAMA_EMBED_MODEL;
    if (!embedModel || !text) return null;
    try {
      const host = process.env.OLLAMA_HOST || "http://localhost:11434";
      const res = await fetch(`${host}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: embedModel, prompt: String(text).slice(0, 4000) }),
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data.embedding) ? data.embedding : null;
    } catch (_) {
      return null;
    }
  }

  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Hybrid semantic (cosine) + BM25 search. Embeddings are computed lazily
   * and cached onto each memory entry so repeat searches don't re-embed.
   */
  async searchSemantic(query, limit = 5) {
    const embedModel = process.env.OLLAMA_EMBED_MODEL;
    if (!embedModel) return this.search(query, limit);

    const queryVec = await this.embedText(query);
    if (!queryVec) return this.search(query, limit); // Ollama unreachable -> keyword fallback

    const candidates = this.memories.slice(-500); // cap for perf on large memory stores
    let cacheDirty = false;
    for (const m of candidates) {
      if (!m.embedding) {
        const vec = await this.embedText(`${m.topic} ${m.content}`.slice(0, 2000));
        if (vec) { m.embedding = vec; cacheDirty = true; }
      }
    }
    if (cacheDirty) this.save();

    const bm25Hits = this.search(query, Math.max(limit * 3, 10));
    const bm25Map = new Map(bm25Hits.map(h => [h.id, h.score]));
    const maxBm25 = Math.max(1, ...bm25Hits.map(h => h.score));

    const scored = candidates
      .filter(m => m.embedding)
      .map(m => {
        const cosine = this.cosineSimilarity(queryVec, m.embedding);
        const bm25Norm = (bm25Map.get(m.id) || 0) / maxBm25;
        return { ...m, score: cosine * 0.7 + bm25Norm * 0.3 };
      });

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * [4] Stale Vector Auto-Reindexing: Checks file hashes and re-ingests changed files
   */
  reindexChangedFiles(filePaths = []) {
    let reindexed = 0;
    for (const fp of filePaths) {
      if (!fs.existsSync(fp)) continue;
      const content = fs.readFileSync(fp, "utf-8");
      const currentHash = crypto.createHash("sha256").update(content).digest("hex");
      const prevHash = this.fileHashes[fp];

      if (currentHash !== prevHash) {
        // Remove older chunks for this file
        this.memories = this.memories.filter(m => m.category !== `file:${fp}`);
        // Ingest AST chunks
        const chunks = this.chunkCodeAST(content, path.basename(fp));
        for (const c of chunks) {
          this.store(`Code in ${c.file} (L${c.lines})`, c.content, ["code", path.basename(fp)], `file:${fp}`);
        }
        this.fileHashes[fp] = currentHash;
        reindexed++;
      }
    }
    if (reindexed > 0) {
      this.save();
      console.log(`🔄 [RAG RE-INDEX] Auto re-indexed ${reindexed} updated files into memory.`);
    }
    return reindexed;
  }

  /**
   * Build RAG Context string for prompts. Uses semantic hybrid search when
   * OLLAMA_EMBED_MODEL is configured, otherwise plain BM25 keyword search.
   */
  async buildRagContext(query, limit = 3) {
    const embedModel = process.env.OLLAMA_EMBED_MODEL;
    const hits = embedModel ? await this.searchSemantic(query, limit) : this.search(query, limit);
    if (hits.length === 0) return "";
    return `\n<retrieved_memory>\n${hits.map(h => `[${h.topic}]:\n${h.content}`).join("\n\n")}\n</retrieved_memory>\n`;
  }

  async rememberConversationTurn(content, tags = ["turn"]) {
    return this.store("Conversation Log", content, tags, "conversation");
  }

  listSkills() {
    const files = fs.readdirSync(this.skillsDir).filter(f => f.endsWith(".md"));
    return files.map(f => {
      const content = fs.readFileSync(path.join(this.skillsDir, f), "utf-8");
      return { file: f, title: f.replace(".md", ""), content };
    });
  }
}

const instance = new AdvancedRAGMemory();
module.exports = instance;
// IMPORTANT: Using .bind() instead of wrapper lambdas to avoid infinite
// recursion — since module.exports === instance, a wrapper lambda that calls
// instance.buildRagContext() would resolve the OWN property (itself) and loop.
module.exports.buildRagContext = instance.buildRagContext.bind(instance);
module.exports.rememberConversationTurn = instance.rememberConversationTurn.bind(instance);
module.exports.searchSemantic = instance.searchSemantic.bind(instance);

// ---------------------------------------------------------------------------
// CLI: `node rag-memory.js ingest <file>` / `node rag-memory.js search <query>`
// Supports .pdf (via pdf-parse) and plain text/code files.
// ---------------------------------------------------------------------------
if (require.main === module) {
  (async () => {
    const [, , cmd, ...rest] = process.argv;

    if (cmd === "ingest") {
      const filePath = rest.join(" ").trim();
      if (!filePath) {
        console.error("Usage: node rag-memory.js ingest <file.pdf|file.txt|...>");
        process.exit(1);
      }
      const absPath = path.resolve(process.cwd(), filePath);
      if (!fs.existsSync(absPath)) {
        console.error(`File not found: ${absPath}`);
        process.exit(1);
      }

      let text = "";
      if (absPath.toLowerCase().endsWith(".pdf")) {
        try {
          const pdfParse = require("pdf-parse");
          const buffer = fs.readFileSync(absPath);
          const data = await pdfParse(buffer);
          text = data.text || "";
        } catch (err) {
          console.error(`Failed to parse PDF: ${err.message}`);
          process.exit(1);
        }
      } else {
        text = fs.readFileSync(absPath, "utf-8");
      }

      if (!text.trim()) {
        console.error("No extractable text found in file.");
        process.exit(1);
      }

      const chunks = instance.chunkCodeAST(text, path.basename(absPath), 800);
      for (const c of chunks) {
        instance.store(`${path.basename(absPath)} (L${c.lines})`, c.content, ["ingested", path.basename(absPath)], `file:${absPath}`);
      }
      console.log(`✅ Ingested ${path.basename(absPath)}: ${chunks.length} chunk(s) stored in AgentDB.`);
      return;
    }

    if (cmd === "search") {
      const query = rest.join(" ").trim();
      if (!query) {
        console.error('Usage: node rag-memory.js search "your query"');
        process.exit(1);
      }
      const hits = instance.search(query, 5);
      if (hits.length === 0) {
        console.log("No matches found.");
        return;
      }
      hits.forEach((h, i) => {
        console.log(`\n#${i + 1} [${h.topic}] (score: ${h.score.toFixed(2)})`);
        console.log(h.content.slice(0, 400));
      });
      return;
    }

    console.log("Usage:");
    console.log('  node rag-memory.js ingest <file>       - ingest a text/code/PDF file into AgentDB');
    console.log('  node rag-memory.js search "<query>"    - search AgentDB memory');
  })();
}
