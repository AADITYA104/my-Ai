/**
 * ============================================================================
 *  ULTRON APP CONTROLLER (Clean & Snappy)
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

if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = chatInput.value.trim();
    if (!query) return;

    chatInput.value = "";
    appendChatEntry("user", query);

    if (typeof sendQueryToUltron === "function") {
      await sendQueryToUltron(query, true, true);
    }
  });
}

function appendChatEntry(sender, text) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${sender === "user" ? "user" : "ultron"}`;

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.innerText = sender === "user" ? "BOSS" : "ULTRON";

  const p = document.createElement("p");
  p.innerText = text;

  bubble.appendChild(tag);
  bubble.appendChild(p);
  chatLogs.appendChild(bubble);
  chatLogs.scrollTop = chatLogs.scrollHeight;
}
window.appendChatEntry = appendChatEntry;
