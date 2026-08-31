#!/usr/bin/env bash
# One-command GPT Researcher setup. Installs the package and prompts for API keys.
# Run from the project root: bash setup-scripts/install-gpt-researcher.sh
set -e

RESEARCHER_DIR="external-skills/gpt-researcher"

if ! command -v python3 &>/dev/null; then
  echo "python3 not found — install Python 3.10+ first: https://www.python.org/downloads/"
  exit 1
fi

echo "Installing gpt-researcher from the bundled source (NOT from PyPI)..."
echo "  Reason: the published 'gpt-researcher' PyPI package has a confirmed bug"
echo "  (missing 'from typing import Any' in query_processing.py -> NameError on import)."
echo "  The bundled GitHub source already has this fixed, so we install from there instead."
cd "$RESEARCHER_DIR"
python3 -m pip install -e . --quiet

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "This needs two API keys to actually run:"
  read -rp "  OPENAI_API_KEY (get one at platform.openai.com): " OPENAI_KEY
  read -rp "  TAVILY_API_KEY (get one at tavily.com): " TAVILY_KEY
  {
    echo "OPENAI_API_KEY=$OPENAI_KEY"
    echo "TAVILY_API_KEY=$TAVILY_KEY"
  } > "$ENV_FILE"
  echo "Saved to $RESEARCHER_DIR/.env"
fi

echo ""
echo "Setup complete. Start the server with:"
echo "  cd $RESEARCHER_DIR && python3 -m uvicorn main:app --reload"
echo "It will serve on http://localhost:8000 — your AI's gpt-researcher-deep-research skill will work once this is running."
echo ""
echo "Note: every deep-research call spends real OpenAI/Tavily API credits (~\$0.40 per deep-research run)."
