$ErrorActionPreference = "Stop"

$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
  $candidate = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
  if (Test-Path -LiteralPath $candidate) {
    $ollama = @{ Source = $candidate }
  }
}

if (-not $ollama) {
  Write-Host "Ollama is not installed or not in PATH."
  Write-Host "Run this installer first: C:\Users\devmu\Downloads\OllamaSetup.exe"
  exit 1
}

$modelPath = "C:\Users\devmu\Downloads\Qwen3.8-27B-UD-IQ2_XXS.gguf"
if (-not (Test-Path -LiteralPath $modelPath)) {
  Write-Host "Model file missing: $modelPath"
  exit 1
}

& $ollama.Source create ultron-core -f "$PSScriptRoot\Modelfile"
& $ollama.Source list
