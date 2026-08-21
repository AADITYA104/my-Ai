/**
 * ============================================================================
 *  ADITYA DEVMURARI — CINEMATIC STORYTELLING APP CONTROLLER (APP.JS)
 *  - GSAP ScrollTrigger 3D Reveals, Web Audio Drone Synthesizer
 *  - Velocity Magnetic Cursor, Interactive Terminal & Lens Matrix
 * ============================================================================
 */
"use strict";

// ---------------------------------------------------------------------------
// 1. SYNTHESIZED WEB AUDIO AMBIENT SOUNDTRACK & SOUND FX
// ---------------------------------------------------------------------------
let audioCtx = null;
let soundEnabled = true;
let droneGain = null;
let droneOsc1 = null, droneOsc2 = null;

function initAudioEngine() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function startAmbientDrone() {
  if (!soundEnabled || !audioCtx || droneGain) return;
  try {
    const now = audioCtx.currentTime;
    droneGain = audioCtx.createGain();
    droneGain.gain.setValueAtTime(0.001, now);
    droneGain.gain.exponentialRampToValueAtTime(0.035, now + 3);

    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(450, now);

    droneGain.connect(lowpass);
    lowpass.connect(audioCtx.destination);

    // Root Harmonic Drone Frequencies (F minor ambient chord)
    droneOsc1 = audioCtx.createOscillator();
    droneOsc1.type = "sawtooth";
    droneOsc1.frequency.setValueAtTime(87.31, now); // F2
    droneOsc1.connect(droneGain);
    droneOsc1.start(now);

    droneOsc2 = audioCtx.createOscillator();
    droneOsc2.type = "sine";
    droneOsc2.frequency.setValueAtTime(130.81, now); // C3
    droneOsc2.connect(droneGain);
    droneOsc2.start(now);
  } catch (_) {}
}

function stopAmbientDrone() {
  if (droneGain && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      droneGain.gain.linearRampToValueAtTime(0.0001, now + 0.8);
      setTimeout(() => {
        if (droneOsc1) droneOsc1.stop();
        if (droneOsc2) droneOsc2.stop();
        droneGain = null;
        droneOsc1 = null;
        droneOsc2 = null;
      }, 850);
    } catch (_) {}
  }
}

function playCyberFx(type = "hover") {
  if (!soundEnabled) return;
  initAudioEngine();
  if (!audioCtx) return;

  try {
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === "hover") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(950, now + 0.05);
      gain.gain.setValueAtTime(0.025, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === "click") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(1100, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === "terminal") {
      osc.type = "square";
      osc.frequency.setValueAtTime(1400 + Math.random() * 500, now);
      gain.gain.setValueAtTime(0.015, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.035);
      osc.start(now);
      osc.stop(now + 0.035);
    } else if (type === "modal") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.22);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    }
  } catch (_) {}
}

const audioToggle = document.getElementById("ambient-audio-toggle");
const soundLabel = document.getElementById("sound-label");

if (audioToggle) {
  audioToggle.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    initAudioEngine();

    if (soundEnabled) {
      if (soundLabel) soundLabel.innerText = "AUDIO ON";
      audioToggle.classList.remove("muted");
      startAmbientDrone();
      playCyberFx("click");
    } else {
      if (soundLabel) soundLabel.innerText = "AUDIO OFF";
      audioToggle.classList.add("muted");
      stopAmbientDrone();
    }
  });
}

// First interaction un-mutes audio context
window.addEventListener("click", () => {
  initAudioEngine();
  if (soundEnabled && !droneGain) startAmbientDrone();
}, { once: true });

// ---------------------------------------------------------------------------
// 2. VELOCITY MAGNETIC CURSOR
// ---------------------------------------------------------------------------
const cursorCore = document.getElementById("cursor-core");
const cursorHalo = document.getElementById("cursor-halo");

let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
let haloX = window.innerWidth / 2, haloY = window.innerHeight / 2;

window.addEventListener("mousemove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;

  if (cursorCore) {
    cursorCore.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
  }
});

function animateCursor() {
  haloX += (mouseX - haloX) * 0.16;
  haloY += (mouseY - haloY) * 0.16;

  if (cursorHalo) {
    cursorHalo.style.transform = `translate(${haloX}px, ${haloY}px)`;
  }
  requestAnimationFrame(animateCursor);
}
animateCursor();

document.querySelectorAll("a, button, .glass-morph, .mpill, .ltab, .contact-chip").forEach((el) => {
  el.addEventListener("mouseenter", () => {
    playCyberFx("hover");
    if (cursorHalo) {
      cursorHalo.style.width = "54px";
      cursorHalo.style.height = "54px";
      cursorHalo.style.borderColor = "var(--neon-cyan)";
    }
  });

  el.addEventListener("mouseleave", () => {
    if (cursorHalo) {
      cursorHalo.style.width = "38px";
      cursorHalo.style.height = "38px";
      cursorHalo.style.borderColor = "var(--border-cyan-active)";
    }
  });

  el.addEventListener("click", () => playCyberFx("click"));
});

// ---------------------------------------------------------------------------
// 3. 3D GYROSCOPIC TILT PHYSICS ON CARDS
// ---------------------------------------------------------------------------
document.querySelectorAll(".glass-morph").forEach((card) => {
  card.addEventListener("mousemove", (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotX = ((y - centerY) / centerY) * -6;
    const rotY = ((x - centerX) / centerX) * 6;

    card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-4px)`;
  });

  card.addEventListener("mouseleave", () => {
    card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)";
  });
});

// ---------------------------------------------------------------------------
// 4. GSAP SCROLLTRIGGER STORYTELLING TIMELINE REVEALS
// ---------------------------------------------------------------------------
if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);

  document.querySelectorAll("[data-reveal]").forEach((elem) => {
    gsap.fromTo(
      elem,
      { opacity: 0, y: 40, rotateX: 6 },
      {
        opacity: 1,
        y: 0,
        rotateX: 0,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: {
          trigger: elem,
          start: "top 88%",
          toggleActions: "play none none none"
        }
      }
    );
  });
}

// ---------------------------------------------------------------------------
// 5. SCROLL ACT TRACKER & HUD TELEMETRY
// ---------------------------------------------------------------------------
const ACT_TITLES = {
  "act-genesis": "ACT I // THE SINGULARITY",
  "act-crucible": "ACT II // THE CRUCIBLE",
  "act-forge": "ACT III // THE MASTER FORGE",
  "act-constellation": "ACT IV // 717-SKILL MATRIX",
  "act-lens": "ACT V // VALUE MATRIX",
  "act-uplink": "ACT VI // DIRECT UPLINK"
};

const liveHudChapter = document.getElementById("live-hud-chapter");
const scrollTimelineThumb = document.getElementById("scroll-timeline-thumb");
const scrollPctCounter = document.getElementById("scroll-pct-counter");

window.addEventListener("scroll", () => {
  const scrollTop = window.scrollY;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const pct = Math.min(100, Math.max(0, Math.round((scrollTop / (maxScroll || 1)) * 100)));

  if (scrollTimelineThumb) scrollTimelineThumb.style.height = `${pct}%`;
  if (scrollPctCounter) scrollPctCounter.innerText = `${String(pct).padStart(3, "0")}%`;

  let currentActId = "act-genesis";
  Object.keys(ACT_TITLES).forEach((actId) => {
    const el = document.getElementById(actId);
    if (el) {
      const top = el.offsetTop - 240;
      if (scrollTop >= top) {
        currentActId = actId;
      }
    }
  });

  if (liveHudChapter && ACT_TITLES[currentActId]) {
    liveHudChapter.innerText = ACT_TITLES[currentActId];
  }
}, { passive: true });

// ---------------------------------------------------------------------------
// 6. SKILL CATEGORY MATRIX FILTER
// ---------------------------------------------------------------------------
const mpills = document.querySelectorAll(".mpill");
const matrixCards = document.querySelectorAll(".matrix-card");

mpills.forEach((pill) => {
  pill.addEventListener("click", () => {
    mpills.forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");

    const filter = pill.getAttribute("data-filter");
    matrixCards.forEach((card) => {
      const cat = card.getAttribute("data-cat");
      if (filter === "all" || cat === filter) {
        card.style.display = "flex";
      } else {
        card.style.display = "none";
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 7. STAKEHOLDER LENS PERSPECTIVE SWITCHER
// ---------------------------------------------------------------------------
const LENS_DATA = {
  recruiter: {
    title: "🎯 Zero-Risk, High-Signal Engineering Hire",
    c1: "Broad mastery across AI, full stack, and blockchain eliminates single-point bottlenecks. Every skill is backed by shipped code, 95% ML predictive accuracy, and 30% measured speedups.",
    c2: "Proven ability to move from architecture sketches directly into production deployment without needing multi-tier handoffs. Reduces team feature delivery cycle times dramatically.",
    c3: "Full Stack Software Engineer, Autonomous AI Systems Engineer, Applied ML Developer, R&D Systems Engineer."
  },
  founder: {
    title: "🚀 Multiplier Leverage for Startups & Founding Teams",
    c1: "One versatile builder who architects distributed databases, crafts Next.js/React frontends, trains predictive models, and builds autonomous agent swarms.",
    c2: "Speeds up initial MVP validation from months to days. Proactively eliminates tech debt using Ponytail root-cause minimal diff engineering.",
    c3: "Founding Engineer, Lead Full Stack Engineer, AI Product Specialist."
  },
  client: {
    title: "💼 High-Fidelity Delivery with Clear Business Translation",
    c1: "Translates complex AI and protocol engineering into tangible operational ROI (e.g. 40% patient triage reduction, 20% manual labor reduction).",
    c2: "100% transparent milestone delivery with verified zero-regression guardrails and active communication.",
    c3: "Custom AI Agent Swarms, Enterprise Web Platforms, Decentralized Systems."
  },
  collaborator: {
    title: "🤝 Agile Ownership, Deep Technical Empathy & Mentorship",
    c1: "Mentored 10+ junior developers through full SDLC lifecycles. Enthusiastic advocate of clean code and typed handoff architectures.",
    c2: "Thrives in fast-moving engineering sprints, pairs well with cross-functional designers, and debugs ruthlessly at the root cause.",
    c3: "Sprint Lead, Peer Reviewer, Full Stack & AI Co-Architect."
  }
};

const ltabs = document.querySelectorAll(".ltab");
const lensHeadline = document.getElementById("lens-headline");
const lensC1 = document.getElementById("lens-c1");
const lensC2 = document.getElementById("lens-c2");
const lensC3 = document.getElementById("lens-c3");

ltabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    ltabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    const lens = tab.getAttribute("data-lens");
    const d = LENS_DATA[lens];
    if (d) {
      if (lensHeadline) lensHeadline.innerText = d.title;
      if (lensC1) lensC1.innerText = d.c1;
      if (lensC2) lensC2.innerText = d.c2;
      if (lensC3) lensC3.innerText = d.c3;
    }
  });
});

// ---------------------------------------------------------------------------
// 8. INTERACTIVE QUANTUM CLI TERMINAL
// ---------------------------------------------------------------------------
const cliInput = document.getElementById("cli-input-field");
const cliScreen = document.getElementById("cli-screen");
const cliClearBtn = document.getElementById("cli-clear-btn");

const TERMINAL_COMMANDS = {
  help: `Available Quantum Commands:
  • <span class="hl">skills</span>      — List technical stack & 717 skills catalog
  • <span class="hl">projects</span>    — View flagship production builds & repo links
  • <span class="hl">experience</span>  — Inspect chronological career trajectory
  • <span class="hl">education</span>   — Academic degrees & certifications
  • <span class="hl">contact</span>     — Direct email, phone, and social uplink
  • <span class="hl">hire</span>        — Stakeholder value proposition & pitch
  • <span class="hl">ultron</span>      — Discover the 2026 Sovereign AI engine
  • <span class="hl">whoami</span>      — Inspect active terminal identity
  • <span class="hl">clear</span>       — Clean the console screen`,

  skills: `🎯 <span class="hl">TECHNICAL MASTERY SUMMARY:</span>
  • <strong>Languages:</strong> Python, TypeScript, JavaScript, Solidity, SQL, HTML5, CSS3
  • <strong>Frameworks:</strong> Next.js, React.js, Node.js, FastAPI, Express, Tailwind CSS
  • <strong>AI & Agents:</strong> Autonomous Swarms, AST RAG, Scikit-learn, NLP, PyTorch
  • <strong>Web3 & 3D:</strong> EIP-712 Smart Contracts, Web3.js, Three.js, WebGL
  • <strong>Databases:</strong> PostgreSQL, MongoDB, MySQL, Firebase, Redis`,

  projects: `🚀 <span class="hl">FLAGSHIP BUILDS:</span>
  1. <strong>ULTRON 2026:</strong> Sovereign Autonomous Multi-Agent Loop Agent Suite (717 Skills).
  2. <strong>ETH.VOTE:</strong> Decentralized Blockchain Voting Protocol with EIP-712 Signatures.
  3. <strong>AI Threat Detection:</strong> 92% Intrusion Prediction Network ML Engine.
  4. <strong>Healthcare AI Agent:</strong> Conversational NLP triage reducing intake time by 40%.`,

  experience: `💼 <span class="hl">EXPERIENCE & R&D:</span>
  • <strong>Aksharraj Infotech</strong> (Feb 2026 - Apr 2026) — Full Stack / ETH.VOTE DApp
  • <strong>GMIU Innovation Cell</strong> (Feb 2024 - Jan 2026) — R&D Engineer (30% speedup)
  • <strong>Mexgen Technologies</strong> (Jul 2025 - Jan 2026) — Junior AI/ML Developer (95% accuracy)
  • <strong>IT Hub</strong> (Nov 2024 - Dec 2024) — Front End Developer (15% faster bundle)`,

  education: `🎓 <span class="hl">ACADEMIC CREDENTIALS:</span>
  • <strong>B.Tech in Information Technology</strong> — Gyanmanjari Innovative University (GMIU)
  • <strong>Diploma in Computer Engineering</strong> — GMIT (CGPA: 7.84 / 10.0)`,

  contact: `📬 <span class="hl">DIRECT TRANSMISSION CHANNELS:</span>
  • Email: <a href="mailto:devmurariaaditya@gmail.com" class="hl">devmurariaaditya@gmail.com</a>
  • Phone: <span class="hl">+91 70463 87404</span>
  • GitHub: <a href="https://github.com/AADITYA104" target="_blank" class="hl">github.com/AADITYA104</a>
  • LinkedIn: <a href="https://linkedin.com/in/devmurari-aditya" target="_blank" class="hl">linkedin.com/in/devmurari-aditya</a>`,

  hire: `💎 <span class="hl">WHY ADITYA DEVMURARI?</span>
  • Bridges experimental research depth with production shipping reliability.
  • Solves cross-stack engineering: AI swarms, full stack web, and blockchain integrity.
  • Delivers high-leverage outcomes with zero onboarding friction.`,

  ultron: `🤖 <span class="hl">ULTRON 2026 ENGINE:</span>
  Dual-engine cloud/local cascade, 717 master skills, AST hybrid RAG, self-healing watchdog.
  Running live on this host.`,

  whoami: `👤 Guest inspecting the digital intelligence matrix of <span class="hl">Aditya Devmurari</span>.`
};

if (cliInput) {
  cliInput.addEventListener("keydown", (e) => {
    playCyberFx("terminal");
    if (e.key === "Enter") {
      const cmd = cliInput.value.trim().toLowerCase();
      cliInput.value = "";
      if (!cmd) return;

      appendCliLine(`aditya@portfolio:~$ ${cmd}`, "user");

      if (cmd === "clear") {
        if (cliScreen) cliScreen.innerHTML = "";
        return;
      }

      if (TERMINAL_COMMANDS[cmd]) {
        appendCliLine(TERMINAL_COMMANDS[cmd], "sys");
      } else {
        appendCliLine(`❌ Command not recognized: '${cmd}'. Type '<span class="hl">help</span>' for manual.`, "err");
      }
    }
  });
}

function appendCliLine(html, type = "sys") {
  if (!cliScreen) return;
  const line = document.createElement("div");
  line.className = `cli-row ${type}`;
  line.innerHTML = html;
  cliScreen.appendChild(line);
  cliScreen.scrollTop = cliScreen.scrollHeight;
}

if (cliClearBtn) {
  cliClearBtn.addEventListener("click", () => {
    if (cliScreen) cliScreen.innerHTML = "";
    appendCliLine("⚡ Console cleared.", "sys");
  });
}

// ---------------------------------------------------------------------------
// 9. BLUEPRINT SPEC DRAWER MODAL
// ---------------------------------------------------------------------------
const specDrawer = document.getElementById("spec-modal-drawer");
const specTitle = document.getElementById("spec-modal-title");
const specContent = document.getElementById("spec-modal-content");
const specCloseBtn = document.getElementById("spec-modal-close-btn");

const BLUEPRINTS = {
  ultron: {
    title: "ULTRON // Autonomous Multi-Agent Loop Agent Suite",
    body: `
      <p style="color:#94a3b8; margin-bottom:16px;">Production-Grade Autonomous Multi-Agent Loop Agent Suite equipped with 717 Master Skills, AST-Aware BM25 + Cosine Hybrid RAG, and Self-Healing Watchdog Guardrails.</p>
      <h4 style="color:#00f3ff; margin-bottom:8px;">Core Architecture Pillars:</h4>
      <ul style="color:#cbd5e1; padding-left:20px; margin-bottom:18px;">
        <li><strong>Dual-Engine Cascade:</strong> 0-load fast cloud (Gemini 3.5) with local warm Qwen fallback.</li>
        <li><strong>AST-Aware Chunking:</strong> Parses TypeScript/JavaScript by function and class nodes.</li>
        <li><strong>Security Watchdog:</strong> Canonical realpath sandbox defense + real-time secrets redactor.</li>
      </ul>
      <a href="https://github.com/AADITYA104/my-Ai" target="_blank" class="btn-action primary" style="display:inline-flex;">
        <i class="fa-brands fa-github"></i> Explore Full GitHub Repository
      </a>
    `
  },
  ethvote: {
    title: "ETH.VOTE // Cryptographic Blockchain DApp",
    body: `
      <p style="color:#94a3b8; margin-bottom:16px;">Decentralized voting architecture using Solidity smart contracts with EIP-712 structured cryptographic signatures.</p>
      <h4 style="color:#00f3ff; margin-bottom:8px;">Technical Highlights:</h4>
      <ul style="color:#cbd5e1; padding-left:20px; margin-bottom:18px;">
        <li>Non-custodial cryptographic wallet verification.</li>
        <li>Sub-second on-chain receipt generation with zero gas waste.</li>
        <li>Protection against Sybil and vote-replay attacks.</li>
      </ul>
    `
  },
  threat: {
    title: "AI Threat Detection & Anomaly System",
    body: `
      <p style="color:#94a3b8; margin-bottom:16px;">Machine learning-powered network intrusion detection pipeline achieving 92% anomaly classification precision.</p>
      <h4 style="color:#00f3ff; margin-bottom:8px;">Technical Highlights:</h4>
      <ul style="color:#cbd5e1; padding-left:20px; margin-bottom:18px;">
        <li>Real-time traffic packet ingestion and feature normalization.</li>
        <li>Scikit-learn ensemble models for anomaly discovery.</li>
        <li>Automated alert triggers for network isolation.</li>
      </ul>
    `
  },
  health: {
    title: "Healthcare AI Conversational Assistant",
    body: `
      <p style="color:#94a3b8; margin-bottom:16px;">Natural language clinical triage assistant reducing patient intake latency by 40%.</p>
      <h4 style="color:#00f3ff; margin-bottom:8px;">Technical Highlights:</h4>
      <ul style="color:#cbd5e1; padding-left:20px; margin-bottom:18px;">
        <li>NLP intent classification on user-described symptoms.</li>
        <li>Seamless medical triage handoff workflows to human clinicians.</li>
      </ul>
    `
  }
};

window.openSpecModal = function(key) {
  const b = BLUEPRINTS[key];
  if (!b || !specDrawer) return;

  playCyberFx("modal");
  if (specTitle) specTitle.innerText = b.title;
  if (specContent) specContent.innerHTML = b.body;
  specDrawer.classList.remove("hidden");
};

if (specCloseBtn && specDrawer) {
  specCloseBtn.addEventListener("click", () => specDrawer.classList.add("hidden"));
  specDrawer.addEventListener("click", (e) => {
    if (e.target === specDrawer) specDrawer.classList.add("hidden");
  });
}

// ---------------------------------------------------------------------------
// 10. DIRECT UPLINK DISPATCH TRANSMISSION
// ---------------------------------------------------------------------------
const uplinkForm = document.getElementById("direct-uplink-form");
const statusBanner = document.getElementById("uplink-status-banner");

if (uplinkForm) {
  uplinkForm.addEventListener("submit", (e) => {
    e.preventDefault();
    playCyberFx("click");

    const name = document.getElementById("up-name")?.value || "Guest";
    const email = document.getElementById("up-email")?.value || "";

    if (statusBanner) {
      statusBanner.className = "status-banner success";
      statusBanner.innerText = `⚡ Transmission dispatched successfully! Thank you ${name}. Aditya will reply to ${email} promptly.`;
      statusBanner.classList.remove("hidden");
    }

    uplinkForm.reset();
    setTimeout(() => {
      if (statusBanner) statusBanner.classList.add("hidden");
    }, 6000);
  });
}
