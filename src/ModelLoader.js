import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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

class ModelLoaderSingleton {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = {};       // loaded GLTF scenes
    this.mixers = [];      // AnimationMixers for characters with animations
  }

  async loadAll() {
    const entries = Object.entries(MODELS);
    const results = await Promise.allSettled(
      entries.map(([key, path]) =>
        this.loader.loadAsync(path).then(gltf => {
          this.cache[key] = gltf;
        })
      )
    );
    // Report failures but don't block
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.warn(`[ModelLoader] Failed to load ${entries[i][0]}: ${r.reason}`);
      }
    });
  }

  // Get a clone of a loaded model's scene (for instancing)
  getClone(key) {
    const gltf = this.cache[key];
    if (!gltf) return null;
    const clone = gltf.scene.clone(true);
    // Deep-clone materials so instances don't share state
    clone.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }

  // Get the raw scene (for single-use or reference)
  getScene(key) {
    const gltf = this.cache[key];
    return gltf ? gltf.scene : null;
  }

  // Get animations from a loaded model
  getAnimations(key) {
    const gltf = this.cache[key];
    return gltf ? gltf.animations : [];
  }

  has(key) {
    return !!this.cache[key];
  }
}

export const Models = new ModelLoaderSingleton();
