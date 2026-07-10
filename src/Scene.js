import * as THREE from 'three';

// Build the power station environment — all primitive geometry
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 60, 120);

  // Lighting
  const ambient = new THREE.AmbientLight(0x334466, 0.6);
  scene.add(ambient);

  const moonlight = new THREE.DirectionalLight(0x8899bb, 0.8);
  moonlight.position.set(30, 50, 20);
  moonlight.castShadow = true;
  moonlight.shadow.mapSize.set(2048, 2048);
  moonlight.shadow.camera.left = -60;
  moonlight.shadow.camera.right = 60;
  moonlight.shadow.camera.top = 60;
  moonlight.shadow.camera.bottom = -60;
  scene.add(moonlight);

  // Orange security lights
  const secLight1 = new THREE.PointLight(0xff8833, 1.0, 30);
  secLight1.position.set(8, 8, 0);
  scene.add(secLight1);
  const secLight2 = new THREE.PointLight(0xff8833, 1.0, 30);
  secLight2.position.set(-8, 8, 0);
  scene.add(secLight2);

  // Ground
  const groundGeo = new THREE.PlaneGeometry(200, 200);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x3d3522,
    roughness: 0.95,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // --- Power Station ---
  const stationGroup = new THREE.Group();
  stationGroup.name = 'station';

  // Main building
  const buildingGeo = new THREE.BoxGeometry(16, 8, 10);
  const buildingMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.8 });
  const building = new THREE.Mesh(buildingGeo, buildingMat);
  building.position.set(0, 4, 0);
  building.castShadow = true;
  building.receiveShadow = true;
  stationGroup.add(building);

  // Roof accent
  const roofGeo = new THREE.BoxGeometry(17, 0.5, 11);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x444455 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, 8.25, 0);
  stationGroup.add(roof);

  // Cooling tower 1 (cylinder)
  const towerGeo = new THREE.CylinderGeometry(2, 3, 12, 12);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x666677, roughness: 0.7 });
  const tower1 = new THREE.Mesh(towerGeo, towerMat);
  tower1.position.set(-5, 6, -3);
  tower1.castShadow = true;
  stationGroup.add(tower1);

  // Cooling tower 2
  const tower2 = tower1.clone();
  tower2.position.set(5, 6, -3);
  stationGroup.add(tower2);

  // Smokestacks
  const stackGeo = new THREE.CylinderGeometry(0.4, 0.5, 10, 8);
  const stackMat = new THREE.MeshStandardMaterial({ color: 0x888899 });
  for (const xOff of [-3, 0, 3]) {
    const stack = new THREE.Mesh(stackGeo, stackMat);
    stack.position.set(xOff, 13, -3);
    stack.castShadow = true;
    stationGroup.add(stack);
  }

  // Security lights on poles
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x999999 });
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 10, 6);
  const lightBulbGeo = new THREE.SphereGeometry(0.4, 8, 8);
  const lightBulbMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
  for (const [px, pz] of [[10, 7], [-10, 7], [10, -7], [-10, -7]]) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(px, 5, pz);
    stationGroup.add(pole);
    const bulb = new THREE.Mesh(lightBulbGeo, lightBulbMat);
    bulb.position.set(px, 10.2, pz);
    stationGroup.add(bulb);
  }

  scene.add(stationGroup);

  // --- Chain-link fence (around station perimeter) ---
  const fenceMat = new THREE.MeshStandardMaterial({
    color: 0x888888,
    wireframe: true,
    transparent: true,
    opacity: 0.4,
  });
  const fencePostMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
  const fencePostGeo = new THREE.CylinderGeometry(0.1, 0.1, 3, 6);

  // Fence segments around a perimeter
  const fencePerimeter = 20;
  const fenceHeight = 2.5;
  // North/South fences
  for (const z of [-fencePerimeter, fencePerimeter]) {
    const fenceGeo = new THREE.PlaneGeometry(fencePerimeter * 2, fenceHeight, 20, 10);
    const fence = new THREE.Mesh(fenceGeo, fenceMat);
    fence.position.set(0, fenceHeight / 2, z);
    if (z > 0) fence.rotation.y = Math.PI;
    scene.add(fence);
  }
  // East/West fences
  for (const x of [-fencePerimeter, fencePerimeter]) {
    const fenceGeo = new THREE.PlaneGeometry(fencePerimeter * 2, fenceHeight, 20, 10);
    const fence = new THREE.Mesh(fenceGeo, fenceMat);
    fence.position.set(x, fenceHeight / 2, 0);
    fence.rotation.y = Math.PI / 2;
    scene.add(fence);
  }
  // Fence posts
  for (let i = -fencePerimeter; i <= fencePerimeter; i += 5) {
    for (const edge of [-fencePerimeter, fencePerimeter]) {
      const postNS = new THREE.Mesh(fencePostGeo, fencePostMat);
      postNS.position.set(i, 1.5, edge);
      scene.add(postNS);
      const postEW = new THREE.Mesh(fencePostGeo, fencePostMat);
      postEW.position.set(edge, 1.5, i);
      scene.add(postEW);
    }
  }

  // --- Distant informal settlement silhouettes ---
  const silhouetteMat = new THREE.MeshBasicMaterial({ color: 0x111118 });
  for (let i = 0; i < 30; i++) {
    const w = 2 + Math.random() * 4;
    const h = 1.5 + Math.random() * 3;
    const d = 2 + Math.random() * 3;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, silhouetteMat);
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 30;
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
