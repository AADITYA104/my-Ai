#!/bin/sh
# ============================================================================
# Ultron integrations setup — run this once on YOUR machine (needs internet).
# It cannot be run inside a sandboxed build environment, only on a real host.
# ============================================================================
set -eu
cd "$(dirname "$0")"

echo "== 1/7  prime-agent CLI (official installer, downloads a real release) =="
if command -v prime-agent >/dev/null 2>&1; then
  echo "   already installed: $(command -v prime-agent)"
else
  sh ./prime-agent/install.sh || echo "   FAILED — see https://github.com/PrimeIntellect-ai/prime-agent for manual install"
fi

echo "== 2/7  prime-agent skill Python deps (goal, edit, refine, websearch, notion, linear, ...) =="
if command -v uv >/dev/null 2>&1; then
  for d in prime-agent/packages/coding-agent/skills/*/; do
    [ -f "${d}pyproject.toml" ] && (cd "$d" && uv sync >/dev/null 2>&1 && echo "   ok: $d") || true
  done
else
  echo "   'uv' not found — install it (https://docs.astral.sh/uv/) then re-run this script."
fi

echo "== 3/7  scroll-world runtime deps (ffmpeg, ffprobe, Python + Pillow) =="
command -v ffmpeg  >/dev/null 2>&1 && echo "   ffmpeg  OK"  || echo "   MISSING: ffmpeg (install via your OS package manager)"
command -v ffprobe >/dev/null 2>&1 && echo "   ffprobe OK"  || echo "   MISSING: ffprobe (ships with ffmpeg)"
python3 -c "import PIL" >/dev/null 2>&1 && echo "   Pillow  OK" || { echo "   installing Pillow..."; pip3 install --quiet Pillow --break-system-packages 2>/dev/null || pip3 install --quiet Pillow || echo "   MISSING: run 'pip3 install Pillow' manually"; }
command -v higgsfield >/dev/null 2>&1 && echo "   higgsfield CLI OK" || echo "   OPTIONAL: higgsfield CLI not found (fallback video/stills backend — https://higgsfield.ai)"
command -v monid      >/dev/null 2>&1 && echo "   monid CLI OK"      || echo "   OPTIONAL: monid CLI not found (default video backend — https://monid.ai)"

echo "== 4/7  API keys in .env =="
cd ..
for key in MONID_API_KEY HIGGSFIELD_API_KEY PRIME_INTELLECT_API_KEY NOTION_API_KEY LINEAR_API_KEY OPENSANDBOX_DOMAIN; do
  if [ -f .env ] && grep -q "^${key}=.\+" .env 2>/dev/null; then
    echo "   $key set"
  else
    echo "   $key NOT set in .env (only needed for the features that use it — see .env.example)"
  fi
done

echo ""
echo "== 5/7  opensandbox-cli (osb) + a reachable OpenSandbox server =="
cd integrations
command -v osb >/dev/null 2>&1 && echo "   osb CLI OK" || { echo "   installing opensandbox-cli..."; pip3 install --quiet opensandbox-cli --break-system-packages 2>/dev/null || pip3 install --quiet opensandbox-cli || echo "   MISSING: run 'pip install opensandbox-cli' manually"; }
if command -v osb >/dev/null 2>&1; then
  DOMAIN="${OPENSANDBOX_DOMAIN:-localhost:8080}"
  osb config set connection.domain "$DOMAIN" >/dev/null 2>&1 || true
  if osb sandbox create --image python:3.12 --timeout 1m -o json >/tmp/osb_probe.json 2>/tmp/osb_probe.err; then
    SBID=$(python3 -c "import json; print(json.load(open('/tmp/osb_probe.json'))['id'])" 2>/dev/null || echo "")
    [ -n "$SBID" ] && osb sandbox kill "$SBID" >/dev/null 2>&1
    echo "   OpenSandbox server reachable at $DOMAIN — run_code_sandbox is ready to use."
  else
    echo "   No OpenSandbox server reachable at $DOMAIN yet."
    echo "   Start a local one with: uvx opensandbox-server   (or point OPENSANDBOX_DOMAIN in .env at a remote server for zero laptop load)"
  fi
fi
cd ..

echo ""
echo "== 6/7  motion + ui-ux-pro-max (mostly static data/skills, minimal install) =="
command -v yarn >/dev/null 2>&1 && echo "   yarn OK (only needed if you want to build/test integrations/motion itself)" || echo "   OPTIONAL: yarn not found — only needed to build/test integrations/motion's own dev toolchain, not to use the 'motion' npm package or the improve/fix skills."
echo "   ui-ux-pro-max skills (design-system, brand, design, slides, banner-design, ui-styling, ui-ux-pro-max) are read/run directly by Ultron via read_file/run_command — no separate install needed."

echo ""
echo "== 7/7  ego-browser (HARD LIMIT: macOS only + manual GUI onboarding) =="
if command -v ego-browser >/dev/null 2>&1; then
  echo "   ego-browser command already available — ready to use."
elif [ "$(uname -s 2>/dev/null)" = "Darwin" ]; then
  echo "   Not installed yet. This is the one integration that CANNOT be silently"
  echo "   finished by this script — it needs you to click through a GUI installer."
  echo "   Run it yourself when ready: sh integrations/ego-lite/skills/ego-browser/scripts/install.sh"
  echo "   Then finish onboarding in the ego lite app window it opens."
else
  echo "   Not macOS ($(uname -s 2>/dev/null || echo unknown)) — ego lite has no Windows/Linux build yet."
  echo "   Ultron will use the existing Playwright-based tools/browser-automation.js instead — no action needed from you."
fi

echo ""
echo "== bonus: prompts-chat (fully offline, zero setup) =="
[ -f integrations/prompts-chat/prompts.csv ] && echo "   prompts.csv present ($(wc -l < integrations/prompts-chat/prompts.csv) lines) — searchable right now, no install/network needed." || echo "   MISSING: integrations/prompts-chat/prompts.csv"
echo "   Live skill/prompt search (https://prompts.chat/api/mcp) needs internet but no separate install — Ultron calls it directly with curl when needed."

echo ""
echo "== bonus: local-AI-infra stack (crewai, llama-cpp, vllm) =="
command -v cmake >/dev/null 2>&1 && echo "   cmake OK (needed to build llama.cpp)" || echo "   OPTIONAL: cmake not found — only needed if you want to build integrations/llama-cpp yourself (Ultron will usually do this via run_code_sandbox instead of on this machine)."
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
  echo "   NVIDIA GPU detected — vllm is a practical option here."
else
  echo "   No NVIDIA GPU detected — Ultron will prefer llama-cpp over vllm for local inference (this is expected on most laptops, not an error)."
fi
echo "   crewai installs via pip when actually used — no upfront action needed here."

echo ""
echo "Done. Anything marked MISSING/NOT set above is a real gap Ultron will hit"
echo "and report honestly — it is not something a script can fake past."
