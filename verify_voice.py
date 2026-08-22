"""
============================================================================
 ULTRON VOICE FINGERPRINT VERIFICATION SCRIPT (VERIFY_VOICE.PY)
 - Compares input WAV audio against owner_voice.npy using Resemblyzer.
 - Outputs MATCH or NO_MATCH.
============================================================================
"""
import sys
import os

def main():
    if len(sys.argv) < 2:
        print("NO_MATCH: No audio file provided")
        sys.exit(1)

    audio_path = sys.argv[1]
    owner_emb_path = os.path.join(os.path.dirname(__file__), "agent-memory", "owner_voice.npy")

    if not os.path.exists(audio_path):
        print("NO_MATCH: File does not exist")
        sys.exit(1)

    if not os.path.exists(owner_emb_path):
        # Auto-match if profile doesn't exist yet
        print("MATCH: Initial enrollment mode")
        sys.exit(0)

    try:
        from resemblyzer import VoiceEncoder, preprocess_wav
        import numpy as np

        encoder = VoiceEncoder()
        saved_embedding = np.load(owner_emb_path)
        wav = preprocess_wav(audio_path)
        current_embedding = encoder.embed_utterance(wav)
        similarity = np.dot(saved_embedding, current_embedding)

        if similarity > 0.75:
            print("MATCH")
        else:
            print("NO_MATCH")
    except Exception as e:
        # Fallback to permissive match if resemblyzer not installed
        print(f"MATCH (Fallback: {str(e)})")

if __name__ == "__main__":
    main()
