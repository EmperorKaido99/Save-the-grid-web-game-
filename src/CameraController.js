import * as THREE from 'three';

export class CameraController {
  constructor(canvas) {
    this.aspect = window.innerWidth / window.innerHeight;

    // God-mode camera — top-down perspective
    this.godCam = new THREE.PerspectiveCamera(50, this.aspect, 0.1, 200);
    this.godCam.position.set(0, 60, 35);
    this.godCam.lookAt(0, 0, 0);

    // Character-mode camera — third-person follow
    this.charCam = new THREE.PerspectiveCamera(60, this.aspect, 0.1, 200);
    this.charCam.position.set(0, 8, 12);

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

  // Follow the player in character mode — smooth lerp (fixed offset, no rotation)
  followPlayer(playerPos, playerRotY, dt) {
    const offset = new THREE.Vector3(0, 6, 10);
    const target = playerPos.clone().add(offset);

    this.charCam.position.lerp(target, 1 - Math.exp(-8 * dt));
    this.charCam.lookAt(
      playerPos.x,
      playerPos.y + 2,
      playerPos.z
    );
  }

  // Raycast from god-mode camera onto the ground plane
  raycastGround(ndcX, ndcY, ground) {
    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.godCam);
    const hits = this.raycaster.intersectObject(ground);
    if (hits.length > 0) return hits[0].point;
    return null;
  }
}
