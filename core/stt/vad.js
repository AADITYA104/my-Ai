/**
 * ============================================================================
 *  ULTRON VOICE ACTIVITY DETECTION (CORE/STT/VAD.JS)
 *  - Distinguishes human speech from ambient silence/background noise.
 *  - Auto-terminates recording on ~1.5s continuous silence threshold.
 * ============================================================================
 */
"use strict";

class VoiceActivityDetector {
  constructor(silenceThreshold = 0.025, silenceLimitFrames = 25) {
    this.silenceThreshold = silenceThreshold;
    this.silenceLimitFrames = silenceLimitFrames; // ~1.5 seconds at 60ms frames
    this.silenceCount = 0;
    this.speechDetected = false;
  }

  /**
   * Process a single audio frame (array of PCM samples)
   */
  processFrame(pcmSamples) {
    if (!pcmSamples || pcmSamples.length === 0) {
      return { isSpeech: false, shouldStop: false };
    }

    let sum = 0;
    for (let i = 0; i < pcmSamples.length; i++) {
      sum += pcmSamples[i] * pcmSamples[i];
    }
    const rms = Math.sqrt(sum / pcmSamples.length) / 32768;
    const isSpeech = rms > this.silenceThreshold;

    if (isSpeech) {
      this.speechDetected = true;
      this.silenceCount = 0;
    } else {
      if (this.speechDetected) {
        this.silenceCount++;
      }
    }

    const shouldStop = this.speechDetected && this.silenceCount >= this.silenceLimitFrames;

    return {
      isSpeech,
      rms,
      silenceCount: this.silenceCount,
      shouldStop
    };
  }

  /**
   * Reset the detector for the next interaction turn
   */
  reset() {
    this.silenceCount = 0;
    this.speechDetected = false;
  }
}

module.exports = VoiceActivityDetector;
