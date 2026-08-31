#!/usr/bin/env bash
# One-command OpenSCAD installer. Detects your OS and uses the right package manager.
# Run from the project root: bash setup-scripts/install-openscad.sh
set -e

echo "Detecting OS..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  if command -v brew &>/dev/null; then
    echo "Installing OpenSCAD via Homebrew..."
    brew install --cask openscad
  else
    echo "Homebrew not found. Install it from https://brew.sh, then re-run this script."
    exit 1
  fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  if command -v apt-get &>/dev/null; then
    echo "Installing OpenSCAD via apt..."
    sudo apt-get update && sudo apt-get install -y openscad
  elif command -v snap &>/dev/null; then
    echo "Installing OpenSCAD via snap..."
    sudo snap install openscad
  else
    echo "No supported package manager found (apt/snap). See https://openscad.org/downloads.html"
    exit 1
  fi
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  echo "Windows detected. Download and run the installer manually: https://openscad.org/downloads.html"
  exit 1
else
  echo "Unrecognized OS ($OSTYPE). Install manually: https://openscad.org/downloads.html"
  exit 1
fi

echo ""
echo "Verifying install..."
if command -v openscad &>/dev/null; then
  openscad --version
  echo "OpenSCAD installed successfully. Your AI's run_command tool can now render .scad -> .stl."
else
  echo "Install finished but 'openscad' command not found on PATH — you may need to restart your terminal."
fi
