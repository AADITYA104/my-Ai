$ErrorActionPreference = "Stop"

# NOTE: this script used to point at one developer's personal Downloads folder
# (C:\Users\devmu\Downloads\...) for both the Ollama installer and the model
# file - neither of those paths exist on any other machine. Fixed to point at
# the real Ollama download page, and to look for the model file in this same
# project folder (matching the relative path now used in Modelfile).

$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
  $candidate = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
  if (Test-Path -LiteralPath $candidate) {
    $ollama = @{ Source = $candidate }
  }
}

if (-not $ollama) {
  Write-Host "Ollama is not installed or not in PATH."
  Write-Host "Download and run the installer from: https://ollama.com/download/windows"
  exit 1
}

$modelPath = Join-Path $PSScriptRoot "Qwen3.8-27B-UD-IQ4_XS.gguf"
if (-not (Test-Path -LiteralPath $modelPath)) {
  Write-Host "Model file missing: $modelPath"
  Write-Host "Download a Qwen 3.8-27B GGUF file (e.g. from Hugging Face) and place it"
  Write-Host "in this project folder with exactly that filename, or edit the FROM line"
  Write-Host "in Modelfile to point at whatever GGUF file/path you actually have."
  exit 1
}

& $ollama.Source create ultron-core -f "$PSScriptRoot\Modelfile"
& $ollama.Source list
