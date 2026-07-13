import * as THREE from 'three';

const LOOK_SENSITIVITY = 0.0028;
const PITCH_MIN = 0.05;
const PITCH_MAX = 1.25;
const ZOOM_MIN = 5;
const ZOOM_MAX = 16;

const FOV_NORMAL = 60;
const FOV_SPRINT = 68;
const FOV_AIM = 45;

const AIM_DISTANCE = 4.6;
const AIM_SHOULDER = 1.15; // over-the-right-shoulder offset
const AIM_HEIGHT = 0.5;

// God-mode isometric rig
const GOD_PITCH = Math.atan(1 / Math.sqrt(2)); // classic isometric elevation (~35.26°)
const GOD_DIST = 140;                          // camera distance along the iso axis
const GOD_ZOOM_MIN = 12;                       // ortho half-height (zoomed in)
const GOD_ZOOM_MAX = 62;                       // fits the whole map + spawn line

export class CameraController {
  constructor(canvas) {
    this.aspect = window.innerWidth / window.innerHeight;

    // God-mode camera — isometric orthographic with pan / rotate / zoom
    this.godTarget = new THREE.Vector3(0, 0, -5); // pan center on the ground
    this.godYaw = 0;                              // orbit angle around the map
    this.godZoom = 34;                            // ortho half-height
    this.godCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this._refreshGodCam();

    // Character-mode camera — third-person spring-arm orbit (mouse look)
    this.charCam = new THREE.PerspectiveCamera(FOV_NORMAL, this.aspect, 0.1, 200);
    this.yaw = 0;              // horizontal orbit angle (radians)
    this.pitch = 0.42;         // vertical orbit angle (radians)
    this.targetDistance = 10;  // player-chosen zoom (wheel)
    this.distance = 10;        // smoothed actual arm length
    this._shoulder = 0;        // smoothed aim shoulder offset
    this._fov = FOV_NORMAL;
    this.pivot = new THREE.Vector3(0, 2.1, 8); // smoothed follow point

    this.active = this.godCam;

    // Raycaster for god-mode grid interaction
    this.raycaster = new THREE.Raycaster();

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    this.aspect = window.innerWidth / window.innerHeight;
    this._refreshGodCam();
    this.charCam.aspect = this.aspect;
    this.charCam.updateProjectionMatrix();
  }

  setGodMode() {
    this.active = this.godCam;
  }

  // --- God-mode isometric camera controls ---

  // Reposition the ortho camera on its isometric axis around godTarget
  _refreshGodCam() {
    const c = this.godCam;
    const halfH = this.godZoom;
    const halfW = halfH * this.aspect;
    c.left = -halfW; c.right = halfW; c.top = halfH; c.bottom = -halfH;
    const cosP = Math.cos(GOD_PITCH);
    const dir = new THREE.Vector3(
      Math.sin(this.godYaw) * cosP,
      Math.sin(GOD_PITCH),
      Math.cos(this.godYaw) * cosP
    );
    c.position.copy(this.godTarget).addScaledVector(dir, GOD_DIST);
    c.lookAt(this.godTarget);
    c.updateProjectionMatrix();
  }

  // Pan on the ground plane: dx = screen-right, dz = screen-up
  godPan(dx, dz) {
    const sin = Math.sin(this.godYaw), cos = Math.cos(this.godYaw);
    this.godTarget.x = THREE.MathUtils.clamp(
      this.godTarget.x + cos * dx - sin * dz, -55, 55);
    this.godTarget.z = THREE.MathUtils.clamp(
      this.godTarget.z - sin * dx - cos * dz, -60, 55);
    this._refreshGodCam();
  }

  // Orbit the whole view around the map (Q/E)
  godRotate(delta) {
    this.godYaw += delta;
    this._refreshGodCam();
  }

  // Wheel zoom: shrink/grow the ortho frustum
  godZoomBy(delta) {
    this.godZoom = THREE.MathUtils.clamp(
      this.godZoom + delta, GOD_ZOOM_MIN, GOD_ZOOM_MAX);
    this._refreshGodCam();
  }

  setCharacterMode() {
    this.active = this.charCam;
  }

  // Mouse-look input: rotate the orbit around the player
  addLook(dx, dy, aiming = false) {
    // Slower, precise look while aiming — like ADS in modern shooters
    const sens = aiming ? LOOK_SENSITIVITY * 0.6 : LOOK_SENSITIVITY;
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + dy * sens, PITCH_MIN, PITCH_MAX
    );
  }

  // Scroll-wheel zoom in/out (smoothed toward targetDistance in followPlayer)
  addZoom(delta) {
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + delta * 0.01, ZOOM_MIN, ZOOM_MAX
    );
  }

  // Horizontal direction the camera is facing (used for camera-relative movement)
  get forwardYaw() {
    return this.yaw;
  }

  // Spring-arm follow: the pivot chases the player with damping, the camera
  // sits rigidly on the orbit arm (no positional lerp on the orbit itself —
  // that's what used to make the camera spiral). Aiming pulls the camera in
  // over the right shoulder and tightens the FOV.
  followPlayer(playerPos, dt, { aiming = false, sprinting = false } = {}) {
    // Damped pivot chase — horizontal snappier than vertical so jumps feel soft
    const t = new THREE.Vector3(playerPos.x, playerPos.y + 2.1, playerPos.z);
    this.pivot.x = THREE.MathUtils.damp(this.pivot.x, t.x, 16, dt);
    this.pivot.z = THREE.MathUtils.damp(this.pivot.z, t.z, 16, dt);
    this.pivot.y = THREE.MathUtils.damp(this.pivot.y, t.y, 9, dt);

    // Smooth arm length + shoulder offset
    const wantDist = aiming ? AIM_DISTANCE : this.targetDistance;
    this.distance = THREE.MathUtils.damp(this.distance, wantDist, 10, dt);
    this._shoulder = THREE.MathUtils.damp(this._shoulder, aiming ? AIM_SHOULDER : 0, 10, dt);

    // Orbit position
    const cosP = Math.cos(this.pitch);
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * cosP,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosP
    ).multiplyScalar(this.distance);

    // Shoulder shift along the camera-right axis, raised slightly while aiming
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const lookPoint = this.pivot.clone()
      .addScaledVector(right, this._shoulder)
      .add(new THREE.Vector3(0, this._shoulder * (AIM_HEIGHT / AIM_SHOULDER), 0));

    this.charCam.position.copy(lookPoint).add(offset);
    // Never clip below the ground plane
    if (this.charCam.position.y < 0.5) this.charCam.position.y = 0.5;
    this.charCam.lookAt(lookPoint);

    // Dynamic FOV: wider on sprint, tighter on aim
    const wantFov = aiming ? FOV_AIM : (sprinting ? FOV_SPRINT : FOV_NORMAL);
    const fov = THREE.MathUtils.damp(this._fov, wantFov, 8, dt);
    if (Math.abs(fov - this._fov) > 0.01) {
      this._fov = fov;
      this.charCam.fov = fov;
      this.charCam.updateProjectionMatrix();
    }
  }

  // Snap the orbit behind the player (used when a wave starts / character swaps)
  snapBehind(playerPos, playerRotY = 0) {
    this.yaw = playerRotY;
    this.pivot.set(playerPos.x, playerPos.y + 2.1, playerPos.z);
    this.distance = this.targetDistance;
    this.followPlayer(playerPos, 1);
  }

  // Raycast from god-mode camera onto the ground plane
  raycastGround(ndcX, ndcY, ground) {
    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.godCam);
    const hits = this.raycaster.intersectObject(ground);
    if (hits.length > 0) return hits[0].point;
    return null;
  }
}
