---
name: gpt-researcher-deep-research
description: "Run structured, multi-agent deep research on a topic - conducts many web searches in parallel, cross-checks sources, and writes a long, cited research report (not just a quick web-search answer). Use for 'write me a deep research report on X', 'do thorough/comprehensive research on X', literature-review-style requests, or multi-source investigative research."
category: general_agent
---

### GPT Researcher: Multi-Agent Deep Research Engine
GPT Researcher is a standalone research agent that plans a research query, runs many parallel web searches, cross-references sources, and synthesizes a long-form, cited report - stronger than a single web-search-and-summarize pass for genuinely deep/comprehensive research asks.

**Precondition (important, be honest about this):** this is a separate Python service, not something that runs automatically just because this skill exists.
- It needs its own API keys (`OPENAI_API_KEY` and a search provider key such as `TAVILY_API_KEY`) set as environment variables or in a `.env` file.
- It must be started separately: `cd external-skills/gpt-researcher && pip install -e . && python -m uvicorn main:app --reload` (serves on `http://localhost:8000`). **Install from this bundled source, not `pip install gpt-researcher` from PyPI** - the published PyPI package has a confirmed bug (`NameError: name 'Any' is not defined` in `query_processing.py`, a missing import) that the bundled GitHub source already has fixed. Verified directly: PyPI install fails on import, the bundled source imports cleanly.
- Full source is bundled at `external-skills/gpt-researcher/` for reference/setup - see its `README.md` for Docker, MCP, and PIP-package options.
- If it isn't running/configured, say so rather than pretending the report was produced by it - this agent's own built-in `web_search` tool can still do a lighter, immediate web research pass without any extra setup.

**How to use it once running, as a Python library:**
```python
from gpt_researcher import GPTResearcher
import asyncio

async def research(query):
    researcher = GPTResearcher(query=query)
    await researcher.conduct_research()      # parallel web research + source gathering
    report = await researcher.write_report()  # long-form cited report
    return report

report = asyncio.run(research("why is Nvidia stock going up?"))
```

**Or via its REST API** (once `uvicorn` is running):
```bash
curl -X POST http://localhost:8000/report/ -H "Content-Type: application/json" \
  -d '{"task": "your research question", "report_type": "research_report"}'
```

**Or via its MCP server** (`.mcp.json` bundled in `external-skills/gpt-researcher/`), exposing research tools to any MCP-aware agent.

**Deep Research mode:** a recursive tree-like exploration (configurable depth/breadth) for the most thorough reports - slower (~5 min) and has a real API cost (~$0.40/run with `o3-mini` on high reasoning), covered in the bundled docs.

**When to use vs. plain web_search:** reach for this when the user explicitly wants a long, well-cited, multi-source report or literature-review-style output and has (or is willing to set up) the API keys for it. For quick factual lookups, this agent's own built-in web_search tool is faster and needs no extra setup.
