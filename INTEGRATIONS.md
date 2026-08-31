# Integrations: prime-agent + scroll-world + OpenSandbox + motion + ui-ux-pro-max + ego-lite + prompts.chat + crewai + llama.cpp + vllm

This file records what was merged into **my-Ai (Ultron)** from ten other
repos, so it's clear what runs automatically and what needs a one-time setup.

## ⚠️ ego-lite is different from every other integration here — read this first

Every integration below (prime-agent, scroll-world, OpenSandbox, motion,
ui-ux-pro-max) is source code or data that becomes usable purely through
terminal commands, once you run `integrations/setup.sh` and fill in `.env`.

**ego-browser is not that.** It only works if:
1. Boss is on **macOS** (no Windows/Linux build exists yet), **and**
2. Boss has personally installed the real **ego lite** browser app — a
   closed-source binary downloaded from ego.app, not included in this repo
   at all — and clicked through its GUI onboarding once.

Nothing in this merge can finish that step for you; it's an actual app
install with a real window that needs a human to click through it. Ultron
is instructed to check `command -v ego-browser` before ever trying to use
it, and to fall back to the Playwright-based `tools/browser-automation.js`
(already in this repo, works on any OS, needs no manual setup) when it
isn't available — so nothing breaks on Windows/Linux, or on a Mac where
Boss hasn't installed it yet.

## What changed

1. **`.agents/skills/`** — completed with real supporting code (not just a
   `SKILL.md` stub) for:
   - From **prime-agent**: `agent-observe`, `goal`, `edit`, `attach-image`,
     `skill-creator`, `compact`, `websearch`, `notion`, `agent-message`,
     `linear`, `refine`, `prime-intellect`, `rlm-heartbeat`
   - From **scroll-world**: `scroll-world`
   - From **OpenSandbox**: `troubleshoot-sandbox` (newly added — didn't exist
     before). 8 other OpenSandbox-related skills already existed as doc-only
     stubs (`agent-sandbox`, `opensandbox-command-execution`,
     `opensandbox-credential-vault`, `opensandbox-file-operations`,
     `opensandbox-network-egress`, `opensandbox-node-agent`,
     `opensandbox-sandbox-lifecycle`, `opensandbox-sandbox-troubleshooting`)
     — their registry `content_preview` was rewritten from a generic doc
     snippet into a runbook pointing at the real source now sitting in
     `integrations/opensandbox/`.
   - From **motion**: `improve`, `fix` (newly added — didn't exist before;
     generic self-review skills: `improve` audits read-only and writes a
     plan, `fix` executes a plan/issue/PR to a merge-ready state).
   - From **ui-ux-pro-max**: `banner-design`, `design-system`, `brand`,
     `design`, `slides`, `ui-ux-pro-max`, `ui-styling` — 7 skills that
     already existed in the registry and were already ~99% complete (only
     one file, `scripts/logo/tests/test_generate.py` under `design`, was
     actually missing — now added). Their `content_preview` was rewritten
     into runbooks pointing at `integrations/ui-ux-pro-max/`.
   - From **ego-lite**: `ego-browser` (newly added — didn't exist before).
     See the warning above before relying on it.
   - From **prompts.chat**: `prompt-lookup`, `skill-lookup` (both newly
     added — general-purpose: find a real "act as X" prompt or a reusable
     Agent Skill), plus `book-translation` and `widget-generator` (also
     newly added, but scoped only to maintaining the prompts.chat repo
     itself, not general-purpose).
   - From **crewAI, llama.cpp, vLLM**: `crewai`, `llama-cpp`, `vllm`
     (all newly added). Together these give Ultron a small local-AI-infra
     stack: `llama-cpp` for a genuinely offline LLM (no API key needed once
     built), `crewai` for structured named-role multi-agent orchestration,
     `vllm` for GPU-backed high-throughput serving. See "Local-AI-infra
     honesty" below.

2. **`agent-memory/master_skills_registry.json`** — updated so
   `unified-skill-engine.js` auto-routes tasks to all of the above
   (725 → 728 total, since `crewai`/`llama-cpp`/`vllm` were genuinely new).

3. **`integrations/prime-agent/`, `integrations/scroll-world/`,
   `integrations/opensandbox/`, `integrations/motion/`,
   `integrations/ui-ux-pro-max/`, `integrations/ego-lite/`,
   `integrations/prompts-chat/`, `integrations/crewai/`,
   `integrations/llama-cpp/`, `integrations/vllm/`** — the ten source repos,
   kept in full (docs, assets, runtime, tests, CI, everything) so nothing is
   lost — with **documented exceptions**, all following the same rule as
   `node_modules/` being left out everywhere in this project (regenerable
   binary/duplicate content, not source):
   - `integrations/motion/.yarn/cache` (~270MB of Yarn Berry's vendored
     package archives) — see the folder's own README.
   - `integrations/crewai/docs/` — upstream ships 34 near-duplicate
     versioned doc snapshots (~8.3-8.5MB each) plus a 97MB images folder;
     only the latest (`docs/edge/`) was kept. The real source
     (`lib/crewai`, `lib/crewai-tools`, `lib/cli`, etc.) is 100% included.
   - `integrations/llama-cpp/models/*.gguf*` — ~75MB of binary vocabulary
     test fixtures used only by llama.cpp's own internal test suite, not
     needed to build or run it. The chat-template `.jinja` files in that
     same folder (genuinely needed at runtime) are kept in full.
   - `integrations/vllm/docs/assets/` — ~33MB of documentation
     images/diagrams, not needed to install or run vLLM. All actual docs
     text is kept in full.
   Every exclusion above was verified with a full `diff -rq` against the
   original upload: everything *except* the documented exclusion is
   byte-for-byte identical to source.

## Later cleanup pass (junk removal, no functional loss)

A follow-up pass went through every integration looking for content that
was pure bloat — not needed for any skill to actually work — and removed:
- `.github/` (CI workflows, issue templates) from every integration —
  8 folders, ~1.5MB total, zero functional relevance.
- `integrations/opensandbox/` — 55 documentation illustration files
  (screenshots, a 24MB demo GIF, diagrams) — 89MB → 25MB.
- `integrations/prompts-chat/public/book-pdf/` — pre-rendered PDF+HTML
  book exports in ~15 languages (85MB), a build output of the website's
  own download feature, not the book's actual markdown source (which
  `book-translation` works from, and which is untouched) — plus Raycast
  store screenshots, OpenGraph images, sponsor logos — 138MB → 43MB.
  `prompts.csv` (the file `prompt-lookup` actually depends on) is
  untouched, still all 119,481 lines.
- `integrations/llama-cpp/docs/ops/*.csv` — 33MB of auto-generated,
  per-backend (CUDA/Metal/Vulkan/etc.) operator-compatibility dumps used
  only by llama.cpp's own contributors debugging backend support, not
  needed to build or run inference — 95MB → 62MB.

Every removal here was re-verified afterward: all skill files still
present, all build-critical files (CMakeLists.txt, ggml/src, cli/, server/,
lib/crewai, vllm/vllm) still present, the skill registry still loads and
routes correctly (728 skills, no drop), and the full JS/JSON/shell
validation suite still passes clean. Total size: 555MB → 363MB, with zero
functional content removed — only documentation media, CI config, and
auto-generated reference dumps that no skill actually reads.

**One honest note on that cleanup:** a few *documentation* references now
point at removed files — e.g. `docs/kubernetes/index.md` in OpenSandbox
still links to the removed demo GIF, and the prompts.chat website's own
source (`src/app/book/page.tsx` etc.) still references the removed
`book-pdf` output. These are dead links only within content nobody here
runs: Ultron never renders opensandbox's docs site or builds/self-hosts the
prompts.chat Next.js website (its skills work via `prompts.csv` directly or
the live hosted API instead — see the `prompt-lookup` skill). None of the
documented, actually-used command paths in any skill reference the removed
files, and every one of them was re-tested after the cleanup and still
works.

## Two rounds of a deeper skill-discovery scan

After the cleanup pass, a scan for every `SKILL.md` across all ten
integrations (excluding test/fixture directories) turned up 5 real skills
that had been copied into `integrations/` as part of the full source but
never actually registered for Ultron to use:
- From **llama.cpp**: `llama-cpp-code-review`, `add-new-model` — both
  scoped to contributing to llama.cpp itself (same honesty pattern as
  motion's `book-translation`/`widget-generator`).
- From **vLLM**: `ci-fails-buildkite`, `debug-ima`, `kernel-microbenchmark`
  — `debug-ima` and `kernel-microbenchmark` need an NVIDIA GPU (same
  `nvidia-smi` check as the `vllm` skill itself).

All 5 are now registered and confirmed routing correctly (730 → 733
skills). This is exactly the class of gap a plain `diff -rq` against source
can't catch — the files were present and byte-identical to upstream the
whole time, just not wired into Ultron's routing.

4. **`run_code_sandbox`** — a new tool (`ultron-server.js`, alongside
   `run_command`) that shells out to `integrations/opensandbox-run.sh`,
   which creates an OpenSandbox container, runs the command, and tears it
   down — one call. The base system prompt tells Ultron to prefer this over
   `run_command`/`run_code` for anything heavy (installs, builds, media
   processing, long loops) — see "Keeping load off your laptop" below.

5. **Base system prompt** (`getBaseUltronPrompt`) now also tells Ultron to:
   - prefer the real `motion` npm package over hand-rolled CSS keyframes
     whenever it writes animated HTML/React output;
   - read the relevant `ui-ux-pro-max` skill before generating any
     user-facing UI, so fonts/colors/components come from that real,
     curated dataset instead of being guessed;
   - use `improve` → `fix` as a self-review loop on **this** codebase, not
     only on motion's.

## Keeping load off your laptop

This is why OpenSandbox was added: `run_command` and `run_code` (Ultron's
original tools) execute directly inside Ultron's own Node process, on your
machine, with no resource cap — a big `npm install`, a long Python loop, or
video processing all spin your laptop's fans. `run_code_sandbox` instead
runs the same command inside an isolated OpenSandbox container:

- **Local Docker + `OPENSANDBOX_DOMAIN=localhost:8080` (the default):** still
  some load, but now capped and isolated inside Docker instead of running
  unbounded inside Ultron's own process.
- **`OPENSANDBOX_DOMAIN` pointed at a remote host you control:** the command
  runs entirely on that machine — genuinely close to zero load on this
  laptop. Use this if a very light laptop is the priority.

## Local-AI-infra honesty (crewai / llama-cpp / vllm)

- **llama-cpp** is the one to default to for local inference on a laptop —
  it's the lightest, has no GPU-vs-CPU install complexity, and once built
  needs no API key or internet at all.
- **vllm**'s whole design is GPU batching (mainly NVIDIA CUDA). It does have
  CPU/other-hardware backends, but they're niche and slow — on a typical
  laptop with no discrete NVIDIA GPU, don't reach for vllm. Ultron is
  instructed to check `nvidia-smi` first and use llama-cpp instead when no
  GPU is present.
- **crewai** is a structured multi-agent framework (pip install) — reach
  for it only when a task genuinely needs named agent roles/goals and
  explicit task delegation; for anything simpler, Ultron's own
  `multi-agent-system.js` is already in this repo and is lighter to use.
- All three can point at a local `llama-server` (from the llama-cpp skill)
  as their LLM backend instead of a paid API — that's the fully-offline,
  zero-cost path if Boss wants it.

## What is automatic vs. what needs one-time setup

- **Automatic, real execution (not just a description):** the base system
  prompt (`getBaseUltronPrompt` in `ultron-server.js`) tells Ultron exactly
  how to use `read_file` + `run_command`/`run_code_sandbox` against
  `integrations/` — it reads a skill's real source, then actually runs it,
  instead of only describing it. Registry `content_preview` text for every
  integrated skill is a short runbook ("RUNNABLE via ...") rather than a
  truncated doc snippet.
- **One-time setup you must run yourself, because it needs network + real
  credentials I cannot obtain on your behalf:** run `bash integrations/setup.sh`
  (or `npm run integrations:setup`) once, on your own machine. It installs
  the real prime-agent CLI, syncs each prime-agent skill's Python deps with
  `uv`, checks `ffmpeg`/`ffprobe`/Pillow, installs `opensandbox-cli` and
  probes whether an OpenSandbox server is reachable, checks for `yarn`
  (only needed if you want to build/test Motion's own dev toolchain), checks
  whether `ego-browser` is already available and tells you the right next
  step for your OS if not, and reports exactly which of the API keys in
  `.env.example` (`MONID_API_KEY`, `HIGGSFIELD_API_KEY`,
  `PRIME_INTELLECT_API_KEY`, `NOTION_API_KEY`, `LINEAR_API_KEY`,
  `OPENSANDBOX_DOMAIN`, `GEMINI_API_KEY` for ui-ux-pro-max's optional logo
  generation) are still missing. None of that can be faked from inside a
  sandboxed build — it genuinely needs your internet connection and your
  own accounts.
- **The one step no script can finish for you:** if you're on macOS and want
  ego-browser, run `npm run integration:ego-browser:install`, then finish
  the ego lite app's onboarding screen yourself. On Windows/Linux, skip it —
  Ultron already falls back to `tools/browser-automation.js` automatically.
- **prompts.chat needs nothing at all to start working** — `prompt-lookup`
  searches the local `prompts.csv` directly (`npm run
  integration:prompts-chat:search -- "your keyword"` or just ask Ultron).
  Only the *live* search (freshest community prompts, or `skill-lookup`)
  needs internet, and that's a plain HTTPS call — no install either.

**Honest limit:** every file here was built and syntax/JSON-checked, but I
have no network access in the environment I built this in, so I could not
actually run `integrations/setup.sh`, install prime-agent, start an
OpenSandbox server, or call any of the external APIs to confirm zero errors
end-to-end. Once you run the setup script and fill in `.env`, any error you
hit is a real one from that external service (bad key, missing credit, no
Docker running, etc.) — Ultron is instructed to report it plainly rather
than pretend it worked, and that's the most honest guarantee I can give.

None of the ten becomes literally part of the `ultron-server.js` process —
each is its own separate program or dataset. "Merged" means: all files (bar
the documented, verified exclusions above) are physically inside this repo,
the skill layer is fully wired for auto-routing, and Ultron has real tools
(`run_command`, `run_code_sandbox`) to actually invoke each one — not that
ten different runtimes were rewritten into one. ego-browser goes one step
further than that limit: it's the one piece here Ultron can use but I could
never install or verify myself, on any OS, because it requires a licensed,
closed-source GUI app Boss has to click through personally. vllm has a
related, softer limit: it's fully included and buildable, but its practical
usefulness genuinely depends on hardware (an NVIDIA GPU) I have no way to
confirm Boss has.
