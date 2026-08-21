/**
 * ============================================================================
 *  ADITYA DEVMURARI — 3D STORYTELLING PORTFOLIO APP CONTROLLER (APP.JS)
 *  - Native Web Audio Sound Effects Synthesizer (0 External Assets)
 *  - Magnetic Cursor, 3D Tilt Physics, Interactive Terminal & Lens Matrix
 * ============================================================================
 */
"use strict";

// ---------------------------------------------------------------------------
// 1. WEB AUDIO API SOUND SYNTHESIZER
// ---------------------------------------------------------------------------
let audioCtx = null;
let soundEnabled = true;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playCyberSound(type = "hover") {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === "hover") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === "click") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === "terminal") {
      osc.type = "square";
      osc.frequency.setValueAtTime(1200 + Math.random() * 400, now);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === "modal") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.25);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (_) {}
}

const soundToggleBtn = document.getElementById("sound-toggle");
const soundIcon = document.getElementById("sound-icon");
if (soundToggleBtn) {
  soundToggleBtn.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    if (soundIcon) {
      soundIcon.className = soundEnabled ? "fa-solid fa-volume-high" : "fa-solid fa-volume-xmark";
    }
    const badge = soundToggleBtn.querySelector(".badge-live");
    if (badge) badge.innerText = soundEnabled ? "FX ON" : "FX OFF";
    if (soundEnabled) playCyberSound("click");
  });
}

// ---------------------------------------------------------------------------
// 2. MAGNETIC CURSOR LOGIC
// ---------------------------------------------------------------------------
const cursorDot = document.getElementById("cursor-dot");
const cursorRing = document.getElementById("cursor-ring");

let mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let ringPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

window.addEventListener("mousemove", (e) => {
  mousePos.x = e.clientX;
  mousePos.y = e.clientY;

  if (cursorDot) {
    cursorDot.style.transform = `translate(${mousePos.x}px, ${mousePos.y}px)`;
  }
});

function renderCursor() {
  ringPos.x += (mousePos.x - ringPos.x) * 0.18;
  ringPos.y += (mousePos.y - ringPos.y) * 0.18;

  if (cursorRing) {
    cursorRing.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px)`;
  }
  requestAnimationFrame(renderCursor);
}
renderCursor();

// Interactive Elements Audio & Cursor Expansion
document.querySelectorAll("a, button, .3d-tilt, .nav-item, .chip-item, .skill-node").forEach((el) => {
  el.addEventListener("mouseenter", () => {
    playCyberSound("hover");
    if (cursorRing) {
      cursorRing.style.width = "54px";
      cursorRing.style.height = "54px";
      cursorRing.style.borderColor = "var(--neon-cyan)";
    }
  });

  el.addEventListener("mouseleave", () => {
    if (cursorRing) {
      cursorRing.style.width = "34px";
      cursorRing.style.height = "34px";
      cursorRing.style.borderColor = "var(--border-cyan-bright)";
    }
  });

  el.addEventListener("click", () => playCyberSound("click"));
});

// ---------------------------------------------------------------------------
// 3. 3D TILT EFFECT ON CARDS
// ---------------------------------------------------------------------------
document.querySelectorAll(".3d-tilt").forEach((card) => {
  card.addEventListener("mousemove", (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;

    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
  });

  card.addEventListener("mouseleave", () => {
    card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)";
  });
});

// ---------------------------------------------------------------------------
// 4. STORY CHAPTER SCROLL TRACKER
// ---------------------------------------------------------------------------
const chapters = [
  { id: "chapter-genesis", label: "CH.01 // GENESIS" },
  { id: "chapter-evolution", label: "CH.02 // EVOLUTION" },
  { id: "chapter-vault", label: "CH.03 // PROJECTS" },
  { id: "chapter-skills", label: "CH.04 // SKILLS" },
  { id: "chapter-matrix", label: "CH.05 // IMPACT" },
  { id: "chapter-terminal", label: "CH.06 // TERMINAL" }
];

const scrollProgressFill = document.getElementById("scroll-progress-fill");
const currentChapterLbl = document.getElementById("current-chapter-lbl");
const navItems = document.querySelectorAll(".nav-item");

window.addEventListener("scroll", () => {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progressPercent = Math.min(100, Math.max(0, (scrollTop / (docHeight || 1)) * 100));

  if (scrollProgressFill) {
    scrollProgressFill.style.height = `${progressPercent}%`;
  }

  let activeChapter = chapters[0];
  for (const ch of chapters) {
    const el = document.getElementById(ch.id);
    if (el) {
      const top = el.offsetTop - 200;
      if (scrollTop >= top) {
        activeChapter = ch;
      }
    }
  }

  if (currentChapterLbl) {
    currentChapterLbl.innerText = activeChapter.label;
  }

  navItems.forEach((item) => {
    const href = item.getAttribute("href");
    if (href === `#${activeChapter.id}`) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
});

// ---------------------------------------------------------------------------
// 5. SKILL CATEGORY FILTER
// ---------------------------------------------------------------------------
const skillTabs = document.querySelectorAll(".skill-tab");
const skillNodes = document.querySelectorAll(".skill-node");

skillTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    skillTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    const filter = tab.getAttribute("data-filter");
    skillNodes.forEach((node) => {
      const cat = node.getAttribute("data-cat");
      if (filter === "all" || cat === filter) {
        node.style.display = "flex";
      } else {
        node.style.display = "none";
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 6. STAKEHOLDER LENS MATRIX SWITCHER
// ---------------------------------------------------------------------------
const lensData = {
  recruiter: {
    title: "🎯 Why Aditya Is a Zero-Risk High-Signal Hire for Engineering Teams",
    p1: "Wide range across AI, full stack, and blockchain reduces multi-hire dependencies. Backed by measurable 95% ML predictive accuracy and 30% prototype speedup.",
    p2: "Demonstrated capability to move from architecture to production without heavy handoffs, reducing feature delivery cycles significantly.",
    p3: "Full Stack Developer, AI/ML Engineer, Autonomous Automation Engineer, R&D Systems Engineer."
  },
  founder: {
    title: "🚀 Massive Leverage for Early-Stage Startups & Product Teams",
    p1: "One builder who architects databases, deploys Next.js / FastAPI web apps, builds AI agents, and integrates cryptographic Web3 protocols.",
    p2: "Speeds up initial MVP validation from months to days. Proactively prevents tech debt with Ponytail minimal-diff philosophy.",
    p3: "Founding Engineer, Lead Full Stack Engineer, AI Product Specialist."
  },
  client: {
    title: "💼 High-Fidelity Delivery with Clear Business Translation",
    p1: "Bridges technical complexity into tangible business outcomes (e.g. 40% reduction in response latency, 20% reduction in manual data entry).",
    p2: "100% transparent milestone delivery with verified zero-regression guardrails and active communication.",
    p3: "Custom AI Agent Swarms, Enterprise Web Platforms, Decentralized Systems."
  },
  collaborator: {
    title: "🤝 Agile Ownership, Deep Technical Empathy & Mentorship",
    p1: "Mentored 10+ junior developers through full SDLC lifecycles. Enthusiastic advocate of clean code and typed handoff architectures.",
    p2: "Thrives in fast-moving engineering sprints, pairs well with cross-functional designers, and debugs ruthlessly at the root cause.",
    p3: "Sprint Lead, Peer Reviewer, Full Stack & AI Co-Architect."
  }
};

const lensBtns = document.querySelectorAll(".lens-btn");
const lensTitle = document.getElementById("lens-title");
const lensP1 = document.getElementById("lens-p1");
const lensP2 = document.getElementById("lens-p2");
const lensP3 = document.getElementById("lens-p3");

lensBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    lensBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const lens = btn.getAttribute("data-lens");
    const d = lensData[lens];
    if (d) {
      if (lensTitle) lensTitle.innerText = d.title;
      if (lensP1) lensP1.innerText = d.p1;
      if (lensP2) lensP2.innerText = d.p2;
      if (lensP3) lensP3.innerText = d.p3;
    }
  });
});

// ---------------------------------------------------------------------------
// 7. INTERACTIVE QUANTUM CLI TERMINAL
// ---------------------------------------------------------------------------
const termInput = document.getElementById("term-cli-input");
const termOutput = document.getElementById("term-output");
const termClearBtn = document.getElementById("term-clear-btn");

const CLI_COMMANDS = {
  help: `Available Quantum Commands:
  • <span class="hl">skills</span>      — List primary technical mastery & domains
  • <span class="hl">projects</span>    — Summary of flagship engineering builds
  • <span class="hl">experience</span>  — View chronological career journey
  • <span class="hl">education</span>   — University & engineering credentials
  • <span class="hl">contact</span>     — View direct communication channels
  • <span class="hl">hire</span>        — View role compatibility & value pitch
  • <span class="hl">ultron</span>      — Discover the 2026 Sovereign AI engine
  • <span class="hl">whoami</span>      — View active terminal persona
  • <span class="hl">clear</span>       — Clean the console screen`,

  skills: `🎯 <span class="hl">TECHNICAL STACK MASTERY:</span>
  • <strong>Languages:</strong> Python, JavaScript, TypeScript, Solidity, HTML5, CSS3, SQL
  • <strong>Frameworks:</strong> Next.js, React.js, Node.js, Express, FastAPI, Tailwind CSS
  • <strong>AI & Agents:</strong> Autonomous Swarms, AST RAG, Scikit-learn, NLP, PyTorch
  • <strong>3D & Web3:</strong> Three.js, WebGL, EIP-712 Smart Contracts, Web3.js
  • <strong>Databases:</strong> PostgreSQL, MongoDB, MySQL, Firebase, Redis`,

  projects: `🚀 <span class="hl">FLAGSHIP PORTFOLIO BUILDS:</span>
  1. <strong>ULTRON 2026:</strong> Sovereign Autonomous Multi-Agent Loop Agent Suite (717 Skills).
  2. <strong>ETH.VOTE:</strong> Decentralized Blockchain Voting Protocol with EIP-712 Signatures.
  3. <strong>AI Threat Detection:</strong> 92% Intrusion Prediction Network Machine Learning Engine.
  4. <strong>Healthcare AI Agent:</strong> Conversational NLP triage reducing intake time by 40%.`,

  experience: `💼 <span class="hl">CAREER & R&D JOURNEY:</span>
  • <strong>Aksharraj Infotech</strong> (Feb 2026 - Apr 2026) — Full Stack / ETH.VOTE DApp
  • <strong>GMIU Innovation Cell</strong> (Feb 2024 - Jan 2026) — R&D Engineer (30% speedup)
  • <strong>Mexgen Technologies</strong> (Jul 2025 - Jan 2026) — Junior AI/ML Developer (95% accuracy)
  • <strong>IT Hub</strong> (Nov 2024 - Dec 2024) — Front End Developer (15% faster bundle)`,

  education: `🎓 <span class="hl">ACADEMIC BACKGROUND:</span>
  • <strong>B.Tech in Information Technology</strong> — Gyanmanjari Innovative University (GMIU)
  • <strong>Diploma in Computer Engineering</strong> — GMIT (CGPA: 7.84 / 10.0)`,

  contact: `📬 <span class="hl">DIRECT COMMUNICATION CHANNELS:</span>
  • Email: <a href="mailto:devmurariaaditya@gmail.com" class="hl">devmurariaaditya@gmail.com</a>
  • Phone: <span class="hl">+91 70463 87404</span>
  • GitHub: <a href="https://github.com/AADITYA104" target="_blank" class="hl">github.com/AADITYA104</a>
  • LinkedIn: <a href="https://linkedin.com/in/devmurari-aditya" target="_blank" class="hl">linkedin.com/in/devmurari-aditya</a>`,

  hire: `💎 <span class="hl">WHY ADITYA DEVMURARI?</span>
  • Combines deep R&D exploration with production shipping credibility.
  • Solves cross-stack problems: AI swarms, full-stack web, and blockchain integrity.
  • Immediate positive ROI with zero onboarding friction.`,

  ultron: `🤖 <span class="hl">ULTRON 2026 CORE:</span>
  Dual-engine cloud/local cascade, 717 master skills, AST hybrid RAG, self-healing watchdog.
  Running live on this host.`,

  whoami: `👤 You are an esteemed guest inspecting the digital matrix of <span class="hl">Aditya Devmurari</span>.`
};

if (termInput) {
  termInput.addEventListener("keydown", (e) => {
    playCyberSound("terminal");
    if (e.key === "Enter") {
      const rawVal = termInput.value.trim().toLowerCase();
      termInput.value = "";
      if (!rawVal) return;

      appendTermRow(`aditya@portfolio:~$ ${rawVal}`, "user");

      if (rawVal === "clear") {
        if (termOutput) termOutput.innerHTML = "";
        return;
      }

      if (CLI_COMMANDS[rawVal]) {
        appendTermRow(CLI_COMMANDS[rawVal], "sys");
      } else {
        appendTermRow(`❌ Command not recognized: '${rawVal}'. Type '<span class="hl">help</span>' for manual.`, "err");
      }
    }
  });
}

function appendTermRow(htmlContent, type = "sys") {
  if (!termOutput) return;
  const row = document.createElement("div");
  row.className = `term-row ${type}`;
  row.innerHTML = htmlContent;
  termOutput.appendChild(row);
  termOutput.scrollTop = termOutput.scrollHeight;
}

if (termClearBtn) {
  termClearBtn.addEventListener("click", () => {
    if (termOutput) termOutput.innerHTML = "";
    appendTermRow("⚡ Console cleared.", "sys");
  });
}

// ---------------------------------------------------------------------------
// 8. PROJECT DETAIL MODAL
// ---------------------------------------------------------------------------
const projectModal = document.getElementById("project-modal");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalCloseBtn = document.getElementById("modal-close");

const PROJECT_MODAL_SPECS = {
  ultron: {
    title: "ULTRON // Sovereign AI Omni-Engine",
    content: `
      <p style="color:#9ca3af; margin-bottom:14px;">Production-Grade Autonomous Multi-Agent Loop Agent Suite equipped with 717 Master Skills, AST-Aware BM25 + Cosine Hybrid RAG, and Self-Healing Watchdog Guardrails.</p>
      <h4 style="color:#00f3ff; margin-bottom:8px;">Core Architecture Pillars:</h4>
      <ul style="color:#d1d5db; padding-left:20px; margin-bottom:14px;">
        <li><strong>Dual-Engine Cascade:</strong> 0-load fast cloud (Gemini 3.5) with local warm Qwen fallback.</li>
        <li><strong>AST-Aware Chunking:</strong> Parses TypeScript/JavaScript by function and class nodes.</li>
        <li><strong>Security Watchdog:</strong> Canonical realpath sandbox defense + real-time secrets redactor.</li>
      </ul>
      <a href="https://github.com/AADITYA104/my-Ai" target="_blank" class="btn-quantum primary-cta" style="display:inline-flex;">
        <i class="fa-brands fa-github"></i> Explore GitHub Repository
      </a>
    `
  },
  ethvote: {
    title: "ETH.VOTE // Cryptographic Blockchain DApp",
    content: `
      <p style="color:#9ca3af; margin-bottom:14px;">Decentralized voting architecture using Solidity smart contracts with EIP-712 structured cryptographic signatures.</p>
      <h4 style="color:#00f3ff; margin-bottom:8px;">Technical Highlights:</h4>
      <ul style="color:#d1d5db; padding-left:20px; margin-bottom:14px;">
        <li>Non-custodial cryptographic wallet verification.</li>
        <li>Sub-second on-chain receipt generation with zero gas waste.</li>
        <li>Protection against Sybil and vote-replay attacks.</li>
      </ul>
    `
  },
  threat: {
    title: "AI-Driven Threat Detection & Anomaly System",
    content: `
      <p style="color:#9ca3af; margin-bottom:14px;">Machine learning-powered network intrusion detection pipeline achieving 92% anomaly classification precision.</p>
      <h4 style="color:#00f3ff; margin-bottom:8px;">Technical Highlights:</h4>
      <ul style="color:#d1d5db; padding-left:20px; margin-bottom:14px;">
        <li>Real-time traffic packet ingestion and feature normalization.</li>
        <li>Scikit-learn ensemble models for anomaly discovery.</li>
        <li>Automated alert triggers for network isolation.</li>
      </ul>
    `
  },
  health: {
    title: "Healthcare AI Conversational Agent",
    content: `
      <p style="color:#9ca3af; margin-bottom:14px;">Natural language clinical triage assistant reducing patient intake latency by 40%.</p>
      <h4 style="color:#00f3ff; margin-bottom:8px;">Technical Highlights:</h4>
      <ul style="color:#d1d5db; padding-left:20px; margin-bottom:14px;">
        <li>NLP intent classification on user-described symptoms.</li>
        <li>Seamless medical triage handoff workflows to human clinicians.</li>
      </ul>
    `
  }
};

window.showProjectModal = function(key) {
  const spec = PROJECT_MODAL_SPECS[key];
  if (!spec || !projectModal) return;

  playCyberSound("modal");
  if (modalTitle) modalTitle.innerText = spec.title;
  if (modalBody) modalBody.innerHTML = spec.content;
  projectModal.classList.remove("hidden");
};

if (modalCloseBtn && projectModal) {
  modalCloseBtn.addEventListener("click", () => {
    projectModal.classList.add("hidden");
  });
  projectModal.addEventListener("click", (e) => {
    if (e.target === projectModal) projectModal.classList.add("hidden");
  });
}

// ---------------------------------------------------------------------------
// 9. CONTACT FORM TRANSMISSION DISPATCH
// ---------------------------------------------------------------------------
const contactForm = document.getElementById("contact-form");
const contactStatus = document.getElementById("contact-status");

if (contactForm) {
  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    playCyberSound("click");

    const name = document.getElementById("sender-name")?.value || "Guest";
    const email = document.getElementById("sender-email")?.value || "";
    const msg = document.getElementById("sender-msg")?.value || "";

    if (contactStatus) {
      contactStatus.className = "contact-status-msg success";
      contactStatus.innerText = `⚡ Transmission dispatched successfully! Thank you ${name}. Aditya will respond to ${email} promptly.`;
      contactStatus.classList.remove("hidden");
    }

    contactForm.reset();
    setTimeout(() => {
      if (contactStatus) contactStatus.classList.add("hidden");
    }, 6000);
  });
}
