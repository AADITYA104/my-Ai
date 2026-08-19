/**
 * ============================================================================
 *  ULTRON 3D NEURAL SPHERE — High-Density Particle Engine (Three.js)
 *  Direct replica of the Golden Neural Hologram from the reference photos.
 *  15,000+ tiny glowing amber & gold particles, orbital cybernetic rings & cyan synapses.
 * ============================================================================
 */
"use strict";

let scene, camera, renderer;
let ultronGroup;
let mainParticleSphere, denseCoreCloud, outerDataRings = [], synapticRays = [];
let clock = new THREE.Clock();

let audioPulseIntensity = 0;
let currentScale = 1.0;
let targetScale = 1.0;

function initUltron3D() {
  const container = document.getElementById("canvas-container");
  const width = window.innerWidth;
  const height = window.innerHeight;

  // 1. Scene & Camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
  camera.position.set(0, 0, 7.5);

  // 2. Optimized WebGL Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  container.appendChild(renderer.domElement);

  // 3. Master Ultron Group
  ultronGroup = new THREE.Group();
  scene.add(ultronGroup);

  // 4. Lights
  const ambientLight = new THREE.AmbientLight(0xffaa00, 0.8);
  scene.add(ambientLight);

  const coreLight = new THREE.PointLight(0xffc400, 4, 30);
  coreLight.position.set(0, 0, 0);
  ultronGroup.add(coreLight);

  const cyanRimLight = new THREE.PointLight(0x00f0ff, 2.5, 30);
  cyanRimLight.position.set(4, 2, 4);
  scene.add(cyanRimLight);

  // 5. Generate Dense Neural Particle Sphere (12,000 Tiny Points like in Photo 1 & 2)
  const particleCount = 14000;
  const particleGeo = new THREE.BufferGeometry();
  const posArray = new Float32Array(particleCount * 3);
  const colArray = new Float32Array(particleCount * 3);
  const sizeArray = new Float32Array(particleCount);

  const colAmber = new THREE.Color(0xffaa00);
  const colGold = new THREE.Color(0xffd000);
  const colWhite = new THREE.Color(0xfffae0);
  const colCyan = new THREE.Color(0x00f0ff);

  for (let i = 0; i < particleCount; i++) {
    // Shell & volumetric cluster distribution
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    
    // Varying radii creating volumetric layered depth
    const layer = Math.random();
    let r;
    if (layer < 0.3) {
      r = 0.5 + Math.random() * 0.7; // dense center
    } else if (layer < 0.85) {
      r = 1.6 + (Math.random() - 0.5) * 0.4; // middle main shell
    } else {
      r = 2.1 + (Math.random() - 0.5) * 0.3; // outer aura
    }

    posArray[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    posArray[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    posArray[i * 3 + 2] = r * Math.cos(phi);

    // Color distribution
    let c = colAmber;
    if (layer < 0.25) c = colWhite;
    else if (Math.random() > 0.8) c = colGold;
    else if (Math.random() > 0.96) c = colCyan;

    colArray[i * 3] = c.r;
    colArray[i * 3 + 1] = c.g;
    colArray[i * 3 + 2] = c.b;

    sizeArray[i] = 0.02 + Math.random() * 0.04;
  }

  particleGeo.setAttribute("position", new THREE.BufferAttribute(posArray, 3));
  particleGeo.setAttribute("color", new THREE.BufferAttribute(colArray, 3));

  const particleMat = new THREE.PointsMaterial({
    size: 0.038,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending
  });

  mainParticleSphere = new THREE.Points(particleGeo, particleMat);
  ultronGroup.add(mainParticleSphere);

  // 6. Glowing Central Core Cluster
  const coreCount = 3500;
  const coreGeo = new THREE.BufferGeometry();
  const corePos = new Float32Array(coreCount * 3);
  const coreCol = new Float32Array(coreCount * 3);

  for (let i = 0; i < coreCount; i++) {
    const rad = Math.random() * 0.65;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 2 - 1);

    corePos[i * 3] = rad * Math.sin(ph) * Math.cos(th);
    corePos[i * 3 + 1] = rad * Math.sin(ph) * Math.sin(th);
    corePos[i * 3 + 2] = rad * Math.cos(ph);

    coreCol[i * 3] = 1.0;
    coreCol[i * 3 + 1] = 0.85;
    coreCol[i * 3 + 2] = 0.3;
  }
  coreGeo.setAttribute("position", new THREE.BufferAttribute(corePos, 3));
  coreGeo.setAttribute("color", new THREE.BufferAttribute(coreCol, 3));

  const coreMat = new THREE.PointsMaterial({
    size: 0.042,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending
  });
  denseCoreCloud = new THREE.Points(coreGeo, coreMat);
  ultronGroup.add(denseCoreCloud);

  // 7. Intricate Concentric Cyber Ring Arcs (Orbital HUD lines)
  const ringConfigs = [
    { r: 1.8, seg: 96, col: 0xffaa00, op: 0.7, sp: 0.008, tilt: [0.4, 0.2, 0.1] },
    { r: 2.2, seg: 120, col: 0xffcc00, op: 0.65, sp: -0.006, tilt: [1.2, -0.6, 0.4] },
    { r: 2.5, seg: 120, col: 0xff9900, op: 0.5, sp: 0.005, tilt: [-0.8, 1.4, -0.3] },
    { r: 2.8, seg: 120, col: 0x00f0ff, op: 0.6, sp: -0.004, tilt: [0.1, -1.0, 0.8] }
  ];

  ringConfigs.forEach(cfg => {
    const geo = new THREE.RingGeometry(cfg.r - 0.015, cfg.r + 0.015, cfg.seg);
    const mat = new THREE.MeshBasicMaterial({
      color: cfg.col,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: cfg.op,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.set(cfg.tilt[0], cfg.tilt[1], cfg.tilt[2]);
    outerDataRings.push({ mesh, speed: cfg.sp });
    ultronGroup.add(mesh);
  });

  // 8. Cyan Neural Synaptic Arcs (Like Photo 3)
  for (let i = 0; i < 8; i++) {
    const pts = [];
    let cur = new THREE.Vector3(0, 0, 0);
    for (let j = 0; j < 8; j++) {
      cur = cur.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5
      ));
      pts.push(cur);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.015, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });
    const ray = new THREE.Mesh(tubeGeo, tubeMat);
    synapticRays.push(ray);
    ultronGroup.add(ray);
  }

  // 9. Interactive Mouse / Touch Drag Controls
  setupTouchControls();

  // Resize
  window.addEventListener("resize", onWindowResize);

  // Animate
  animate();
}

let isDragging = false;
let prevPos = { x: 0, y: 0 };

function setupTouchControls() {
  const dom = renderer.domElement;

  dom.addEventListener("mousedown", (e) => {
    isDragging = true;
    prevPos = { x: e.clientX, y: e.clientY };
  });

  dom.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - prevPos.x;
    const dy = e.clientY - prevPos.y;
    ultronGroup.rotation.y += dx * 0.007;
    ultronGroup.rotation.x += dy * 0.007;
    prevPos = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener("mouseup", () => { isDragging = false; });

  dom.addEventListener("wheel", (e) => {
    targetScale -= e.deltaY * 0.001;
    targetScale = Math.max(0.4, Math.min(2.5, targetScale));
  }, { passive: true });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function setUltronGestureTransform(rotY, rotX, scaleFactor) {
  if (rotY !== undefined) ultronGroup.rotation.y += rotY;
  if (rotX !== undefined) ultronGroup.rotation.x += rotX;
  if (scaleFactor !== undefined) targetScale = Math.max(0.4, Math.min(2.8, scaleFactor));
}

function setUltronAudioReactivity(val) {
  audioPulseIntensity = val;
}

function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  // Smooth Scaling & Audio Pulsing
  currentScale += (targetScale - currentScale) * 0.12;
  const pulse = 1.0 + (audioPulseIntensity * 0.22) + Math.sin(time * 2.5) * 0.02;
  ultronGroup.scale.set(currentScale * pulse, currentScale * pulse, currentScale * pulse);

  // Gentle Self Rotations
  if (mainParticleSphere) {
    mainParticleSphere.rotation.y += 0.002;
    mainParticleSphere.rotation.x += 0.0008;
  }
  if (denseCoreCloud) {
    denseCoreCloud.rotation.y -= 0.006;
    denseCoreCloud.rotation.z += 0.003;
  }

  // Orbital rings
  outerDataRings.forEach(r => {
    r.mesh.rotation.z += r.speed;
  });

  // Synaptic Lightning Flicker
  synapticRays.forEach((s, idx) => {
    s.material.opacity = (Math.sin(time * 15 + idx) * 0.3 + 0.6) * (0.3 + audioPulseIntensity * 0.7);
  });

  renderer.render(scene, camera);
}

window.addEventListener("DOMContentLoaded", initUltron3D);
