import * as THREE from 'three';

const LOOK_SENSITIVITY = 0.0028;
const PITCH_MIN = 0.08;
const PITCH_MAX = 1.25;
const ZOOM_MIN = 6;
const ZOOM_MAX = 18;

export class CameraController {
  constructor(canvas) {
    this.aspect = window.innerWidth / window.innerHeight;

    // God-mode camera — top-down perspective
    this.godCam = new THREE.PerspectiveCamera(50, this.aspect, 0.1, 200);
    this.godCam.position.set(0, 60, 35);
    this.godCam.lookAt(0, 0, 0);

    // Character-mode camera — third-person orbit (mouse look)
    this.charCam = new THREE.PerspectiveCamera(60, this.aspect, 0.1, 200);
    this.yaw = 0;          // horizontal orbit angle (radians)
    this.pitch = 0.45;     // vertical orbit angle (radians)
    this.distance = 11;    // orbit radius
    this.pivot = new THREE.Vector3(0, 2, 8); // smoothed follow point

    this.active = this.godCam;

    // Raycaster for god-mode grid interaction
    this.raycaster = new THREE.Raycaster();

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    this.aspect = window.innerWidth / window.innerHeight;
    this.godCam.aspect = this.aspect;
    this.godCam.updateProjectionMatrix();
    this.charCam.aspect = this.aspect;
    this.charCam.updateProjectionMatrix();
  }

  setGodMode() {
    this.active = this.godCam;
  }

  setCharacterMode() {
    this.active = this.charCam;
  }

  // Mouse-look input: rotate the orbit around the player
  addLook(dx, dy) {
    this.yaw -= dx * LOOK_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + dy * LOOK_SENSITIVITY, PITCH_MIN, PITCH_MAX
    );
  }

  // Scroll-wheel zoom in/out
  addZoom(delta) {
    this.distance = THREE.MathUtils.clamp(
      this.distance + delta * 0.01, ZOOM_MIN, ZOOM_MAX
    );
  }

  // Horizontal direction the camera is facing (used for camera-relative movement)
  get forwardYaw() {
    return this.yaw;
  }

  // Follow the player: smooth the pivot only, then place the camera on the
  // orbit sphere directly — no positional lerp on the orbit itself, which is
  // what caused the camera to spiral/spin when the player moved.
  followPlayer(playerPos, dt) {
    const target = new THREE.Vector3(playerPos.x, playerPos.y + 2, playerPos.z);
    this.pivot.lerp(target, 1 - Math.exp(-12 * dt));

    const cosP = Math.cos(this.pitch);
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * cosP,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosP
    ).multiplyScalar(this.distance);

    this.charCam.position.copy(this.pivot).add(offset);
    this.charCam.lookAt(this.pivot);
  }

  // Snap the orbit behind the player (used when a wave starts / character swaps)
  snapBehind(playerPos, playerRotY = 0) {
    this.yaw = playerRotY;
    this.pivot.set(playerPos.x, playerPos.y + 2, playerPos.z);
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
