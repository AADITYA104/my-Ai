# Local Agent Project Context

This repo should run local-first with Ollama/Qwen.

**Note:** this file used to reference one developer's personal Downloads folder
paths (`C:/Users/devmu/...`), which don't exist on any other machine. Fixed
below to reference this project's own portable paths and its skill registry.

## Local model

- Primary chat model: `ultron-core`
- System Name & Identity: `ULTRON`
- Ollama host: `http://localhost:11434`
- GGUF source: `./Qwen3.8-27B-UD-IQ4_XS.gguf` (place your own downloaded GGUF file in the project root with this name, or edit the `FROM` line in `Modelfile` to match whatever file you actually have)
- Create/update command: `ollama create ultron-core -f Modelfile` (or run `setup-local-ultron.ps1`, which checks for the model file first)

## Imported project roles

The guidance from these three source projects is already absorbed into this
project's own skill registry (`agent-memory/master_skills_registry.json` /
`.agents/skills/`) — the AI can pull it up by searching/routing for these
skill names directly, no separate folder needed:

- **`impeccable`** (skill: `.agents/skills/impeccable/SKILL.md`)
  - Use for frontend and product design quality.
  - Apply its guidance when building UI: clear hierarchy, responsive checks, accessibility, avoid generic AI-looking palettes, avoid nested cards, use real visual QA where possible.

- **`ruflo`** and its variants (`ruflo-agent`, `ruflo-agentdb`, `ruflo-doctor`, `ruflo-main`)
  - Use for agent harness ideas: memory-first task execution, swarm-style specialist roles, hooks, durable task state, and local/Ollama routing.
  - Prefer single-agent ReAct for normal work, then split into specialist passes only when the task is large enough.

- **`gstack`** and its variants (`gstack-openclaw-ceo-review`, `gstack-openclaw-investigate`, `gstack-openclaw-office-hours`, `gstack-openclaw-retro`, and others)
  - Use for engineering workflow: plan before broad changes, run review/QA/security style checks, investigate root cause before repeated fixes, and keep delivery shippable.

## Operating pattern

1. Read relevant files before changing code.
2. Break large work into subtasks.
3. Use tools for filesystem, terminal, code execution, and validation.
4. After failures, perform root-cause analysis instead of repeating the same attempt.
5. Store useful patterns in `agent-memory`.
