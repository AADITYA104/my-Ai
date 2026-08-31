/**
 * ============================================================================
 *  ULTRON GESTURE TRACKER (Optimized Performance)
 * ============================================================================
 */
"use strict";

let camTracker = null;
let handsAI = null;
let isCamOn = false;

let prevPalmX = null;
let prevPalmY = null;
let prevPinch = null;

let vid, cvs, ctx, pipTip, pipBox, camBtn, camLbl;

function ensureGestureElements() {
  if (!vid) vid = document.getElementById("webcam-video");
  if (!cvs) cvs = document.getElementById("hand-canvas");
  if (cvs && !ctx) ctx = cvs.getContext("2d");
  if (!pipTip) pipTip = document.getElementById("pip-tip");
  if (!pipBox) pipBox = document.getElementById("gesture-pip");
  if (!camBtn) camBtn = document.getElementById("cam-btn");
  if (!camLbl) camLbl = document.getElementById("cam-lbl");
}

function initGestureEngine() {
  ensureGestureElements();
  if (!window.Hands || !window.Camera) {
    setTimeout(initGestureEngine, 800);
    return;
  }

  handsAI = new Hands({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });

  handsAI.setOptions({
    maxNumHands: 1,
    modelComplexity: 0, // 0 for ultra high FPS on laptops!
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  handsAI.onResults(handleHandDetections);

  camTracker = new Camera(vid, {
    onFrame: async () => {
      if (isCamOn && vid && vid.videoWidth > 0) {
        await handsAI.send({ image: vid });
      }
    },
    width: 240,
    height: 180
  });
}

function toggleGestureCam() {
  ensureGestureElements();
  if (!isCamOn) {
    if (!camTracker) initGestureEngine();
    isCamOn = true;
    if (pipBox) pipBox.classList.remove("hidden");
    if (camBtn) camBtn.classList.add("active");
    if (camLbl) camLbl.innerText = "CAM: ON";
    if (camTracker) {
      camTracker.start().catch(err => {
        console.warn("Cam permission failed:", err.message);
        if (pipTip) pipTip.innerText = "Mouse control active";
      });
    }
  } else {
    isCamOn = false;
    if (pipBox) pipBox.classList.add("hidden");
    if (camBtn) camBtn.classList.remove("active");
    if (camLbl) camLbl.innerText = "GESTURES";
  }
}

function handleHandDetections(results) {
  ensureGestureElements();
  if (!cvs || !ctx) return;
  cvs.width = (vid && vid.videoWidth) || 240;
  cvs.height = (vid && vid.videoHeight) || 180;
  ctx.save();
  ctx.clearRect(0, 0, cvs.width, cvs.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lms = results.multiHandLandmarks[0];

    // Draw Cyan Hologram Points
    ctx.fillStyle = "#00f0ff";
    for (const p of lms) {
      ctx.beginPath();
      ctx.arc(p.x * cvs.width, p.y * cvs.height, 2.5, 0, 2 * Math.PI);
      ctx.fill();
    }

    const palm = lms[9];
    const thumb = lms[4];
    const index = lms[8];

    // Pinch distance for scaling
    const dx = thumb.x - index.x;
    const dy = thumb.y - index.y;
    const pinch = Math.sqrt(dx * dx + dy * dy);

    if (prevPalmX !== null) {
      const deltaX = (palm.x - prevPalmX) * 14;
      const deltaY = (palm.y - prevPalmY) * 14;
      if (typeof setUltronGestureTransform === "function") {
        setUltronGestureTransform(-deltaX, deltaY);
      }
    }

    if (prevPinch !== null) {
      const scale = 0.5 + (pinch * 4.8);
      if (typeof setUltronGestureTransform === "function") {
        setUltronGestureTransform(undefined, undefined, scale);
      }
    }

    prevPalmX = palm.x;
    prevPalmY = palm.y;
    prevPinch = pinch;
    if (pipTip) pipTip.innerText = "✨ Tracking Hand • Manipulating Core";
  } else {
    prevPalmX = null;
    prevPalmY = null;
    prevPinch = null;
    if (pipTip) pipTip.innerText = "Show hand to rotate & pinch";
  }

  ctx.restore();
}

window.toggleGestureCam = toggleGestureCam;
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(initGestureEngine, 1000);
});
