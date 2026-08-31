# Voice & Wake-Word: How Everything Fits Together

Your project ended up with **two separate voice systems** — one that was already there, one that got added through this conversation. Here's exactly how they relate, so nothing is confusing.

## System 1: The app's own built-in voice mode (pre-existing, already wired)

Running `npm run ultron` (i.e. `node ultron.js`) starts the **full voice pipeline**:

```
core/wakeword/listener.js  →  core/stt/stream.js  →  [brain/tools]  →  core/tts/speak.js
   (wake-word detection)        (speech-to-text)                        (text-to-speech)
```

- **Wake-word:** `@picovoice/porcupine-node` + `@picovoice/pvrecorder-node` (the Node.js Picovoice bindings — now listed in `package.json` under `optionalDependencies`, since they're native modules).
- **STT:** looks for a `faster-whisper-server` binary on your PATH; if it's not there, it degrades gracefully to a stand-in response instead of crashing.
- **TTS:** tries ElevenLabs (if `ELEVEN_API_KEY`/`ELEVEN_VOICE_ID` are set) → falls back to Windows SAPI (Windows) → falls back to `say` (macOS).

**This is separate from Voicebox and separate from the `pvporcupine` Python skill.** It's the app's own native voice loop, plain Node.js, no Python involved.

**To actually use it:** `npm install` (grabs the optional Picovoice packages if your platform supports them), install a `faster-whisper-server` binary if you want real STT, optionally set `ELEVEN_API_KEY`/`ELEVEN_VOICE_ID` for higher-quality TTS, then `npm run ultron`.

## System 2: The skills added in this conversation (Voicebox, Porcupine-Python, mem0)

These are **knowledge/instruction skills** the AI can draw on when *you ask it to build something* involving voice, memory, or 3D/CAD — they don't run automatically, and they're a different tech stack (Python, separate services) from System 1 above:

- `voicebox-voice-io` → teaches the AI to call the separate Voicebox app's REST/MCP API (not related to `core/tts`/`core/stt`).
- `porcupine-wake-word` → teaches the AI the **Python** `pvporcupine` SDK, for building standalone Python tools — different from the Node bindings System 1 uses. If you ask the AI to add wake-word detection *to this app itself*, point it at `core/wakeword/listener.js` (System 1) instead, since that's what's actually wired into `ultron.js`.
- `mem0` (6 skills) → knowledge for adding Mem0's memory layer to *any* project you're building, unrelated to this app's own `agent-memory/` (which is this app's own simpler built-in memory, not Mem0).

## Why keep both instead of merging them?

Because they solve different problems: System 1 is this specific app's own lightweight, zero-dependency-by-default voice loop. System 2's skills are general-purpose knowledge for when you (or the AI) choose to build with Voicebox/Mem0/Porcupine-Python specifically, in *any* project — not just this one. Collapsing them into one would remove real flexibility for no benefit.

## One real bug found and fixed while reviewing this

`porcupine-wake-engine.js` (a status-helper file, not the live listener) was hardcoded to one developer's personal path (`C:\Users\devmu\Downloads\...`) and would never have worked on any other machine. It's not actually called by anything in the running app (`core/wakeword/listener.js` is the real one), but it was left broken and confusing. Fixed it to auto-detect your OS and point at the now-bundled `external-skills/porcupine/resources/keyword_files/` — verified it actually returns real keyword lists now.
