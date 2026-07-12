import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Runtime Mixamo pipeline (Task 3/4 of docs/mixamo-animation-plan.md).
//
// Clip sources, merged at runtime:
//  1. Converted clip GLBs in assets/models/characters/<character>/, named
//     per assets/models/animation-manifest.json. Each file's .animations[0]
//     is extracted and registered under its manifest clip name ("idle",
//     "walk", …). Missing files are skipped silently — drop in the files
//     and they start working, no code changes.
//  2. Animations embedded in the base model GLB itself (e.g. the combat
//     worker ships with one baked clip). Used as fallback for any
//     locomotion state that has no dedicated clip yet.
//
// Three.js matches animation tracks to bones BY NAME, so clips exported
// from the same Mixamo auto-rig drive the base skinned mesh regardless of
// which file they came from.

const MANIFEST_URL = 'assets/models/animation-manifest.json';
const CLIP_DIR = 'assets/models/characters';
const INDEX_URL = 'assets/models/characters/index.json';
const FADE = 0.25;

// Loaded once, shared by every animator
let manifestPromise = null;
let indexPromise = null;
const clipLibrary = {};   // character -> { clipName -> AnimationClip }

async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL)
      .then(r => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return manifestPromise;
}

// index.json lists the clip GLBs that actually exist (maintained by
// scripts/convert-mixamo.js) so the runtime never requests missing files
async function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(INDEX_URL)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return indexPromise;
}

// Load every converted clip GLB that exists for one character (silently
// skipping the ones not downloaded/converted yet).
export async function loadCharacterClips(character) {
  if (clipLibrary[character]) return clipLibrary[character];
  const [manifest, index] = await Promise.all([loadManifest(), loadIndex()]);
  const entry = manifest[character];
  const available = index ? new Set(index[character] || []) : null;
  const clips = {};
  if (entry && entry.clips) {
    const loader = new GLTFLoader();
    const jobs = Object.entries(entry.clips)
      .filter(([, def]) => !available || available.has(def.output_filename));
    await Promise.allSettled(
      jobs.map(([name, def]) =>
        loader.loadAsync(`${CLIP_DIR}/${character}/${def.output_filename}`)
          .then(gltf => {
            if (gltf.animations && gltf.animations.length > 0) {
              clips[name] = gltf.animations[0];
            }
          })
      )
    );
  }
  clipLibrary[character] = clips;
  return clips;
}

// Crossfading animation state machine for one character instance.
export class CharacterAnimator {
  // root: the object the AnimationMixer targets (the model wrapper)
  // clips: { name -> AnimationClip } (from loadCharacterClips)
  // embedded: AnimationClip[] baked into the base GLB (fallback)
  constructor(root, clips = {}, embedded = []) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    this.current = null;
    this.currentName = null;
    this._oneShotUntil = 0;
    this._time = 0;

    for (const [name, clip] of Object.entries(clips)) {
      this.actions[name] = this.mixer.clipAction(clip);
    }
    // Embedded fallback drives locomotion states that lack dedicated clips
    if (embedded.length > 0) {
      this.actions._embedded = this.mixer.clipAction(embedded[0]);
    }
  }

  get hasAnyClip() {
    return Object.keys(this.actions).length > 0;
  }

  // Resolve a state to the best available action:
  // exact clip -> listed fallbacks -> embedded catch-all
  _resolve(names) {
    for (const n of names) {
      if (this.actions[n]) return { action: this.actions[n], name: n };
    }
    if (this.actions._embedded) return { action: this.actions._embedded, name: '_embedded' };
    return null;
  }

  // Crossfade to a looping state. fallbacks let e.g. "sprint" reuse "run".
  setState(name, fallbacks = [], timeScale = 1) {
    const resolved = this._resolve([name, ...fallbacks]);
    if (!resolved) return;
    if (this._time < this._oneShotUntil) return; // let one-shots finish
    resolved.action.timeScale = timeScale;
    if (resolved.name === this.currentName) return;
    resolved.action.reset();
    resolved.action.setLoop(THREE.LoopRepeat, Infinity);
    resolved.action.play();
    if (this.current && this.current !== resolved.action) {
      this.current.crossFadeTo(resolved.action, FADE, false);
    }
    this.current = resolved.action;
    this.currentName = resolved.name;
  }

  // Play a one-shot (fire, death, …); loops back to normal states after.
  // holdLast=true freezes on the final frame (death poses).
  playOneShot(name, { holdLast = false, timeScale = 1 } = {}) {
    const action = this.actions[name];
    if (!action) return false;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = holdLast;
    action.timeScale = timeScale;
    action.play();
    if (this.current && this.current !== action) {
      this.current.crossFadeTo(action, FADE * 0.6, false);
    }
    this.current = action;
    this.currentName = name;
    const dur = action.getClip().duration / Math.max(0.01, timeScale);
    this._oneShotUntil = holdLast ? Infinity : this._time + dur - FADE;
    return true;
  }

  update(dt) {
    this._time += dt;
    this.mixer.update(dt);
  }
}
