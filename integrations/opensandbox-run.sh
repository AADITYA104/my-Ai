#!/bin/sh
# ============================================================================
# integrations/opensandbox-run.sh
# One-shot "run this in a remote/isolated sandbox instead of on Boss's laptop"
# helper. Wraps: create sandbox -> run command -> kill sandbox, as one call,
# so Ultron's run_command tool can invoke it in a single step.
#
# Usage:
#   sh integrations/opensandbox-run.sh "<shell command to run>" ["<image>"]
#
# Config comes from OPENSANDBOX_DOMAIN / OPENSANDBOX_PROTOCOL /
# OPENSANDBOX_API_KEY in .env (see .env.example). Point OPENSANDBOX_DOMAIN at
# a remote host (not localhost) to keep 100% of the execution load off this
# laptop — the command then runs on that remote machine's Docker/Kubernetes,
# not here.
# ============================================================================
set -eu

CMD="${1:?Usage: run.sh \"<command>\" [image]}"
IMAGE="${2:-python:3.12}"

if ! command -v osb >/dev/null 2>&1; then
  echo "ERROR: 'osb' CLI not found. Install with: pip install opensandbox-cli (or: uv tool install opensandbox-cli)" >&2
  exit 1
fi

DOMAIN="${OPENSANDBOX_DOMAIN:-localhost:8080}"
PROTOCOL="${OPENSANDBOX_PROTOCOL:-http}"

osb config set connection.domain "$DOMAIN" >/dev/null
osb config set connection.protocol "$PROTOCOL" >/dev/null
if [ -n "${OPENSANDBOX_API_KEY:-}" ]; then
  osb config set connection.api_key "$OPENSANDBOX_API_KEY" >/dev/null
fi

SBID=$(osb sandbox create --image "$IMAGE" --timeout 10m -o json | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])" 2>/dev/null) \
  || { echo "ERROR: could not create sandbox on $PROTOCOL://$DOMAIN — is the OpenSandbox server reachable? (uvx opensandbox-server to start one)" >&2; exit 1; }

cleanup() { osb sandbox kill "$SBID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

osb command run "$SBID" -o raw -- sh -c "$CMD"
