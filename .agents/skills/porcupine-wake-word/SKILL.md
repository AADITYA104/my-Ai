---
name: porcupine-wake-word
description: "Detect a wake word / hotword (like 'Hey Computer', 'Picovoice', or a custom trained phrase) in a live audio stream to trigger always-listening voice features, before handing off to full speech processing (e.g. Voicebox transcription). Use when the user wants 'always listening', 'wake word', 'hotword detection', 'say a phrase to activate', or hands-free voice activation."
category: general_agent
---

### Porcupine: Lightweight On-Device Wake-Word Engine
Porcupine (by Picovoice) listens to a live audio stream and detects a specific spoken phrase (a "wake word") with very low compute cost, entirely on-device (no audio leaves the machine, no internet needed once running) — this is the "Hey Siri"/"Alexa"-style trigger, not a full speech-to-text engine.

**How it fits with this agent's other voice skills:** Porcupine is the *trigger* ("did someone say the wake word?"); `voicebox-voice-io` is the actual *speak/transcribe* engine. A typical always-listening flow is: Porcupine detects the wake word → then start Voicebox transcription for the actual command that follows.

**Important - two different Porcupine integrations exist in this project, don't mix them up:**
- **This skill teaches the Python SDK** (`pvporcupine`) - use it for standalone Python tools/scripts.
- **This app's own live voice mode** (`npm run ultron` → `core/wakeword/listener.js`) already uses the **Node.js** binding (`@picovoice/porcupine-node` + `@picovoice/pvrecorder-node`) instead. If asked to add or modify wake-word behavior *in this app itself*, edit `core/wakeword/listener.js`, not this Python example. See `VOICE_ARCHITECTURE.md` for the full picture.

**Precondition (important, be honest about this):**
- Needs a free `AccessKey` from the [Picovoice Console](https://console.picovoice.ai/) (sign up, copy the key).
- Needs the Python SDK installed: `pip install pvporcupine`.
- Runs as a small Python process reading from a microphone — it must actually be running to detect anything; it doesn't start itself.
- Full source/demos bundled at `external-skills/porcupine/` (see `binding/python/` and `demo/python/` for reference code, or `resources/` for the built-in wake words like "Picovoice", "Bumblebee", "Computer").

**Minimal usage (built-in wake word):**
```python
import pvporcupine
import pyaudio
import struct

porcupine = pvporcupine.create(access_key="YOUR_ACCESS_KEY", keywords=["computer"])
pa = pyaudio.PyAudio()
stream = pa.open(rate=porcupine.sample_rate, channels=1, format=pyaudio.paInt16,
                  input=True, frames_per_buffer=porcupine.frame_length)

while True:
    pcm = struct.unpack_from("h" * porcupine.frame_length, stream.read(porcupine.frame_length))
    if porcupine.process(pcm) >= 0:
        print("Wake word detected!")
        # hand off to voicebox-voice-io for the actual command
```

**Custom wake words** (e.g. a brand name or "Hey My-AI") are trained for free at the Picovoice Console and downloaded as a `.ppn` model file, then passed via `keyword_paths=["path/to/model.ppn"]` instead of `keywords=[...]`.

**When to use vs. always running a full transcription model:** wake-word detection is far cheaper to run continuously (designed for IoT/always-on use); only start the heavier transcription (Voicebox) after the wake word fires, rather than transcribing everything all the time.
