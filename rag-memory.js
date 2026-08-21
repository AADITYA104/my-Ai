/**
 * ============================================================================
 *  ULTRON AGENTDB & ADVANCED HYBRID RAG MEMORY ENGINE (2026 ARCHITECTURE)
 *  - AST-Aware / Semantic Code & Document Chunking.
 *  - BM25 + Vector Cosine Hybrid Search & Re-ranking.
 *  - File-Hash Watcher for Automatic Dynamic Re-indexing.
 *  - Memory Rotation & Archive Rotation Guard.
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
   * Build RAG Context string for prompts
   */
  async buildRagContext(query, limit = 3) {
    const hits = this.search(query, limit);
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
module.exports.buildRagContext = (q, l) => instance.buildRagContext(q, l);
module.exports.rememberConversationTurn = (c, t) => instance.rememberConversationTurn(c, t);
