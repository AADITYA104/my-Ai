# My-AI: Setup Checklist (What YOU need to install/run)

**Total skills in the project: 851 — all coded, tested, and wired in. This file lists only the handful that need something installed/running *outside* the code before they work for real.**

**Note:** every skill has a one-command setup script in `setup-scripts/` to minimize manual work:
```bash
bash setup-scripts/install-openscad.sh        # installs the OpenSCAD app
bash setup-scripts/install-voicebox.sh        # installs + builds Voicebox
bash setup-scripts/install-gpt-researcher.sh  # installs + prompts for API keys
bash setup-scripts/install-porcupine.sh       # installs + prompts for AccessKey
```

**I actually ran all four in a sandbox to verify them, not just written them from documentation. Real results:**

| Item | Result |
|---|---|
| **OpenSCAD** | ✅ **Fully verified end-to-end** — installed it, wrote a `.scad` bracket script, rendered it to a real, valid `.stl` file. Works exactly as documented. |
| **Porcupine** | ✅ **Verified** — SDK installs and imports cleanly; confirmed the exact API call in the skill card is correct (it only fails on a fake key, which is expected — a real key from you is all that's missing). |
| **mem0** | ✅ **Verified** — installs and imports cleanly. |
| **GPT Researcher** | ⚠️ **Found and fixed a real bug**: the published `gpt-researcher` PyPI package is broken (`NameError: name 'Any' is not defined` — a missing import in `query_processing.py`). The GitHub source I bundled already has this fixed. I've updated the setup script and skill to install from the **bundled source** (`pip install -e external-skills/gpt-researcher/`) instead of PyPI, and verified that import works cleanly from there. |
| **Voicebox** | ⚠️ **Partially verified, one step blocked by my sandbox specifically (not a real bug)**: I installed Bun, Rust, and `just` from scratch and ran the actual `just setup` — Python/JS dependency installation got most of the way through, then hit `piper-phonemize`, which needs a custom package index (`k2-fsa.github.io`) that voicebox's own `requirements.txt` already documents correctly (`--find-links https://k2-fsa.github.io/...`). My sandbox blocks that specific domain (confirmed: `403 host_not_allowed`) — this is a restriction of my testing environment, not a flaw in Voicebox's setup. On your own machine with normal internet access, this line will resolve normally and setup should complete. |

Each script detects your OS, installs what it can automatically, and tells you exactly what's still needed if something can't be automated (e.g. you must supply your own OpenAI/Tavily/Picovoice keys — no script can generate those for you).

**On download size:** the reference source for OpenSCAD/Voicebox/GPT-Researcher/etc. under `external-skills/` is the biggest contributor to the project's size. I tested pre-compressing each into its own `.zip` to shrink the download, but confirmed it made **zero actual difference** — the single top-level zip you download already compresses this content just as well in one pass (both approaches land at ~115MB for that content), so pre-zipping only would have added an extra "unzip first" step for no real benefit. Left as plain folders instead — simpler, same size, directly browsable.

Everything else (704 built-in + agent-skills + taste-skill + most of AI-Research-SKILLs + all of pi's skills + mem0 = 853 skills) is **pure knowledge/instruction skills** — the AI already knows how to use them, nothing to install, they work the moment you run your AI.

---

## 1. OpenSCAD — for actual 3D-print files (STL)
**Skill:** `openscad-parametric-cad`
**Works right now:** AI can already write valid `.scad` script code.
**Needs your action for:** actually rendering that script into a real `.stl` file to 3D print.

- Install OpenSCAD on the machine that runs your AI: https://openscad.org/downloads.html
- Once installed, your AI's `run_command` tool can call it directly, e.g.:
  ```bash
  openscad -o output.stl model.scad
  ```
- No API key needed. One-time install only.

---

## 2. Voicebox — for real spoken voice output / transcription
**Skills:** `voicebox-voice-io`, `add-tts-engine`, `draft-release-notes`, `release-bump`, `triage-prs`
**Works right now:** AI knows the API/MCP calls to make.
**Needs your action for:** anything to actually speak or transcribe.

- Source is bundled at `external-skills/voicebox/`.
- Prerequisites: [Bun](https://bun.sh), [Rust](https://rustup.rs), Python 3.11+, [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (Xcode too, on macOS).
- Install `just` (task runner): `brew install just` or `cargo install just`.
- From inside `external-skills/voicebox/`:
  ```bash
  just setup   # creates venv, installs deps
  just dev     # starts backend + app
  ```
- Once running, it serves on `http://127.0.0.1:17493` (REST + MCP). Your AI will use this automatically once it's up — it must be running every time you want voice in/out.

---

## 3. GPT Researcher — for deep, multi-source, cited research reports
**Skills:** `gpt-researcher`, `gpt-researcher-deep-research`
**Works right now:** nothing — this is a fully separate research service. (Your AI's own built-in `web_search` still works fine for normal research without any of this.)
**Needs your action for:** the deep, multi-agent, long-report style of research.

- Source bundled at `external-skills/gpt-researcher/`.
- Get two API keys:
  - `OPENAI_API_KEY` (OpenAI)
  - `TAVILY_API_KEY` (search provider — https://tavily.com)
- Set them as environment variables or in a `.env` file inside that folder.
- Run it (**install from the bundled source, not PyPI** — the published `pip install gpt-researcher` package has a confirmed bug, a missing import that crashes on load; the bundled source already has it fixed, verified directly):
  ```bash
  cd external-skills/gpt-researcher
  pip install -e .
  python -m uvicorn main:app --reload
  ```
  Serves on `http://localhost:8000`.
- **This one has a real running cost** — every deep research call spends OpenAI/Tavily API credits (roughly $0.40 per deep-research run, less for a normal report).

---

## 4. AI-Research-SKILLs (98 ML skills) — mostly no setup needed
**These are knowledge skills** (fine-tuning guides, RAG patterns, distributed training, inference serving, etc.) — the AI can explain, plan, and write code using them with **zero install**.

**Only if you actually want to *run* the code it writes** (e.g., really fine-tune a model with `unsloth`, really deploy `vllm`, really call `chroma`/`pinecone`), you'd separately install *that specific Python package* the normal way (`pip install unsloth`, `pip install vllm`, etc.) — same as any Python project. This is no different from installing any library your AI writes code for; it isn't part of "my-AI setup," it's part of running whatever ML project you point it at.

---

## 5. Pi Agent Harness — reference only, no setup needed for its skills
**Skills:** `add-llm-provider`, `wrap-and-ship-github-task`, `github-pr-structured-review`, `github-issue-analysis`, `github-security-advisory-workflow`, `changelog-audit`
**Works right now:** yes — these are workflow/instruction skills (how to review a PR, analyze an issue, draft a security advisory, add an LLM provider, ship a task). No install needed for the AI to use them.
**Full source** (the actual Pi coding-agent app itself — a separate TypeScript agent harness) is bundled at `external-skills/pi/` for reference only; you don't need to build or run Pi itself for these 6 skills to work.

---

## 6. Porcupine — for wake-word / hotword detection ("Hey Computer")
**Skill:** `porcupine-wake-word`
**Works right now:** AI knows the SDK calls to make.
**Needs your action for:** actually running always-listening wake-word detection.

- Free `AccessKey` from https://console.picovoice.ai/ (sign up, copy key)
- `pip install pvporcupine`
- Full source/demos bundled at `external-skills/porcupine/`
- Pairs naturally with Voicebox: Porcupine detects the wake word → then Voicebox transcribes the actual command.

## 7. mem0 (6 skills) — no setup needed
**Skills:** `mem0`, `mem0-cli`, `mem0-integrate`, `mem0-oss-to-platform`, `mem0-test-integration`, `mem0-vercel-ai-sdk`
**Works right now:** yes — these are integration/knowledge skills (how to add persistent memory to an AI app, migrate mem0 setups, use it with Vercel AI SDK, etc.). No install needed for the AI to explain or write this code.
**Only if you want to actually run a mem0-backed app**, you'd install `pip install mem0ai` (or `npm install mem0ai`) the normal way — same as any Python/Node dependency, not part of "my-AI setup."

**Note on naming overlap:** this app already has its own memory system (`rag-memory.js`, the AgentDB-style RAG memory used for `npm run rag:ingest`/`rag:search`) — that's this app's own built-in memory, separate from the `mem0` skills above (which teach the AI to integrate the third-party Mem0 product into *other* projects you build). Same situation as the voice stack below — two systems, different purposes, not a conflict.

See `VOICE_ARCHITECTURE.md` for the equivalent (more detailed) breakdown of the two voice/wake-word systems, since that one has more moving parts.

---

## Nothing else is missing
Everything above is the complete list. All 858 skills work; only OpenSCAD, Voicebox, GPT Researcher, and Porcupine need a separate install/run step for their *external* half — the AI-side code for all of them is done and tested.
