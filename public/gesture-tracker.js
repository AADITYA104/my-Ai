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

const vid = document.getElementById("webcam-video");
const cvs = document.getElementById("hand-canvas");
const ctx = cvs.getContext("2d");
const pipTip = document.getElementById("pip-tip");
const pipBox = document.getElementById("gesture-pip");
const camBtn = document.getElementById("cam-btn");
const camLbl = document.getElementById("cam-lbl");

function initGestureEngine() {
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
      if (isCamOn && vid.videoWidth > 0) {
        await handsAI.send({ image: vid });
      }
    },
    width: 240,
    height: 180
  });
}

function toggleGestureCam() {
  if (!isCamOn) {
    if (!camTracker) initGestureEngine();
    isCamOn = true;
    pipBox.classList.remove("hidden");
    camBtn.classList.add("active");
    camLbl.innerText = "CAM: ON";
    camTracker.start().catch(err => {
      console.warn("Cam permission failed:", err.message);
      pipTip.innerText = "Mouse control active";
    });
  } else {
    isCamOn = false;
    pipBox.classList.add("hidden");
    camBtn.classList.remove("active");
    camLbl.innerText = "GESTURES";
  }
}

function handleHandDetections(results) {
  cvs.width = vid.videoWidth || 240;
  cvs.height = vid.videoHeight || 180;
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
