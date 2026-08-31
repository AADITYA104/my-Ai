# Hunyuan3D-2 Service -- Setup Guide

## Important -- read this before anything else

`my-Ai` (Node.js) **cannot run this model directly.** Hunyuan3D-2 is a
PyTorch diffusion model that needs an NVIDIA GPU. There is no way to make it
"just work" inside the Node.js agent process -- it has to run as its own
service, on its own machine, and `my-Ai` talks to it over HTTP.

**What this integration actually gives you:**
- `services/hunyuan3d/` -- the full, unmodified Hunyuan3D-2 source (Tencent,
  TENCENT HUNYUAN NON-COMMERCIAL LICENSE -- see `LICENSE` in this folder).
- A `generate_3d_model` tool wired into `autonomous-loop-agent-v7-free.js`
  that calls this service's `/send` + `/status/{uid}` endpoints. **Tested**
  against a mock server matching the real API contract (request/response
  shape, async polling, timeout, error handling) -- all verified working.

**What I could NOT verify or set up for you:**
- Actually running the model. That needs a GPU, which isn't available in
  the environment I built this in. I read the source to get the API
  contract exactly right, but I have never run `api_server.py` itself.
- Installing Python dependencies, PyTorch+CUDA, or compiling the C++/CUDA
  extensions -- these need your actual GPU machine, not this sandbox.
- Downloading the model weights (multiple GB, fetched from HuggingFace at
  first run -- not included in this zip, and not something any code change
  can pre-fetch for you).

## Requirements (from Hunyuan3D-2's own README)

- NVIDIA GPU: **6 GB VRAM** for shape-only generation, **16 GB VRAM** for
  shape + texture.
- Python (a recent 3.x -- Hunyuan3D-2 doesn't pin an exact version; match
  whatever your PyTorch/CUDA install expects).
- CUDA toolkit matching your PyTorch build (install PyTorch from
  https://pytorch.org/ first, following their CUDA-version instructions).

## Install (exact steps, copied from `services/hunyuan3d/README.md`)

```bash
cd services/hunyuan3d

# 1. PyTorch first, matching YOUR CUDA version -- follow pytorch.org, don't
#    just pip install torch blindly or you may get a CPU-only build.

# 2. Everything else
pip install -r requirements.txt
pip install -e .

# 3. Compile the C++/CUDA extensions (texture pipeline needs these)
cd hy3dgen/texgen/custom_rasterizer
python3 setup.py install
cd ../../..
cd hy3dgen/texgen/differentiable_renderer
python3 setup.py install
cd ../../..
```

## Run the service

**Corrected from an earlier mistake:** the command below previously copied
flags from `gradio_app.py`'s README example (`--subfolder`,
`--low_vram_mode`, `--enable_flashvdm`) -- those don't exist on
`api_server.py`'s argparse and would have failed immediately. Verified
against `api_server.py`'s actual `argparse` block this time:

```bash
cd services/hunyuan3d
python3 api_server.py \
  --model_path tencent/Hunyuan3D-2mini \
  --tex_model_path tencent/Hunyuan3D-2 \
  --device cuda \
  --enable_tex
```

Flags `api_server.py` actually supports (confirmed by reading its argparse,
not guessed): `--host` (default `0.0.0.0`), `--port` (default **8081** --
also previously stated incorrectly as 8080, now fixed both here and in the
Node tool's default), `--model_path`, `--tex_model_path`, `--device`,
`--limit-model-concurrency` (default 5), `--enable_tex`.

**`--enable_tex` matters:** without it, the service never loads the texture
pipeline. If `my-Ai` then requests `texture: true`, the service errors on
that job. This is now handled gracefully -- see "Known limitation, now
fixed" below -- but you still need `--enable_tex` on the server if you
actually want textures.

First run downloads model weights from HuggingFace automatically (multi-GB,
needs internet).

## Known limitation in the original code -- now fixed

The stock `api_server.py`'s `/status/{uid}` only checked whether the output
file existed -- it had no way to tell "still processing" apart from
"crashed". If the background generation thread raised an exception (e.g.
`texture: true` without `--enable_tex`), it failed silently and callers
would poll forever until they gave up on their own timeout.

**Fixed in this copy:** background-thread exceptions are now caught and
recorded, and `/status/{uid}` returns `{"status": "error", "message": "..."}`
instead of leaving the job stuck at `"processing"` forever. The Node-side
`generate_3d_model` tool checks for this and fails fast (seconds, not the
5-minute timeout) with the real error message. Verified with a mock server
reproducing this exact failure mode -- see `CHANGES.md` section 13.

## Connect `my-Ai` to it

Set an environment variable before starting `my-Ai` (or the agent process):

```bash
export HUNYUAN3D_API_URL=http://<the-gpu-machine-ip>:<port>
```

Defaults to `http://localhost:8081` if not set (matches `api_server.py`'s
actual `--port` default of 8081, confirmed by reading its argparse) -- fine
if you're running the GPU service on the same machine as `my-Ai`.

## Using it from the agent

The agent can now call `generate_3d_model` as a native tool, same as
`write_file` or `design_audit` -- it decides on its own when a task needs a
3D model. You can also just ask directly, e.g.:

> "Generate a 3D model of a low-poly pine tree"

**What happens if the service isn't running:** the tool returns a clear
`[3D_GEN_UNAVAILABLE]` message pointing back to this file -- it does not
hang, crash, or pretend to succeed.

## API contract (for reference -- read directly from `api_server.py`)

- `POST /send` -- body `{ text: "..." }` or `{ image: "<base64>" }`, plus
  optional `texture` (bool), `seed`, `octree_resolution`,
  `num_inference_steps`, `guidance_scale`, `face_count`. Returns
  `{ uid: "..." }` immediately; generation runs in a background thread.
- `GET /status/{uid}` -- returns `{ status: "processing" }` or
  `{ status: "completed", model_base64: "..." }`.
- `POST /generate` -- synchronous variant of `/send` (blocks until done,
  returns the file directly). The Node tool uses `/send` + polling instead,
  since a long-running GPU job blocking a single HTTP call inside the
  agent's tool loop is riskier than polling.
