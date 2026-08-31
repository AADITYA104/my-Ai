---
name: crewai
description: Orchestrate a structured "crew" of specialized AI agents (researcher, writer, reviewer, etc.) for a multi-step task, using the real crewAI Python framework
category: multi_agent_swarm
---

# crewai

Source: `integrations/crewai/lib/crewai` (the real, unmodified crewAI Python
package — pip name `crewai`).

## When to use this instead of Ultron's own multi-agent-system.js

Ultron already has its own lighter multi-agent orchestration
(`multi-agent-system.js`). Reach for crewAI specifically when a task
genuinely benefits from crewAI's structured model: named agents with
distinct `role`/`goal`/`backstory`, explicit `Task` objects assigned to
specific agents, and a `Crew` that runs them sequentially or hierarchically
with built-in memory/delegation. For a quick one-off multi-step task,
Ultron's own system is usually simpler and faster — don't reach for crewAI
by default.

## One-time setup

```
run_command("pip install crewai --break-system-packages")
```
(or better, via run_code_sandbox so this heavy install doesn't load Boss's
laptop directly).

## Basic usage pattern

```python
from crewai import Agent, Task, Crew

researcher = Agent(role="Researcher", goal="...", backstory="...")
writer = Agent(role="Writer", goal="...", backstory="...")

research_task = Task(description="...", agent=researcher, expected_output="...")
write_task = Task(description="...", agent=writer, expected_output="...")

crew = Crew(agents=[researcher, writer], tasks=[research_task, write_task])
result = crew.kickoff()
```

This needs an LLM configured (crewAI defaults to OpenAI-style env vars, but
supports any LiteLLM-compatible provider — including a locally-running
llama.cpp server, see the `llama-cpp` skill, for a fully offline crew).

Run actual crew scripts via `run_code_sandbox` (Python, potentially
long-running) rather than `run_command` directly on Boss's laptop.

## CLI

crewAI also ships a `crewai` CLI (`crewai create crew <name>`, `crewai run`,
etc.) once installed — see `integrations/crewai/lib/cli/README.md`.
