import * as THREE from 'three';
import { Models } from './ModelLoader.js';

// Build the power station environment — daylight, GLB station model
export function createScene() {
  const scene = new THREE.Scene();

  // --- Daylight sky ---
  scene.background = new THREE.Color(0x87b8e8);
  scene.fog = new THREE.Fog(0x9cc3e8, 90, 220);

  // --- Lighting: bright day ---
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  // Sky/ground bounce light
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x9a8a6a, 0.9);
  scene.add(hemi);

  // The sun (directional light + visible disc in the sky)
  const sunDir = new THREE.Vector3(45, 65, 30);
  const sunlight = new THREE.DirectionalLight(0xfff2d0, 2.4);
  sunlight.position.copy(sunDir);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = -60;
  sunlight.shadow.camera.right = 60;
  sunlight.shadow.camera.top = 60;
  sunlight.shadow.camera.bottom = -60;
  scene.add(sunlight);

  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(6, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false })
  );
  sunDisc.position.copy(sunDir).multiplyScalar(2.2);
  scene.add(sunDisc);
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(11, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.35, fog: false,
    })
  );
  sunGlow.position.copy(sunDisc.position);
  scene.add(sunGlow);

  // --- Ground (dry veld around the plant) ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x8f8a62, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // --- Power Station: the real GLB model (no primitive template) ---
  const stationModel = Models.getClone('powerStation');
  if (stationModel) {
    stationModel.name = 'station';
    stationModel.position.set(0, 0, 0);
    scene.add(stationModel);
  } else {
    // Minimal fallback so the game still runs if the model fails to load
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(16, 8, 10),
      new THREE.MeshStandardMaterial({ color: 0x555566 })
    );
    fallback.position.y = 4;
    fallback.name = 'station';
    scene.add(fallback);
  }

  // --- Enemy spawn line (danger zone marker along the spawn edge) ---
  // EnemyManager spawns at z = -(50..55), x in ±20 — mark that front.
  const spawnGroup = new THREE.Group();
  spawnGroup.name = 'spawn-line';

  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 6),
    new THREE.MeshBasicMaterial({
      color: 0xff3322, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
    })
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, 0.06, -52.5);
  spawnGroup.add(stripe);

  const lineMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xff2211, side: THREE.DoubleSide })
  );
  lineMesh.rotation.x = -Math.PI / 2;
  lineMesh.position.set(0, 0.07, -50);
  lineMesh.name = 'spawn-line-core';
  spawnGroup.add(lineMesh);

  // Warning chevrons pointing toward the station
  const chevronMat = new THREE.MeshBasicMaterial({
    color: 0xff5533, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
  });
  for (let x = -24; x <= 24; x += 8) {
    const chevron = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), chevronMat);
    chevron.rotation.x = -Math.PI / 2;
    chevron.rotation.z = Math.PI / 4; // diamond
    chevron.position.set(x, 0.07, -51.5);
    spawnGroup.add(chevron);
  }
  scene.add(spawnGroup);

  // --- Distant informal settlement (daylight tones) ---
  const silhouetteMat = new THREE.MeshStandardMaterial({ color: 0x7a7468, roughness: 1 });
  for (let i = 0; i < 30; i++) {
    const w = 2 + Math.random() * 4;
    const h = 1.5 + Math.random() * 3;
    const d = 2 + Math.random() * 3;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, silhouetteMat);
    const angle = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 35;
    mesh.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
    mesh.rotation.y = Math.random() * Math.PI;
    scene.add(mesh);
  }

  return scene;
}

// Station health — enemies attack the station
export const STATION = {
  maxHealth: 500,
  health: 500,
  position: new THREE.Vector3(0, 0, 0),
  radius: 12,  // enemies target this radius
};

export function resetStation() {
  STATION.health = STATION.maxHealth;
}
