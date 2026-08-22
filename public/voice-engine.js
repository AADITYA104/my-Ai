/**
 * ============================================================================
 *  ULTRON VOICE ENGINE — Echo-Suppressed Multilingual Speech System
 * ============================================================
 */
"use strict";

let speechRecognizer = null;
let isMicActive = true;
let isSpeaking = false;
let lastUltronSpokeTime = 0;
let lastUltronSpokenText = "";
let currentLang = localStorage.getItem("ultron_voice_lang") || "en-IN";

const speechSubtitle = document.getElementById("speech-subtitle") || document.getElementById("live-speech-subtitle");
const micBtn = document.getElementById("mic-btn");
const micLbl = document.getElementById("mic-btn-label") || document.getElementById("mic-lbl");
const waveBars = document.querySelectorAll(".wbar");

function cleanString(str) {
  return (str || "").toLowerCase().replace(/[^\w\s\u0A80-\u0AFF\u0900-\u097F]/gi, "").trim();
}

function isEchoOfUltron(spoken) {
  if (!lastUltronSpokenText) return false;
  const cSpoken = cleanString(spoken);
  const cUltron = cleanString(lastUltronSpokenText);
  if (!cSpoken || !cUltron) return false;
  if (cUltron.includes(cSpoken) || cSpoken.includes(cUltron)) return true;
  return false;
}

function initVoiceEngine() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (speechSubtitle) speechSubtitle.innerText = "Microphone unavailable in this browser. Use Chat mode!";
    return;
  }

  if (speechRecognizer) {
    try { speechRecognizer.abort(); } catch (_) {}
  }

  speechRecognizer = new SpeechRecognition();
  speechRecognizer.continuous = true;
  speechRecognizer.interimResults = true;
  speechRecognizer.maxAlternatives = 1;
  speechRecognizer.lang = currentLang;

  speechRecognizer.onstart = () => {
    updateMicUI(true);
  };

  speechRecognizer.onend = () => {
    if (isMicActive && !isSpeaking) {
      setTimeout(() => {
        if (isMicActive && !isSpeaking) {
          try { speechRecognizer.start(); } catch (_) {}
        }
      }, 300);
    }
  };

  speechRecognizer.onerror = (e) => {
    console.warn("[VOICE REC ERROR]", e.error);
  };

  speechRecognizer.onresult = (event) => {
    // Suppress acoustic feedback / self-talk echo
    if (isSpeaking || (Date.now() - lastUltronSpokeTime < 800)) {
      return;
    }

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
      if (isEchoOfUltron(displayText)) return;
      speechSubtitle.innerText = `BOSS: "${displayText}"`;
    }

    if (finalTranscript.trim().length > 0) {
      const heard = finalTranscript.trim();
      if (!isEchoOfUltron(heard)) {
        processHeardVoice(heard);
      }
    }
  };

  startListening();
}

function startListening() {
  isMicActive = true;
  if (speechRecognizer && !isSpeaking) {
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
  if (isSpeaking || isEchoOfUltron(transcript)) return;

  const lower = transcript.toLowerCase();
  const wakeTriggers = ["ultron", "hey ultron", "ok ultron", "અલ્ટ્રોન", "अल्ट्रॉन", "altron", "oltron", "ultran"];
  const isWakeWord = wakeTriggers.some(w => lower.includes(w));
  
  let command = transcript;
  wakeTriggers.forEach(w => {
    command = command.replace(new RegExp(w, "gi"), "").trim();
  });

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

  // HARD STOP RECOGNIZER BEFORE SPEAKING TO PREVENT SELF-ECHO
  isSpeaking = true;
  lastUltronSpokeTime = Date.now();
  lastUltronSpokenText = text;

  if (speechRecognizer) {
    try { speechRecognizer.abort(); } catch (_) {}
    try { speechRecognizer.stop(); } catch (_) {}
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 0.95;

  const isGujarati = /[\u0A80-\u0AFF]/.test(text);
  const isHindi = /[\u0900-\u097F]/.test(text);

  const voices = window.speechSynthesis.getVoices();
  let selectedVoice = null;

  if (isGujarati) {
    selectedVoice = voices.find(v => v.lang.startsWith("gu") || v.name.toLowerCase().includes("gujarati")) ||
                    voices.find(v => v.lang.startsWith("hi") || v.name.toLowerCase().includes("hindi")) ||
                    voices.find(v => v.lang === "en-IN");
  } else if (isHindi) {
    selectedVoice = voices.find(v => v.lang.startsWith("hi") || v.name.toLowerCase().includes("hindi")) ||
                    voices.find(v => v.lang === "en-IN");
  } else {
    selectedVoice = voices.find(v => v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Neural")) ||
                    voices.find(v => v.lang === "en-IN" || v.lang === "en-US" || v.lang === "en-GB");
  }

  if (selectedVoice) utterance.voice = selectedVoice;

  utterance.onstart = () => {
    if (speechSubtitle) speechSubtitle.innerText = `ULTRON: "${text}"`;
    startWaveAnimation(true);
  };

  utterance.onend = () => {
    isSpeaking = false;
    lastUltronSpokeTime = Date.now();
    startWaveAnimation(false);

    // 750ms silence buffer to avoid capturing room reverb
    setTimeout(() => {
      if (isMicActive && !isSpeaking && speechRecognizer) {
        try { speechRecognizer.start(); } catch (_) {}
      }
    }, 750);
  };

  utterance.onerror = () => {
    isSpeaking = false;
    lastUltronSpokeTime = Date.now();
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
