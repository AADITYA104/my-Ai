---
name: llama-cpp
description: Build and run a fully local, offline LLM (no API key, no internet needed once set up) using llama.cpp, and optionally expose it as an OpenAI-compatible local server
category: coding_architecture
---

# llama-cpp

Source: `integrations/llama-cpp` (the real, unmodified llama.cpp C/C++
project).

## Why this matters for Boss

This is the one integration in this project that gives Ultron a genuine,
fully offline LLM fallback — no API key, no per-token cost, works with no
internet once a model is downloaded. Useful if Boss's usual LLM provider is
down, rate-limited, or for anything Boss wants kept fully local/private.

## One-time setup (build) — do this via run_code_sandbox, not run_command

Compiling a C++ project is exactly the kind of heavy, CPU-spinning work
Ultron should offload (see the "Resource discipline" rule in the base
system prompt). Read `integrations/llama-cpp/docs/build.md` for the full
matrix (CUDA/Metal/Vulkan backends etc.), but the plain CPU build is:

```
run_code_sandbox("cd integrations/llama-cpp && cmake -B build && cmake --build build --config Release -j 4", "gcc:latest")
```

This produces `llama-cli` and `llama-server` binaries under `build/bin/`.

Alternative, lighter path: pre-built binaries exist on llama.cpp's own
GitHub releases page, or a Docker image — see `integrations/llama-cpp/docs/docker.md`
if Boss would rather not compile at all.

## Using it

```
# One-off CLI generation, auto-downloads a small model from Hugging Face:
run_command("./integrations/llama-cpp/build/bin/llama-cli -hf ggml-org/Qwen3.5-0.8B-GGUF -p 'your prompt'")

# OpenAI-compatible local API server (so other tools, including crewAI, can
# point at it like any other LLM provider):
run_command("nohup ./integrations/llama-cpp/build/bin/llama-server -hf ggml-org/Qwen3.5-0.8B-GGUF --port 8081 > /tmp/llama-server.log 2>&1 &")
```

Once `llama-server` is running, it behaves like any OpenAI-compatible
endpoint at `http://localhost:8081/v1` — genuinely usable as a drop-in local
LLM for other integrations in this project (e.g. crewAI) without needing any
external API key.

Chat templates for specific model families are in
`integrations/llama-cpp/models/templates/` if a model's built-in template
needs overriding.
