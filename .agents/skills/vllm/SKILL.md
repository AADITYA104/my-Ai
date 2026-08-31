---
name: vllm
description: Self-host a high-throughput, OpenAI-compatible LLM serving engine (vLLM) for many concurrent requests — best on an NVIDIA GPU, works but slow on CPU-only
category: coding_architecture
---

# vllm

Source: `integrations/vllm` (the real, unmodified vLLM Python project).

## Honest hardware reality first — read this before reaching for vLLM

vLLM's entire value (PagedAttention batching, high throughput) is built for
GPU serving, primarily NVIDIA CUDA (AMD/Intel GPU and CPU backends exist but
are far more niche, slower, and each need a different install extra). Most
laptops have no discrete NVIDIA GPU. Practical guidance for Ultron:

- **No dedicated GPU on Boss's machine (the common case):** don't reach for
  vLLM. Use the `llama-cpp` skill instead — it is lighter, has no
  GPU-vs-CPU install-variant complexity, and is the right default for local
  inference on a laptop.
- **Boss explicitly has an NVIDIA GPU and asks for high-throughput local
  serving** (e.g. serving a model to multiple concurrent users/requests, not
  just Boss's own single chat): vLLM is the right tool, use this skill.

Before doing anything with vLLM, check what's actually available:
```
run_command("nvidia-smi 2>/dev/null && echo HAS_NVIDIA_GPU || echo NO_NVIDIA_GPU")
```
If that prints `NO_NVIDIA_GPU`, tell Boss plainly and suggest `llama-cpp`
instead rather than attempting a slow/impractical CPU vLLM install.

## One-time setup (only after confirming a GPU is present, and via
run_code_sandbox — this install is large)

```
run_code_sandbox("pip install vllm", "python:3.12")
```

## Usage

```
# OpenAI-compatible local server:
run_command("nohup vllm serve <model-name> --port 8082 > /tmp/vllm-server.log 2>&1 &")
```

Then it's usable exactly like any other OpenAI-compatible endpoint at
`http://localhost:8082/v1` — including as an LLM backend for the `crewai`
skill.
