#!/usr/bin/env bash
# One-command Porcupine (wake-word) setup. Installs the SDK and prompts for an AccessKey.
# Run from the project root: bash setup-scripts/install-porcupine.sh
set -e

if ! command -v python3 &>/dev/null; then
  echo "python3 not found — install Python 3.8+ first: https://www.python.org/downloads/"
  exit 1
fi

echo "Installing pvporcupine..."
python3 -m pip install pvporcupine --quiet

ENV_FILE="external-skills/porcupine/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "Porcupine needs a free AccessKey from Picovoice Console."
  echo "Get one at: https://console.picovoice.ai/"
  read -rp "  PICOVOICE_ACCESS_KEY: " ACCESS_KEY
  echo "PICOVOICE_ACCESS_KEY=$ACCESS_KEY" > "$ENV_FILE"
  echo "Saved to $ENV_FILE"
fi

echo ""
echo "Setup complete. Quick test (say 'computer' after running):"
echo "  python3 -c \"import pvporcupine; p = pvporcupine.create(access_key='YOUR_KEY', keywords=['computer']); print('Porcupine loaded OK, sample_rate:', p.sample_rate)\""
echo ""
echo "See external-skills/porcupine/demo/python/ for a full working microphone demo."
