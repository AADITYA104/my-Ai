/**
 * ============================================================================
 *  ULTRON APP CONTROLLER — Multimodal Vision, Live SSE Terminal & Voice Sync
 * ============================================================================
 */
"use strict";

const chatOverlay = document.getElementById("holo-chat-overlay");
const chatLogs = document.getElementById("chat-logs");
const chatForm = document.getElementById("chat-input-form");
const chatInput = document.getElementById("chat-input-field");
const chatBtn = document.getElementById("chat-btn");
const closeChatBtn = document.getElementById("close-chat");
const micBtnElement = document.getElementById("mic-btn");
const camBtnElement = document.getElementById("cam-btn");
const termBtnElement = document.getElementById("term-btn");
const holoTerminal = document.getElementById("holo-terminal");
const closeTermBtn = document.getElementById("close-term");
const clearTermBtn = document.getElementById("clear-term");
const termLogs = document.getElementById("term-logs");

const attachImgBtn = document.getElementById("attach-img-btn");
const visionFileInput = document.getElementById("vision-file-input");
const imagePreviewContainer = document.getElementById("image-preview-container");
const imagePreviewThumb = document.getElementById("image-preview-thumb");
const previewFilename = document.getElementById("preview-filename");
const removeImageBtn = document.getElementById("remove-image-btn");

let pendingImageBase64 = null;

// ---------------------------------------------------------------------------
// 1. CHAT & TERMINAL TOGGLE CONTROLS
// ---------------------------------------------------------------------------
function openHoloChat() {
  chatOverlay.classList.remove("hidden");
  chatInput.focus();
}

function closeHoloChat() {
  chatOverlay.classList.add("hidden");
}

window.openHoloChat = openHoloChat;
window.closeHoloChat = closeHoloChat;

if (chatBtn) {
  chatBtn.addEventListener("click", () => {
    chatOverlay.classList.toggle("hidden");
    if (!chatOverlay.classList.contains("hidden")) chatInput.focus();
  });
}

if (closeChatBtn) {
  closeChatBtn.addEventListener("click", closeHoloChat);
}

if (termBtnElement) {
  termBtnElement.addEventListener("click", () => {
    holoTerminal.classList.toggle("hidden");
  });
}

if (closeTermBtn) {
  closeTermBtn.addEventListener("click", () => {
    holoTerminal.classList.add("hidden");
  });
}

if (clearTermBtn) {
  clearTermBtn.addEventListener("click", () => {
    termLogs.innerHTML = `<div class="term-line sys">⚡ [SYSTEM] Logs cleared Boss.</div>`;
  });
}

if (micBtnElement) {
  micBtnElement.addEventListener("click", () => {
    if (typeof toggleMic === "function") toggleMic();
  });
}

if (camBtnElement) {
  camBtnElement.addEventListener("click", () => {
    if (typeof toggleGestureCam === "function") toggleGestureCam();
  });
}

// ---------------------------------------------------------------------------
// 2. VISION & SCREENSHOT ATTACHMENT HANDLERS
// ---------------------------------------------------------------------------
if (attachImgBtn && visionFileInput) {
  attachImgBtn.addEventListener("click", () => {
    visionFileInput.click();
  });

  visionFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleImageSelected(file);
  });
}

// Handle clipboard screenshot pasting (Ctrl+V)
window.addEventListener("paste", (e) => {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (const item of items) {
    if (item.type.indexOf("image") === 0) {
      const blob = item.getAsFile();
      handleImageSelected(blob, "Pasted_Screenshot.png");
      openHoloChat();
      break;
    }
  }
});

function handleImageSelected(file, customName = null) {
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingImageBase64 = e.target.result;
    imagePreviewThumb.src = pendingImageBase64;
    previewFilename.innerText = customName || file.name || "attached_image.png";
    imagePreviewContainer.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

if (removeImageBtn) {
  removeImageBtn.addEventListener("click", () => {
    pendingImageBase64 = null;
    imagePreviewContainer.classList.add("hidden");
    if (visionFileInput) visionFileInput.value = "";
  });
}

// ---------------------------------------------------------------------------
// 3. CHAT SUBMISSION WITH MULTIMODAL VISION SUPPORT
// ---------------------------------------------------------------------------
if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = chatInput.value.trim();
    if (!query && !pendingImageBase64) return;

    const attachedImg = pendingImageBase64;
    chatInput.value = "";
    pendingImageBase64 = null;
    imagePreviewContainer.classList.add("hidden");
    if (visionFileInput) visionFileInput.value = "";

    appendChatEntry("user", query || "Analyze image", attachedImg);

    if (typeof sendQueryToUltron === "function") {
      await sendQueryToUltron(query, true, true, attachedImg);
    }
  });
}

function appendChatEntry(sender, text, imageSrc = null) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${sender === "user" ? "user" : "ultron"}`;

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.innerText = sender === "user" ? "BOSS" : "ULTRON";
  bubble.appendChild(tag);

  if (imageSrc) {
    const imgElem = document.createElement("img");
    imgElem.src = imageSrc;
    imgElem.style.maxWidth = "100%";
    imgElem.style.maxHeight = "160px";
    imgElem.style.borderRadius = "6px";
    imgElem.style.marginBottom = "8px";
    imgElem.style.display = "block";
    bubble.appendChild(imgElem);
  }

  const p = document.createElement("p");
  p.innerText = text;
  bubble.appendChild(p);

  chatLogs.appendChild(bubble);
  chatLogs.scrollTop = chatLogs.scrollHeight;
}
window.appendChatEntry = appendChatEntry;

// ---------------------------------------------------------------------------
// 4. REAL-TIME SERVER-SENT EVENTS (SSE) TASK STREAMING
// ---------------------------------------------------------------------------
function initTaskStream() {
  const evtSource = new EventSource("/api/ultron/task-stream");

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      appendTerminalLine(data);
    } catch (_) {}
  };

  evtSource.onerror = () => {
    console.warn("SSE Connection lost. Reconnecting...");
  };
}

function appendTerminalLine(data) {
  const line = document.createElement("div");
  line.className = "term-line";

  if (data.type === "task_started") {
    line.className += " sys";
    line.innerText = `🎯 [TASK STARTED] ${data.goal} (Skills: ${data.matchedSkills.join(", ")})`;
    holoTerminal.classList.remove("hidden");
  } else if (data.type === "log") {
    line.innerText = `> ${data.text}`;
  } else if (data.type === "task_completed") {
    line.className += " sys";
    line.innerText = `✅ [TASK COMPLETED] Finished successfully.`;
  } else if (data.type === "task_failed") {
    line.className += " err";
    line.innerText = `❌ [TASK FAILED] ${data.error}`;
  } else {
    line.innerText = data.message || JSON.stringify(data);
  }

  termLogs.appendChild(line);
  termLogs.scrollTop = termLogs.scrollHeight;
}

window.addEventListener("DOMContentLoaded", () => {
  initTaskStream();
});
