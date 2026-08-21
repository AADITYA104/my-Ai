/**
 * ============================================================================
 *  ADITYA DEVMURARI — 3D THREE.JS CINEMATIC DIRECTOR (SCENE3D.JS)
 *  - Morphing Geometric Polyhedra, 3,500 Reactive Nebula Particles
 *  - Dynamic Camera Flight Splines & Act-Aware 3D Storytelling Transitions
 * ============================================================================
 */
"use strict";

let scene, camera, renderer;
let centralPolyhedron, coreGlowSphere, gyroscopicRingA, gyroscopicRingB;
let stardustParticles, laserConnectionsGroup;
let mouseX = 0, mouseY = 0;
let targetMouseX = 0, targetMouseY = 0;
let windowHalfX = window.innerWidth / 2;
let windowHalfY = window.innerHeight / 2;
let scrollNorm = 0;

function initCinematic3D() {
  const canvas = document.getElementById("webgl-canvas");
  if (!canvas) return;

  // 1. Scene & Atmosphere Fog
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03060d, 0.0012);

  // 2. Camera Setup
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 4000);
  camera.position.set(0, 0, 1100);

  // 3. WebGL Renderer with High Precision & Anti-aliasing
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // 4. Dynamic Lighting System
  const ambientLight = new THREE.AmbientLight(0x0e172e, 2.0);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0x00f3ff, 2.5);
  keyLight.position.set(400, 300, 500);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x9d4edd, 2.0);
  fillLight.position.set(-400, -300, 400);
  scene.add(fillLight);

  const centralPointGlow = new THREE.PointLight(0x00f3ff, 4, 800);
  centralPointGlow.position.set(0, 0, 0);
  scene.add(centralPointGlow);

  // 5. Central Polyhedral Core (The Singularity)
  const polyGeo = new THREE.IcosahedronGeometry(160, 2);
  const polyMat = new THREE.MeshStandardMaterial({
    color: 0x00f3ff,
    wireframe: true,
    transparent: true,
    opacity: 0.45,
    roughness: 0.15,
    metalness: 0.95
  });
  centralPolyhedron = new THREE.Mesh(polyGeo, polyMat);
  scene.add(centralPolyhedron);

  // 6. Radiant Inner Plasma Core
  const coreGeo = new THREE.DodecahedronGeometry(85, 1);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x7928ca,
    wireframe: true,
    transparent: true,
    opacity: 0.7
  });
  coreGlowSphere = new THREE.Mesh(coreGeo, coreMat);
  scene.add(coreGlowSphere);

  // 7. Dual Gyroscopic Orbital Rings
  const ringGeoA = new THREE.TorusGeometry(260, 1.8, 16, 120);
  const ringMatA = new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.35 });
  gyroscopicRingA = new THREE.Mesh(ringGeoA, ringMatA);
  scene.add(gyroscopicRingA);

  const ringGeoB = new THREE.TorusGeometry(320, 1.4, 16, 120);
  const ringMatB = new THREE.MeshBasicMaterial({ color: 0x9d4edd, transparent: true, opacity: 0.3 });
  gyroscopicRingB = new THREE.Mesh(ringGeoB, ringMatB);
  gyroscopicRingB.rotation.x = Math.PI / 2.5;
  scene.add(gyroscopicRingB);

  // 8. 3,500 Reactive Nebula & Stardust Particles
  const particleCount = 3500;
  const partGeo = new THREE.BufferGeometry();
  const coords = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  const cyan = new THREE.Color(0x00f3ff);
  const violet = new THREE.Color(0x9d4edd);
  const gold = new THREE.Color(0xf59e0b);
  const white = new THREE.Color(0xffffff);

  for (let i = 0; i < particleCount * 3; i += 3) {
    coords[i] = (Math.random() - 0.5) * 3000;
    coords[i + 1] = (Math.random() - 0.5) * 3000;
    coords[i + 2] = (Math.random() - 0.5) * 3000;

    const r = Math.random();
    let col = white;
    if (r < 0.45) col = cyan;
    else if (r < 0.8) col = violet;
    else if (r < 0.95) col = gold;

    colors[i] = col.r;
    colors[i + 1] = col.g;
    colors[i + 2] = col.b;
  }

  partGeo.setAttribute('position', new THREE.BufferAttribute(coords, 3));
  partGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const partMat = new THREE.PointsMaterial({
    size: 2.8,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending
  });

  stardustParticles = new THREE.Points(partGeo, partMat);
  scene.add(stardustParticles);

  // 9. Laser Connections Group for Skills Constellation
  laserConnectionsGroup = new THREE.Group();
  scene.add(laserConnectionsGroup);

  // Event Listeners
  window.addEventListener('resize', onWindowResize, false);
  document.addEventListener('mousemove', onMouseMove, false);
  window.addEventListener('scroll', onScroll, { passive: true });

  renderFrame();
}

function onWindowResize() {
  windowHalfX = window.innerWidth / 2;
  windowHalfY = window.innerHeight / 2;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(event) {
  mouseX = (event.clientX - windowHalfX) * 0.35;
  mouseY = (event.clientY - windowHalfY) * 0.35;
}

function onScroll() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  scrollNorm = window.scrollY / (maxScroll || 1);
}

function renderFrame() {
  requestAnimationFrame(renderFrame);

  targetMouseX += (mouseX - targetMouseX) * 0.05;
  targetMouseY += (mouseY - targetMouseY) * 0.05;

  const time = Date.now() * 0.001;

  // 1. Camera Spline Movement across Story Acts
  // Camera dives and orbits through the 3D space based on scroll
  const cameraZ = 1100 - scrollNorm * 500;
  const cameraX = Math.sin(scrollNorm * Math.PI * 3) * 220 + targetMouseX * 0.6;
  const cameraY = -scrollNorm * 300 - targetMouseY * 0.6;

  camera.position.x += (cameraX - camera.position.x) * 0.05;
  camera.position.y += (cameraY - camera.position.y) * 0.05;
  camera.position.z += (cameraZ - camera.position.z) * 0.05;
  camera.lookAt(0, -scrollNorm * 150, 0);

  // 2. Central Polyhedral Core Transformations
  if (centralPolyhedron) {
    centralPolyhedron.rotation.x = time * 0.25 + targetMouseY * 0.0008;
    centralPolyhedron.rotation.y = time * 0.35 + targetMouseX * 0.0008;
    centralPolyhedron.rotation.z = time * 0.1;

    // Shift position across scroll acts
    const posX = Math.cos(scrollNorm * Math.PI * 2) * 160;
    const posY = -scrollNorm * 220;
    centralPolyhedron.position.set(posX, posY, 0);

    if (coreGlowSphere) {
      coreGlowSphere.position.copy(centralPolyhedron.position);
      coreGlowSphere.rotation.x = -time * 0.45;
      coreGlowSphere.rotation.y = -time * 0.55;
    }

    if (gyroscopicRingA) {
      gyroscopicRingA.position.copy(centralPolyhedron.position);
      gyroscopicRingA.rotation.x = time * 0.4;
      gyroscopicRingA.rotation.y = time * 0.25;
    }

    if (gyroscopicRingB) {
      gyroscopicRingB.position.copy(centralPolyhedron.position);
      gyroscopicRingB.rotation.y = -time * 0.35;
      gyroscopicRingB.rotation.z = time * 0.3;
    }
  }

  // 3. Stardust Particle Drift & Warp Velocity on Scroll
  if (stardustParticles) {
    stardustParticles.rotation.y = time * 0.015;
    stardustParticles.rotation.x = scrollNorm * 0.8;
  }

  renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', initCinematic3D);
