import * as THREE from 'three';

// Third-person spring-arm camera rig.
//
// - Targets a pivot at shoulder height offset from the character origin
// - Collision-aware: casts from the pivot toward the desired camera position
//   every frame (via an injected castRay so this file knows nothing about
//   the physics engine) and pulls the camera in along the arm when blocked.
//   Pull-in is near-instant (never clip); release is smoothed (no pop).
// - Separate position vs rotation smoothing — rotation is snappier
// - Mouse-look with clamped pitch, configurable sensitivity
// - Dynamic FOV (sprint kick / aim focus), over-the-shoulder bias,
//   and a decoupled shake(intensity, duration) API

export const CAMERA_DEFAULTS = {
  sensitivity: 0.0028,
  aimSensitivityScale: 0.6,
  pitchMin: 0.03,
  pitchMax: 1.25,
  distance: 6.5,          // default arm length
  distanceMin: 3.5,       // wheel zoom range
  distanceMax: 12,
  aimDistance: 3.2,
  pivotHeight: 1.55,      // shoulder height on the character
  shoulderSide: 1,        // +1 right shoulder, -1 left
  shoulderOffset: 0.45,   // lateral bias at rest
  aimShoulderOffset: 0.95,
  aimPivotRaise: 0.25,
  collisionMargin: 0.25,  // keep this far off the blocking surface
  pullInLambda: 40,       // near-instant pull-in (never clip)
  releaseLambda: 5,       // smoothed release (no pop)
  posLambdaXZ: 16,        // pivot chase — position lag
  posLambdaY: 9,          // softer vertical (jumps feel smooth)
  rotLambda: 30,          // rotation chase — snappier than position
  fovNormal: 60,
  fovSprint: 68,
  fovAim: 47,
  fovLambda: 8,
  minY: 0.35,             // never sink under the floor plane
};

function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export class CameraController {
  constructor(camera, options = {}) {
    this.camera = camera;
    this.opts = { ...CAMERA_DEFAULTS, ...options };

    this.yaw = options.yaw ?? 0;
    this.pitch = options.pitch ?? 0.38;
    this.targetDistance = this.opts.distance; // wheel-zoom target
    this._armLength = this.opts.distance;     // smoothed, collision-limited
    this._shoulder = this.opts.shoulderOffset;
    this._pivotRaise = 0;
    this._fov = this.opts.fovNormal;
    this.pivot = new THREE.Vector3(0, this.opts.pivotHeight, 0);

    // Injected by the owner: (origin:{x,y,z}, dir:{x,y,z}, maxDist) => dist|null
    this.castRay = options.castRay || null;

    this._shakes = [];
    this._tmpQuat = new THREE.Quaternion();
    this._lookMatrix = new THREE.Matrix4();

    camera.fov = this._fov;
    camera.updateProjectionMatrix();
  }

  // --- Public API ---

  // Decoupled shake: any system can call this without knowing camera internals
  shake(intensity = 1, duration = 0.3) {
    this._shakes.push({
      intensity, duration, t: 0,
      seed: Math.random() * 1000,
    });
  }

  addLook(dx, dy, aiming = false) {
    const s = this.opts.sensitivity * (aiming ? this.opts.aimSensitivityScale : 1);
    this.yaw -= dx * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * s, this.opts.pitchMin, this.opts.pitchMax);
  }

  addZoom(delta) {
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + delta * 0.01, this.opts.distanceMin, this.opts.distanceMax
    );
  }

  get forwardYaw() {
    return this.yaw;
  }

  // Instantly place the arm behind the character (spawn / character swap)
  snapBehind(playerPos, yaw = 0) {
    this.yaw = yaw;
    this.pivot.set(playerPos.x, playerPos.y + this.opts.pivotHeight, playerPos.z);
    this._armLength = this.targetDistance;
    this.update(1, { position: playerPos, aiming: false, sprinting: false }, { x: 0, y: 0 });
  }

  // playerLike: { position:{x,y,z}, aiming:bool, sprinting:bool }
  // lookDelta:  { x, y } from the normalized input state
  update(dt, playerLike, lookDelta = { x: 0, y: 0 }, zoomDelta = 0) {
    const o = this.opts;
    const aiming = !!playerLike.aiming;

    if (lookDelta.x || lookDelta.y) this.addLook(lookDelta.x, lookDelta.y, aiming);
    if (zoomDelta) this.addZoom(zoomDelta);

    // --- Pivot chase (position smoothing; vertical softer) ---
    const p = playerLike.position;
    this.pivot.x = damp(this.pivot.x, p.x, o.posLambdaXZ, dt);
    this.pivot.z = damp(this.pivot.z, p.z, o.posLambdaXZ, dt);
    this.pivot.y = damp(this.pivot.y, p.y + o.pivotHeight, o.posLambdaY, dt);

    // --- Shoulder bias & aim framing ---
    this._shoulder = damp(this._shoulder,
      (aiming ? o.aimShoulderOffset : o.shoulderOffset) * o.shoulderSide, 10, dt);
    this._pivotRaise = damp(this._pivotRaise, aiming ? o.aimPivotRaise : 0, 10, dt);

    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const anchor = this.pivot.clone()
      .addScaledVector(right, this._shoulder)
      .add(new THREE.Vector3(0, this._pivotRaise, 0));

    // --- Desired arm length, then collision-limit it ---
    const wantDist = aiming ? o.aimDistance : this.targetDistance;
    const cosP = Math.cos(this.pitch);
    const armDir = new THREE.Vector3(
      Math.sin(this.yaw) * cosP,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosP
    );

    let limit = wantDist;
    if (this.castRay) {
      const hit = this.castRay(
        { x: anchor.x, y: anchor.y, z: anchor.z },
        { x: armDir.x, y: armDir.y, z: armDir.z },
        wantDist + o.collisionMargin
      );
      if (hit !== null && hit < wantDist + o.collisionMargin) {
        limit = Math.max(0.5, hit - o.collisionMargin);
      }
    }

    // Pull in fast (never clip), release slow (no pop)
    const lambda = limit < this._armLength ? o.pullInLambda : o.releaseLambda;
    this._armLength = damp(this._armLength, Math.min(limit, wantDist), lambda, dt);
    // Hard guarantee against clipping even mid-smooth
    if (this._armLength > limit) this._armLength = limit;

    const camPos = anchor.clone().addScaledVector(armDir, this._armLength);
    if (camPos.y < o.minY) camPos.y = o.minY;

    // --- Shake (positional jitter + roll), decays over duration ---
    let shakeX = 0, shakeY = 0, shakeRoll = 0;
    for (let i = this._shakes.length - 1; i >= 0; i--) {
      const s = this._shakes[i];
      s.t += dt;
      if (s.t >= s.duration) { this._shakes.splice(i, 1); continue; }
      const fade = 1 - s.t / s.duration;
      const a = s.intensity * fade * fade;
      const t = (s.t + s.seed) * 60;
      shakeX += Math.sin(t * 1.1) * 0.06 * a;
      shakeY += Math.sin(t * 1.7 + 1.3) * 0.05 * a;
      shakeRoll += Math.sin(t * 1.3 + 2.1) * 0.015 * a;
    }
    camPos.x += shakeX;
    camPos.y += shakeY;

    // --- Apply: position directly on the arm, rotation smoothed separately
    this.camera.position.copy(camPos);
    this._lookMatrix.lookAt(camPos, anchor, THREE.Object3D.DEFAULT_UP);
    this._tmpQuat.setFromRotationMatrix(this._lookMatrix);
    // Rotation chase is snappier than position lag; dt=1 (snap) slerps fully
    const rotT = 1 - Math.exp(-o.rotLambda * dt);
    this.camera.quaternion.slerp(this._tmpQuat, Math.min(1, rotT));
    if (shakeRoll) this.camera.rotateZ(shakeRoll);

    // --- Dynamic FOV ---
    const wantFov = aiming ? o.fovAim
      : (playerLike.sprinting ? o.fovSprint : o.fovNormal);
    const fov = damp(this._fov, wantFov, o.fovLambda, dt);
    if (Math.abs(fov - this._fov) > 0.01) {
      this._fov = fov;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
