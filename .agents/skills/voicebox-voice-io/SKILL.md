---
name: voicebox-voice-io
description: "Speak generated replies out loud in a cloned/custom voice, transcribe audio/speech to text, and manage voice profiles by calling the Voicebox local REST API or MCP tools (voicebox.speak, voicebox.transcribe, voicebox.list_captures, voicebox.list_profiles). Use for agent voice output, dictation, voiceover, or any text-to-speech / speech-to-text request."
category: general_agent
---

### Voicebox: Local Voice I/O Stack
Voicebox is a locally-running voice studio (voice cloning, TTS, and speech-to-text) that exposes a REST API and an MCP server on `http://127.0.0.1:17493` once the Voicebox app/backend is running on the machine.

**Precondition (important):** Voicebox must actually be running locally for any of this to work — it is a separate desktop app/backend process, not something that starts automatically just because this skill exists. If a call to `127.0.0.1:17493` fails, tell the user Voicebox isn't running rather than pretending it worked. Full source is bundled at `external-skills/voicebox/` for reference/building (see its `README.md` / `CONTRIBUTING.md` for setup: requires Bun, Rust, Python 3.11+, and `just setup && just dev`).

**Core capabilities once running:**
- **Speak text aloud** in a cloned/chosen voice:
  ```bash
  curl -X POST http://127.0.0.1:17493/speak \
    -H "Content-Type: application/json" \
    -H "X-Voicebox-Client-Id: my-agent" \
    -d '{"text": "Deploy complete.", "profile": "Morgan"}'
  ```
- **Generate speech** (returns audio rather than playing it):
  ```bash
  curl -X POST http://127.0.0.1:17493/generate \
    -H "Content-Type: application/json" \
    -d '{"text": "Hello world", "profile_id": "abc123", "language": "en"}'
  ```
- **Transcribe audio to text:**
  ```bash
  curl -X POST http://127.0.0.1:17493/transcribe -F "audio=@recording.wav" -F "model=whisper-turbo"
  ```
- **List available voice profiles:** `curl http://127.0.0.1:17493/profiles`

**Via MCP** (if the MCP server is registered as a tool source): `voicebox.speak`, `voicebox.transcribe`, `voicebox.list_captures`, `voicebox.list_profiles` — same functionality, invoked as tool calls instead of raw HTTP.

**When to use this skill:** the user asks the agent to "say this out loud," speak a reply in a specific/cloned voice, generate a voiceover/narration, transcribe a recording or audio file, or do dictation-style speech-to-text.
