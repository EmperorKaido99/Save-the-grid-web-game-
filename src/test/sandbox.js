// Standalone controller sandbox — bare test scene for the third-person
// camera + movement module. Zero dependency on turrets/enemies/waves.
// Run: serve the repo root and open /controller-test.html

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { InputState, KeyboardMouseReader } from '../core/InputState.js';
import { PlayerState } from '../core/PlayerState.js';
import { MovementSystem } from '../systems/MovementSystem.js';
import { CameraController } from '../render/CameraController.js';

await RAPIER.init();

// --- Renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101624);
scene.fog = new THREE.Fog(0x101624, 60, 120);

const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(20, 30, 10);
sun.castShadow = true;
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x8899bb, 0.8));

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Physics world + level geometry (mesh & collider built together) ---
const world = new RAPIER.World({ x: 0, y: -24, z: 0 });

function addBox(w, h, d, x, y, z, color = 0x2a3550, rotX = 0, rotY = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotX, rotY, 0);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);

  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
      .setTranslation(x, y, z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
  );
  return mesh;
}

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: 0x1a2438 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
scene.add(new THREE.GridHelper(120, 60, 0x2c3c5c, 0x22304a));
world.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.1, 60).setTranslation(0, -0.1, 0));

// Obstacles: walls for camera collision, pillars, a low block
addBox(10, 4, 0.6, 0, 3 - 1, -6, 0x31405f);          // wall behind spawn area
addBox(0.6, 5, 8, 6, 2.5, -12, 0x31405f);            // side wall
addBox(2, 2, 2, -5, 1, -10, 0x3a4a6a);               // low block
addBox(1, 6, 1, -8, 3, 2, 0x3a4a6a);                 // tall pillar
addBox(1, 6, 1, 10, 3, 6, 0x3a4a6a);                 // tall pillar

// Walkable ramp (~20°) and too-steep ramp (~60°)
const walkRamp = 20 * Math.PI / 180;
addBox(6, 0.4, 10, -14, Math.sin(walkRamp) * 5, -18, 0x2f5f46, walkRamp);
const steepRamp = 60 * Math.PI / 180;
addBox(6, 0.4, 10, 14, Math.sin(steepRamp) * 5, -18, 0x5f2f2f, steepRamp);

// Stairs (0.3 rise per step — autostep test, threshold 0.35)
for (let i = 0; i < 4; i++) {
  addBox(4, 0.3, 1.2, 0, 0.15 + i * 0.3, 12 + i * 1.2, 0x3f5070);
}

// --- Placeholder characters (capsule + nose marker showing facing) ---
function buildCapsuleWorker(color) {
  const g = new THREE.Group();
  const capsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 1.0, 6, 12),
    new THREE.MeshStandardMaterial({ color })
  );
  capsule.position.y = 0.9;
  capsule.castShadow = true;
  g.add(capsule);
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.15, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  nose.position.set(0, 1.4, -0.45); // model forward = -Z
  g.add(nose);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.9 })
  );
  flash.position.set(0.3, 1.3, -0.6);
  flash.visible = false;
  flash.name = 'flash';
  g.add(flash);
  return g;
}
const combatMesh = buildCapsuleWorker(0x2266aa);
const repairMesh = buildCapsuleWorker(0xdd6622);
repairMesh.visible = false;
scene.add(combatMesh, repairMesh);

// --- Core state + systems ---
const player = new PlayerState('COMBAT');
const input = new InputState();
const reader = new KeyboardMouseReader(input, renderer.domElement);
reader.enabled = true;

const movement = new MovementSystem(RAPIER, world, player, { spawn: { x: 0, y: 0, z: 4 } });

const camRig = new CameraController(camera, {
  castRay: (origin, dir, maxDist) => movement.castRay(origin, dir, maxDist),
});
camRig.snapBehind(player.position, 0);

// --- Effects wired through the decoupled hooks (no camera internals leaked) ---
const hudEvents = [];
function logEvent(text) {
  hudEvents.push(text);
  if (hudEvents.length > 6) hudEvents.shift();
}
player.on('fire', (charId) => {
  camRig.shake(charId === 'COMBAT' ? 0.6 : 0.25, 0.2);
  const mesh = charId === 'COMBAT' ? combatMesh : repairMesh;
  const flash = mesh.getObjectByName('flash');
  if (flash) { flash.visible = true; setTimeout(() => { flash.visible = false; }, 80); }
  logEvent(`fire (${charId})`);
});
player.on('landed', (fallSpeed) => {
  if (fallSpeed > 4) camRig.shake(Math.min(1, fallSpeed / 18), 0.18);
  logEvent(`landed (fall ${fallSpeed.toFixed(1)})`);
});
player.on('locomotion', (from, to) => logEvent(`locomotion ${from} → ${to}`));
player.on('air', (from, to) => logEvent(`air ${from} → ${to}`));
player.on('aim-enter', () => logEvent('aim-enter'));
player.on('aim-exit', () => logEvent('aim-exit'));
player.on('character', (from, to) => logEvent(`character ${from} → ${to}`));

// --- HUD ---
const hud = document.getElementById('hud');
const crosshair = document.getElementById('crosshair');
const lockHint = document.getElementById('lock-hint');

// --- Main loop ---
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  reader.update(dt);

  // Character switch (Tab / Q)
  if (input.switchPressed) {
    const next = player.characterId === 'COMBAT' ? 'REPAIR' : 'COMBAT';
    player.setCharacter(next);
    combatMesh.visible = next === 'COMBAT';
    repairMesh.visible = next === 'REPAIR';
  }
  // Reset (R)
  if (reader._keys['KeyR']) movement.setPosition(0, 0, 4);

  // Look first so movement uses this frame's camera direction
  camRig.addLook(input.lookDelta.x, input.lookDelta.y, player.aiming);
  if (input.zoomDelta) camRig.addZoom(input.zoomDelta);

  movement.update(input, dt, camRig.forwardYaw);
  world.step();

  // Camera follows after the player has moved (lookDelta already consumed)
  camRig.update(dt, {
    position: player.position,
    aiming: player.aiming,
    sprinting: player.sprinting && player.speed > 1,
  });

  // Sync active mesh to core state
  const mesh = player.characterId === 'COMBAT' ? combatMesh : repairMesh;
  mesh.position.set(player.position.x, player.position.y, player.position.z);
  mesh.rotation.y = player.yaw;

  // HUD
  crosshair.classList.toggle('aiming', player.aiming);
  lockHint.style.display = (!reader.isLocked && !reader.lockFailed) ? 'block' : 'none';
  hud.innerHTML =
    `<b>${player.config.name}</b><br>` +
    `locomotion: <b>${player.locomotion}</b>  air: <b>${player.airState}</b><br>` +
    `speed: ${player.speed.toFixed(1)} u/s  aiming: ${player.aiming}<br>` +
    `pos: ${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)}` +
    `<div id="events">${hudEvents.join('<br>')}</div>`;

  renderer.render(scene, camera);
  input.endFrame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Debug handle for automated tests
window.__sandbox = { player, input, reader, movement, camRig, world, RAPIER, scene, camera };
