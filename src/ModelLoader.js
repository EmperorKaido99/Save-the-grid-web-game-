import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three';

const MODELS = {
  combatWorker:   '3d ref model/player/Combat worker/combat worker.glb',
  repairWorker:   '3d ref model/player/Combat worker/Repair worker/009_male_worker_welder_02.glb',
  looter:         '3d ref model/enemies/looter/robber.glb',
  cableThief:     '3d ref model/enemies/cable-thief/male_01_bloody.glb',
  solarPanel:     '3d ref model/defenses/solar-panel/solar_panel.glb',
  windTurbine:    '3d ref model/defenses/wind-turbine/wind_turbine_demo.glb',
  turret:         '3d ref model/defenses/turret/turret.glb',
  fence:          '3d ref model/defenses/fence/fence_concrete-_15mb.glb',
  powerStation:   '3d ref model/environment/props/coal_power_station.glb',
};

// Target in-game dimensions. Source GLBs come from different artists at
// wildly different scales (the power station is 3400 units wide, the turret
// 2 units) — so every model is measured after load and normalized to the
// height given here, feet on the ground, centered on x/z. No guess-scales.
const FIT = {
  combatWorker: { height: 2.7, rotateY: Math.PI },  // game forward is -Z
  repairWorker: { height: 2.7, rotateY: Math.PI },
  looter:       { height: 2.4, rotateY: Math.PI },
  cableThief:   { height: 2.4, rotateY: Math.PI },
  solarPanel:   { height: 2.2 },
  windTurbine:  { height: 9.0 },
  turret:       { height: 2.6 },
  fence:        { height: 2.5 },
  powerStation: { height: 20 },
};

class ModelLoaderSingleton {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = {};       // key -> { gltf, norm: {scale, offX, offY, offZ, rotY} }
  }

  async loadAll() {
    const entries = Object.entries(MODELS);
    const results = await Promise.allSettled(
      entries.map(([key, path]) =>
        this.loader.loadAsync(path).then(gltf => {
          this.cache[key] = { gltf, norm: this._computeNorm(key, gltf.scene) };
        })
      )
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.warn(`[ModelLoader] Failed to load ${entries[i][0]}: ${r.reason}`);
      }
    });
  }

  _computeNorm(key, scene) {
    const fit = FIT[key] || { height: 2 };
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = size.y > 0 ? fit.height / size.y : 1;
    return {
      scale,
      // after scaling: center x/z on origin, rest the model on y=0
      offX: -(box.min.x + size.x / 2) * scale,
      offY: -box.min.y * scale,
      offZ: -(box.min.z + size.z / 2) * scale,
      rotY: fit.rotateY || 0,
    };
  }

  // Get a normalized clone: a wrapper group whose origin is at the model's
  // feet, height = FIT height, characters rotated to face the game's -Z
  // forward. Safe for skinned meshes (SkeletonUtils keeps bone bindings
  // intact on clones, plain .clone() does not).
  getClone(key) {
    const entry = this.cache[key];
    if (!entry) return null;
    const src = entry.gltf.scene;
    let hasSkinned = false;
    src.traverse(c => { if (c.isSkinnedMesh) hasSkinned = true; });
    const clone = hasSkinned ? SkeletonUtils.clone(src) : src.clone(true);
    clone.traverse(child => {
      if (child.isMesh) {
        if (child.material && !hasSkinned) child.material = child.material.clone();
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    const n = entry.norm;
    // inner carries the normalization; wrapper rotates characters to -Z
    const inner = new THREE.Group();
    inner.add(clone);
    clone.scale.setScalar(n.scale);
    clone.position.set(n.offX, n.offY, n.offZ);
    inner.rotation.y = n.rotY;
    const wrapper = new THREE.Group();
    wrapper.add(inner);
    return wrapper;
  }

  // Get the raw scene (for single-use or reference)
  getScene(key) {
    const entry = this.cache[key];
    return entry ? entry.gltf.scene : null;
  }

  // Get animations from a loaded model
  getAnimations(key) {
    const entry = this.cache[key];
    return entry ? entry.gltf.animations : [];
  }

  has(key) {
    return !!this.cache[key];
  }
}

export const Models = new ModelLoaderSingleton();
