#!/usr/bin/env bash
# One-command Voicebox setup. Installs prerequisites where possible, then runs
# Voicebox's own setup. Run from the project root:
#   bash setup-scripts/install-voicebox.sh
set -e

VOICEBOX_DIR="external-skills/voicebox"

echo "Checking prerequisites..."

missing=()
command -v bun &>/dev/null || missing+=("bun (https://bun.sh)")
command -v cargo &>/dev/null || missing+=("rust (https://rustup.rs)")
command -v python3 &>/dev/null || missing+=("python3.11+")
command -v just &>/dev/null || missing+=("just (brew install just / cargo install just)")

if [ ${#missing[@]} -ne 0 ]; then
  echo "Missing prerequisites — install these first, then re-run this script:"
  for m in "${missing[@]}"; do echo "  - $m"; done
  echo ""
  echo "Quick install attempt (macOS/Linux with Homebrew):"
  if command -v brew &>/dev/null; then
    command -v bun &>/dev/null || brew install oven-sh/bun/bun
    command -v just &>/dev/null || brew install just
    command -v cargo &>/dev/null || { echo "Installing Rust via rustup..."; curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y; }
  else
    echo "Homebrew not found — install the missing tools manually from the links above."
    exit 1
  fi
fi

echo ""
echo "Running Voicebox's own setup..."
cd "$VOICEBOX_DIR"
just setup

echo ""
echo "Setup complete. Start it with:"
echo "  cd $VOICEBOX_DIR && just dev"
echo "It will serve on http://127.0.0.1:17493 — your AI's voicebox-voice-io skill will work once this is running."
