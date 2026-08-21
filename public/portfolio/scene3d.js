/**
 * ============================================================================
 *  ADITYA DEVMURARI — THREE.JS 3D WEBGL ENGINE (SCENE3D.JS)
 *  - Morphing Quantum Icosahedron Core & 2,500 Starfield Particle Galaxy
 *  - Interactive Parallax Mouse & Scroll Dynamics
 * ============================================================================
 */
"use strict";

let scene, camera, renderer;
let quantumCore, innerSphere, orbitalRing1, orbitalRing2, starfield;
let mouseX = 0, mouseY = 0;
let targetX = 0, targetY = 0;
let windowHalfX = window.innerWidth / 2;
let windowHalfY = window.innerHeight / 2;
let scrollProgress = 0;

function init3DScene() {
  const container = document.getElementById("webgl-container");
  if (!container) return;

  // 1. Scene setup
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050811, 0.0018);

  // 2. Camera setup
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3000);
  camera.position.z = 1000;

  // 3. Renderer setup
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // 4. Ambient & Point Lighting
  const ambientLight = new THREE.AmbientLight(0x0a192f, 1.5);
  scene.add(ambientLight);

  const cyanPointLight = new THREE.PointLight(0x00f3ff, 3, 1200);
  cyanPointLight.position.set(300, 200, 500);
  scene.add(cyanPointLight);

  const purplePointLight = new THREE.PointLight(0x9d4edd, 2.5, 1200);
  purplePointLight.position.set(-300, -200, 400);
  scene.add(purplePointLight);

  // 5. Build Quantum Morphing Core (Wireframe Icosahedron)
  const coreGeometry = new THREE.IcosahedronGeometry(180, 2);
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0x00f3ff,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
    roughness: 0.1,
    metalness: 0.9
  });
  quantumCore = new THREE.Mesh(coreGeometry, coreMaterial);
  scene.add(quantumCore);

  // 6. Inner Glowing Energy Sphere
  const innerGeometry = new THREE.SphereGeometry(90, 32, 32);
  const innerMaterial = new THREE.MeshBasicMaterial({
    color: 0x7928ca,
    wireframe: true,
    transparent: true,
    opacity: 0.6
  });
  innerSphere = new THREE.Mesh(innerGeometry, innerMaterial);
  scene.add(innerSphere);

  // 7. Dual Gyroscopic Orbital Rings
  const ringGeo1 = new THREE.TorusGeometry(260, 2, 16, 100);
  const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.4 });
  orbitalRing1 = new THREE.Mesh(ringGeo1, ringMat1);
  scene.add(orbitalRing1);

  const ringGeo2 = new THREE.TorusGeometry(320, 1.5, 16, 100);
  const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xb5179e, transparent: true, opacity: 0.3 });
  orbitalRing2 = new THREE.Mesh(ringGeo2, ringMat2);
  orbitalRing2.rotation.x = Math.PI / 3;
  scene.add(orbitalRing2);

  // 8. 2,500 Starfield Particle Constellation
  const particleCount = 2500;
  const particleGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  const cyanColor = new THREE.Color(0x00f3ff);
  const purpleColor = new THREE.Color(0x9d4edd);
  const whiteColor = new THREE.Color(0xffffff);

  for (let i = 0; i < particleCount * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 2400;
    positions[i + 1] = (Math.random() - 0.5) * 2400;
    positions[i + 2] = (Math.random() - 0.5) * 2400;

    const mixed = Math.random();
    let c = whiteColor;
    if (mixed < 0.45) c = cyanColor;
    else if (mixed < 0.85) c = purpleColor;

    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }

  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const particleMaterial = new THREE.PointsMaterial({
    size: 3,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending
  });

  starfield = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(starfield);

  // Event Listeners
  window.addEventListener('resize', onWindowResize, false);
  document.addEventListener('mousemove', onDocumentMouseMove, false);
  window.addEventListener('scroll', onScrollDynamics, false);

  animate();
}

function onWindowResize() {
  windowHalfX = window.innerWidth / 2;
  windowHalfY = window.innerHeight / 2;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onDocumentMouseMove(event) {
  mouseX = (event.clientX - windowHalfX) * 0.4;
  mouseY = (event.clientY - windowHalfY) * 0.4;
}

function onScrollDynamics() {
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  scrollProgress = window.scrollY / (docHeight || 1);
}

function animate() {
  requestAnimationFrame(animate);

  targetX += (mouseX - targetX) * 0.05;
  targetY += (mouseY - targetY) * 0.05;

  // Quantum Core Continuous Morphing & Rotation
  const time = Date.now() * 0.001;

  if (quantumCore) {
    quantumCore.rotation.x = time * 0.2 + targetY * 0.001;
    quantumCore.rotation.y = time * 0.3 + targetX * 0.001;

    // Shift core position according to scroll story chapters
    const targetZ = 1000 - scrollProgress * 400;
    const targetPosX = Math.sin(scrollProgress * Math.PI * 2) * 200;
    const targetPosY = -scrollProgress * 250;

    quantumCore.position.x += (targetPosX - quantumCore.position.x) * 0.05;
    quantumCore.position.y += (targetPosY - quantumCore.position.y) * 0.05;

    if (innerSphere) {
      innerSphere.position.copy(quantumCore.position);
      innerSphere.rotation.x = -time * 0.4;
      innerSphere.rotation.y = -time * 0.5;
    }

    if (orbitalRing1) {
      orbitalRing1.position.copy(quantumCore.position);
      orbitalRing1.rotation.x = time * 0.4;
      orbitalRing1.rotation.y = time * 0.2;
    }

    if (orbitalRing2) {
      orbitalRing2.position.copy(quantumCore.position);
      orbitalRing2.rotation.y = -time * 0.3;
      orbitalRing2.rotation.z = time * 0.25;
    }
  }

  // Starfield subtle cosmic drift
  if (starfield) {
    starfield.rotation.y = time * 0.02;
    starfield.rotation.x = scrollProgress * 0.5;
  }

  // Camera Parallax
  camera.position.x += (targetX * 0.6 - camera.position.x) * 0.05;
  camera.position.y += (-targetY * 0.6 - camera.position.y) * 0.05;
  camera.lookAt(scene.position);

  renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', init3DScene);
