import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three';

// Models — 'fmt' defaults to 'glb'. Characters with new FBX models use 'fbx'.
const MODELS = {
  combatWorker:   { path: '3d ref model/player/Combat worker/combat worker.glb' },
  repairWorker:   { path: 'assets/characters/repair_worker/high_visibility_orange_worker.glb' },
  looter:         { path: 'assets/characters/looter/Looter.fbx', fmt: 'fbx' },
  // cableThief FBX is 48MB — too large for web. Falls back to primitive.
  // cableThief: { path: '...', fmt: 'fbx' },
  vandal:         { path: 'assets/characters/vandal/VANDAL.fbx', fmt: 'fbx' },
  solarPanel:     { path: '3d ref model/defenses/solar-panel/solar_panel.glb' },
  windTurbine:    { path: '3d ref model/defenses/wind-turbine/wind_turbine_demo.glb' },
  turret:         { path: '3d ref model/defenses/turret/turret.glb' },
  fence:          { path: '3d ref model/defenses/fence/fence_concrete-_15mb.glb' },
  powerStation:   { path: '3d ref model/environment/props/coal_power_station.glb' },
};

// Animation clips loaded from separate FBX files (Mixamo exports).
// Each clip's skeleton must match the parent model's rig.
const ANIMATIONS = {
  vandal: [
    { name: 'walk',   path: 'assets/characters/vandal/Walking.fbx' },
    { name: 'attack', path: 'assets/characters/vandal/heavy attack.fbx' },
    { name: 'death',  path: 'assets/characters/vandal/Falling Back Death.fbx' },
  ],
  looter: [
    { name: 'walk',   path: 'assets/animations/looter/Walking.fbx' },
    { name: 'attack', path: 'assets/animations/looter/Standing Melee Attack Downward.fbx' },
    { name: 'death',  path: 'assets/animations/looter/Falling Back Death.fbx' },
  ],
};

// Target in-game dimensions. Source models come at wildly different scales —
// every model is measured after load and normalized to fit this height,
// feet on the ground, centered on x/z.
const FIT = {
  combatWorker: { height: 2.7, rotateY: Math.PI },
  repairWorker: { height: 2.7, rotateY: Math.PI },
  looter:       { height: 2.4, rotateY: Math.PI },
  cableThief:   { height: 2.4, rotateY: Math.PI },
  vandal:       { height: 2.6, rotateY: Math.PI },
  solarPanel:   { height: 2.2 },
  windTurbine:  { height: 9.0 },
  turret:       { height: 2.6 },
  fence:        { height: 2.5 },
  powerStation: { height: 20 },
};

class ModelLoaderSingleton {
  constructor() {
    this.gltfLoader = new GLTFLoader();
    this.fbxLoader = new FBXLoader();
    this.cache = {};       // key -> { scene, animations[], norm }
  }

  async loadAll() {
    // --- Load models ---
    const entries = Object.entries(MODELS);
    const modelResults = await Promise.allSettled(
      entries.map(([key, cfg]) => this._loadModel(key, cfg))
    );
    modelResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.warn(`[ModelLoader] Failed to load ${entries[i][0]}: ${r.reason}`);
      }
    });

    // --- Load animation clips ---
    const animEntries = Object.entries(ANIMATIONS);
    const animResults = await Promise.allSettled(
      animEntries.map(([key, clips]) => this._loadAnimations(key, clips))
    );
    animResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.warn(`[ModelLoader] Failed to load anims for ${animEntries[i][0]}: ${r.reason}`);
      }
    });
  }

  async _loadModel(key, cfg) {
    const isFbx = cfg.fmt === 'fbx';
    if (isFbx) {
      const group = await this.fbxLoader.loadAsync(cfg.path);
      const scene = group;
      const animations = group.animations || [];
      this.cache[key] = {
        scene,
        animations,
        norm: this._computeNorm(key, scene),
      };
    } else {
      const gltf = await this.gltfLoader.loadAsync(cfg.path);
      this.cache[key] = {
        scene: gltf.scene,
        animations: gltf.animations || [],
        norm: this._computeNorm(key, gltf.scene),
      };
    }
  }

  async _loadAnimations(key, clips) {
    const entry = this.cache[key];
    if (!entry) return; // model didn't load, skip anims

    const results = await Promise.allSettled(
      clips.map(async (clip) => {
        const group = await this.fbxLoader.loadAsync(clip.path);
        if (group.animations && group.animations.length > 0) {
          const anim = group.animations[0];
          anim.name = clip.name; // rename to our hook name
          entry.animations.push(anim);
        }
      })
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.warn(`[ModelLoader] Failed to load clip ${clips[i].name} for ${key}: ${r.reason}`);
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
      offX: -(box.min.x + size.x / 2) * scale,
      offY: -box.min.y * scale,
      offZ: -(box.min.z + size.z / 2) * scale,
      rotY: fit.rotateY || 0,
    };
  }

  getClone(key) {
    const entry = this.cache[key];
    if (!entry) return null;
    const src = entry.scene;
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
    const inner = new THREE.Group();
    inner.add(clone);
    clone.scale.setScalar(n.scale);
    clone.position.set(n.offX, n.offY, n.offZ);
    inner.rotation.y = n.rotY;
    const wrapper = new THREE.Group();
    wrapper.add(inner);
    return wrapper;
  }

  getScene(key) {
    const entry = this.cache[key];
    return entry ? entry.scene : null;
  }

  getAnimations(key) {
    const entry = this.cache[key];
    return entry ? entry.animations : [];
  }

  // Get named animation clips as { name: AnimationClip } dict.
  // Only clips loaded from ANIMATIONS config have names set.
  getClips(key) {
    const entry = this.cache[key];
    if (!entry) return {};
    const clips = {};
    for (const anim of entry.animations) {
      if (anim.name) clips[anim.name] = anim;
    }
    return clips;
  }

  has(key) {
    return !!this.cache[key];
  }
}

export const Models = new ModelLoaderSingleton();
