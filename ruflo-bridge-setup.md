# Connecting real Ruflo to Ultron (my-Ai)

This wires `ultron` up to the **real, unmodified ruflo MCP server** (333 real
tools: `agent_*`, `swarm_*`, `memory_*` with real HNSW vector search,
`hooks_*` self-learning, `config_*`, etc.) — not a rewrite or an "inspired
by" version. This exact sequence was verified end-to-end (install, every
build step, and a live `tools/list` + `memory_store` + `memory_search`
round-trip all succeeded, returning real vector similarity scores).

## Why this is a separate build step (not bundled in the repo)

The built ruflo `node_modules` is **~1.9GB** (25 workspace packages, a
compiled SQLite/HNSW vector store, etc.) — too large to ship inside this
repo. You build it once, on your own machine, and point `RUFLO_MCP_PATH` at
the result. `ultron` talks to it as a normal MCP client over stdio — the
same protocol Claude Code itself uses, so this isn't a hack, it's the
documented integration surface.

## Prerequisites

- Node.js 18+ (already required for this project)
- ~2GB free disk space
- **Windows only:** `better-sqlite3` (used by ruflo's AgentDB) needs to
  compile a native module. Either:
  - a prebuilt binary works for your Node version (often just works, no
    extra install), **or**
  - install "Desktop development with C++" via the Visual Studio Build
    Tools installer if the install step below fails on `better-sqlite3`.

## Build steps (verified)

```bash
# 1. Get the source (from the same ruflo-main.zip you already have, or fresh)
cd path\to\ruflo-main\v3

# 2. Install the full workspace (all 25 @claude-flow/* packages)
npx pnpm install

# 3. Build the core packages the MCP server depends on, in dependency order
npx pnpm -r --filter "./@claude-flow/shared" --filter "./@claude-flow/security" ^
  --filter "./@claude-flow/memory" --filter "./@claude-flow/cli-core" ^
  --filter "./@claude-flow/mcp" --filter "./@claude-flow/neural" ^
  --filter "./@claude-flow/providers" --filter "./@claude-flow/swarm" ^
  --filter "./@claude-flow/hooks" build

# 4. Build the CLI package itself (this contains bin/mcp-server.js)
cd @claude-flow\cli
npx tsc
```

(On macOS/Linux, replace the `^` line continuations with `\`.)

If everything succeeded, this file should now exist:
`v3\@claude-flow\cli\bin\mcp-server.js`

## Wire it up

Add to your `.env` (see `.env.example`):

```
RUFLO_MCP_PATH=C:\full\path\to\v3\@claude-flow\cli\bin\mcp-server.js
```

That's it. `ultron`'s agent loop now has a `ruflo_tool` in its tool list.

## What you get

- `ruflo_tool({ tool_name: "tools_list" })` — lists all 333 real tools
- `ruflo_tool({ tool_name: "memory_store", args: { key, value, namespace } })`
  — real vector-embedded persistent memory (separate from this project's own
  `rag-memory.js` — think of it as a second, more powerful memory backend
  available on demand)
- `ruflo_tool({ tool_name: "memory_search", args: { query, namespace } })`
  — real semantic search with cosine-similarity scores
- `ruflo_tool({ tool_name: "swarm_init", args: {...} })`,
  `agent_spawn`, `hooks_intelligence_*`, `config_*`, and 300+ more — call
  `tools_list` to see full descriptions, since ruflo evolves this set over
  releases.

## What this does NOT give you

- The 98 **Claude Code subagent personas** (`.claude/agents/*.md`) — those
  are prompt/persona definitions built around Claude Code's own subagent
  dispatch (the `Task` tool), which `ultron` doesn't have. The *tools* those
  agents would call (memory, swarm, hooks) are exactly what's bridged above
  — you're just driving them from `ultron`'s own loop instead of Claude
  Code's.
- The Rust federation/watermark crates (`ruflo-federation-peer`,
  `ruflo-agntcy`, `ruflo-watermark`) — small, genuinely Rust, and out of
  scope for this bridge (they handle cross-machine agent federation, which
  isn't part of `ultron`'s current architecture). `cargo build` would be
  needed separately if you want those specifically.
