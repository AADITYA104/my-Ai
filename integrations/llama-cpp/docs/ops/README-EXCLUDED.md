This merge removed docs/ops/*.csv (~33MB) — auto-generated, per-backend
(CUDA/Metal/Vulkan/CANN/etc.) tensor-operator compatibility dumps, produced
by llama.cpp's own test tooling for its own contributors debugging backend
support. Not needed to build llama-cli/llama-server or run inference.
Removed for the same reason as the other size-trims documented in
/INTEGRATIONS.md — auto-generated reference data, not source, and
regenerable from llama.cpp's own test suite if ever needed.
