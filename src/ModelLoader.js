import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three';

// Models — all characters now use converted GLBs from the Mixamo pipeline.
const MODELS = {
  combatWorker:   { path: 'assets/models/characters/combat_worker/base.glb' },
  repairWorker:   { path: 'assets/models/characters/repair_worker/base.glb' },
  looter:         { path: 'assets/models/characters/looter/base.glb' },
  cableThief:     { path: 'assets/models/characters/cable_thief/base.glb' },
  vandal:         { path: 'assets/models/characters/vandal/base.glb' },
  solarPanel:     { path: '3d ref model/defenses/solar-panel/solar_panel.glb' },
  windTurbine:    { path: '3d ref model/defenses/wind-turbine/wind_turbine_demo.glb' },
  turret:         { path: '3d ref model/defenses/turret/turret.glb' },
  fence:          { path: '3d ref model/defenses/fence/fence_concrete-_15mb.glb' },
  powerStation:   { path: '3d ref model/environment/props/coal_power_station.glb' },
};

// Animation clips loaded from converted GLBs (Mixamo pipeline output).
// Each clip's skeleton must match the parent model's rig.
const CLIP_DIR = 'assets/models/characters';
const ANIMATIONS = {
  combatWorker: [
    { name: 'idle',     path: `${CLIP_DIR}/combat_worker/idle.glb` },
    { name: 'run',      path: `${CLIP_DIR}/combat_worker/run.glb` },
    { name: 'aim_idle', path: `${CLIP_DIR}/combat_worker/aim_idle.glb` },
    { name: 'aim_walk', path: `${CLIP_DIR}/combat_worker/aim_walk.glb` },
    { name: 'fire',     path: `${CLIP_DIR}/combat_worker/fire.glb` },
  ],
  looter: [
    { name: 'walk',        path: `${CLIP_DIR}/looter/walk.glb` },
    { name: 'break_fence', path: `${CLIP_DIR}/looter/break_fence.glb` },
    { name: 'attack',      path: `${CLIP_DIR}/looter/break_fence.glb` },
    { name: 'death',       path: `${CLIP_DIR}/looter/death.glb` },
  ],
  repairWorker: [
    { name: 'idle',        path: `${CLIP_DIR}/repair_worker/idle.glb` },
    { name: 'walk',        path: `${CLIP_DIR}/repair_worker/walk.glb` },
    { name: 'run',         path: `${CLIP_DIR}/repair_worker/run.glb` },
    { name: 'repair_loop', path: `${CLIP_DIR}/repair_worker/repair_loop.glb` },
    { name: 'stand_up',    path: `${CLIP_DIR}/repair_worker/stand_up.glb` },
  ],
  cableThief: [
    { name: 'run',   path: `${CLIP_DIR}/cable_thief/run.glb` },
    { name: 'climb', path: `${CLIP_DIR}/cable_thief/climb.glb` },
    { name: 'steal', path: `${CLIP_DIR}/cable_thief/steal.glb` },
    { name: 'death', path: `${CLIP_DIR}/cable_thief/death.glb` },
  ],
  vandal: [
    { name: 'walk',         path: `${CLIP_DIR}/vandal/walk.glb` },
    { name: 'heavy_attack', path: `${CLIP_DIR}/vandal/heavy_attack.glb` },
    { name: 'attack',       path: `${CLIP_DIR}/vandal/heavy_attack.glb` },
    { name: 'death',        path: `${CLIP_DIR}/vandal/death.glb` },
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
  // Turret GLB's barrel points +Z; flip so it faces the enemy spawn side
  // (-Z) by default. DefenseManager also aims it at targets when firing.
  turret:       { height: 2.6, rotateY: Math.PI },
  fence:        { height: 2.5 },
  powerStation: { height: 20 },
};

class ModelLoaderSingleton {
  constructor() {
    this.gltfLoader = new GLTFLoader();
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
    const gltf = await this.gltfLoader.loadAsync(cfg.path);
    this.cache[key] = {
      scene: gltf.scene,
      // Embedded clips (e.g. the combat worker's single baked clip) feed
      // the CharacterAnimator catch-all fallback; named clips from
      // ANIMATIONS are appended by _loadAnimations.
      animations: gltf.animations || [],
      norm: this._computeNorm(key, gltf.scene),
    };
  }

  async _loadAnimations(key, clips) {
    const entry = this.cache[key];
    if (!entry) return; // model didn't load, skip anims

    // Bone names present in the model — used to drop tracks that target
    // helper nodes the model doesn't have (avoids PropertyBinding spam)
    const nodeNames = new Set();
    entry.scene.traverse(o => { if (o.name) nodeNames.add(o.name); });

    const results = await Promise.allSettled(
      clips.map(async (clip) => {
        const gltf = await this.gltfLoader.loadAsync(clip.path);
        if (gltf.animations && gltf.animations.length > 0) {
          const anim = gltf.animations[0];
          anim.name = clip.name; // rename to our hook name
          anim.tracks = anim.tracks.filter(t =>
            nodeNames.has(t.name.split('.')[0]));
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
    scene.updateMatrixWorld(true);

    // Skinned meshes render wherever their BONES are — glTF ignores the
    // mesh node's own transform for skinned geometry, so Box3.setFromObject
    // (bind-pose geometry x node transforms) can be off by 100x on Mixamo /
    // character-creator exports. Measure the skeleton instead.
    let box = null;
    let hasSkinned = false;
    scene.traverse(o => { if (o.isSkinnedMesh) hasSkinned = true; });
    if (hasSkinned) {
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      const v = new THREE.Vector3();
      let bones = 0;
      scene.traverse(o => {
        if (o.isBone) { o.getWorldPosition(v); min.min(v); max.max(v); bones++; }
      });
      if (bones > 0) {
        // bones stop at the last joint — pad for the crown/feet/hands mesh
        const pad = (max.y - min.y) * 0.06;
        min.y -= pad * 0.5;
        max.y += pad;
        box = new THREE.Box3(min, max);
      }
    }
    if (!box) box = new THREE.Box3().setFromObject(scene);

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
