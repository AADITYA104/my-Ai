# Local Agent Project Context

This repo should run local-first with Ollama/Qwen.

## Local model

- Primary chat model: `ultron-core`
- Legacy alias: `jarvis`
- Ollama host: `http://localhost:11434`
- GGUF source: `C:/Users/devmu/Downloads/Qwen3.8-27B-UD-IQ2_XXS.gguf`
- Create/update command: `ollama create ultron-core -f Modelfile`

## Imported project roles

- `C:/Users/devmu/Downloads/big project/impeccable-main/impeccable-main`
  - Use for frontend and product design quality.
  - Apply its guidance when building UI: clear hierarchy, responsive checks, accessibility, avoid generic AI-looking palettes, avoid nested cards, use real visual QA where possible.

- `C:/Users/devmu/Downloads/big project/ruflo-main/ruflo-main`
  - Use for agent harness ideas: memory-first task execution, swarm-style specialist roles, hooks, durable task state, and local/Ollama routing.
  - Prefer single-agent ReAct for normal work, then split into specialist passes only when the task is large enough.

- `C:/Users/devmu/Downloads/big project/gstack-main/gstack-main`
  - Use for engineering workflow: plan before broad changes, run review/QA/security style checks, investigate root cause before repeated fixes, and keep delivery shippable.

## Operating pattern

1. Read relevant files before changing code.
2. Break large work into subtasks.
3. Use tools for filesystem, terminal, code execution, and validation.
4. After failures, perform root-cause analysis instead of repeating the same attempt.
5. Store useful patterns in `agent-memory`.
