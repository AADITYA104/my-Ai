/**
 * ============================================================================
 *  ULTRON VOICE ENGINE — Fast, Resilient Multilingual Speech System
 * ============================================================================
 */
"use strict";

let speechRecognizer = null;
let isMicActive = true;
let isSpeaking = false;

const speechSubtitle = document.getElementById("speech-subtitle") || document.getElementById("live-speech-subtitle");
const micBtn = document.getElementById("mic-btn");
const micLbl = document.getElementById("mic-btn-label") || document.getElementById("mic-lbl");
const waveBars = document.querySelectorAll(".wbar");

function initVoiceEngine() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("Speech Recognition not supported in this browser.");
    if (speechSubtitle) speechSubtitle.innerText = "Microphone unavailable. Use Chat mode!";
    return;
  }

  speechRecognizer = new SpeechRecognition();
  speechRecognizer.continuous = true;
  speechRecognizer.interimResults = true;
  speechRecognizer.maxAlternatives = 1;

  speechRecognizer.onstart = () => {
    updateMicUI(true);
  };

  speechRecognizer.onend = () => {
    if (isMicActive && !isSpeaking) {
      try { speechRecognizer.start(); } catch (_) {}
    }
  };

  speechRecognizer.onerror = (e) => {
    console.warn("[VOICE REC ERROR]", e.error);
  };

  speechRecognizer.onresult = (event) => {
    let finalTranscript = "";
    let interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    const displayText = (finalTranscript || interimTranscript).trim();
    if (displayText && speechSubtitle) {
      speechSubtitle.innerText = `BOSS: "${displayText}"`;
    }

    if (finalTranscript.trim().length > 0) {
      processHeardVoice(finalTranscript.trim());
    }
  };

  startListening();
}

function startListening() {
  isMicActive = true;
  if (speechRecognizer) {
    try { speechRecognizer.start(); } catch (_) {}
  }
  updateMicUI(true);
}

function stopListening() {
  isMicActive = false;
  if (speechRecognizer) {
    try { speechRecognizer.stop(); } catch (_) {}
  }
  updateMicUI(false);
}

function toggleMic() {
  if (isMicActive) stopListening();
  else startListening();
}

function updateMicUI(active) {
  if (!micBtn) return;
  if (active) {
    micBtn.classList.add("active");
    micBtn.classList.remove("muted");
    if (micLbl) micLbl.innerText = "MIC ON";
  } else {
    micBtn.classList.remove("active");
    micBtn.classList.add("muted");
    if (micLbl) micLbl.innerText = "MUTED";
  }
}

async function processHeardVoice(transcript) {
  const lower = transcript.toLowerCase();
  console.log("[HEARD VOICE]", transcript);

  const isWakeWord = lower.includes("ultron") || lower.includes("hey ultron") || lower.includes("અલ્ટ્રોન") || lower.includes("अल्ट्रॉन");
  let command = transcript.replace(/hey ultron|ultron|અલ્ટ્રોન|अल्ट્રॉन/gi, "").trim();

  if (isWakeWord && !command) {
    ultronSpeak("Yes Boss, I am listening. What are your orders?");
    return;
  }

  if (isWakeWord || command.length > 2) {
    const finalQuery = command || transcript;
    await sendQueryToUltron(finalQuery, true);
  }
}

async function sendQueryToUltron(promptText, speakBack = true) {
  try {
    if (speechSubtitle) speechSubtitle.innerText = "Processing order, Boss...";

    const res = await fetch("/api/ultron/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: promptText })
    });

    const data = await res.json();
    const reply = data.reply || "Yes Boss, system operational.";

    if (window.appendChat) {
      window.appendChat("user", promptText);
      window.appendChat("ultron", reply);
    }

    if (speakBack) {
      ultronSpeak(reply);
    } else {
      if (speechSubtitle) speechSubtitle.innerText = `ULTRON: "${reply}"`;
    }
  } catch (err) {
    console.error("[ULTRON COMM ERROR]", err);
    ultronSpeak(`Boss, an anomaly occurred: ${err.message}`);
  }
}

function ultronSpeak(text) {
  if (!window.speechSynthesis) return;

  window.speechSynthesis.cancel();
  isSpeaking = true;
  if (speechRecognizer) {
    try { speechRecognizer.stop(); } catch (_) {}
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const naturalVoice = voices.find(v => v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Neural")) ||
                       voices.find(v => v.lang.includes("en-US") || v.lang.includes("en-GB") || v.lang.includes("hi-IN"));
  if (naturalVoice) utterance.voice = naturalVoice;

  utterance.onstart = () => {
    if (speechSubtitle) speechSubtitle.innerText = `ULTRON: "${text}"`;
    startWaveAnimation(true);
  };

  utterance.onend = () => {
    isSpeaking = false;
    startWaveAnimation(false);
    if (isMicActive && speechRecognizer) {
      try { speechRecognizer.start(); } catch (_) {}
    }
  };

  utterance.onerror = () => {
    isSpeaking = false;
    startWaveAnimation(false);
  };

  window.speechSynthesis.speak(utterance);
}

let waveTimer = null;
function startWaveAnimation(active) {
  if (active) {
    if (waveTimer) clearInterval(waveTimer);
    waveTimer = setInterval(() => {
      waveBars.forEach(b => {
        b.style.height = `${Math.floor(4 + Math.random() * 20)}px`;
      });
    }, 70);
  } else {
    if (waveTimer) clearInterval(waveTimer);
    waveBars.forEach(b => {
      b.style.height = "4px";
    });
  }
}
