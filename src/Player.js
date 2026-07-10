import * as THREE from 'three';

export class Player {
  constructor(scene) {
    this.speed = 10;
    this.stunGunRange = 12;
    this.stunGunDamage = 18;
    this.stunGunCooldown = 0.25;
    this.cooldownTimer = 0;

    // Build player mesh — capsule-ish figure (worker in hard hat)
    this.group = new THREE.Group();
    this.group.name = 'player';

    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.6, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2266aa });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.3;
    body.castShadow = true;
    this.group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xddaa77 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.4;
    head.castShadow = true;
    this.group.add(head);

    // Hard hat
    const hatGeo = new THREE.CylinderGeometry(0.42, 0.45, 0.25, 8);
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 2.7;
    this.group.add(hat);

    // Stun gun (small box on right side)
    const gunGeo = new THREE.BoxGeometry(0.15, 0.15, 0.6);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    this.gun = new THREE.Mesh(gunGeo, gunMat);
    this.gun.position.set(0.55, 1.5, -0.3);
    this.group.add(this.gun);

    // Stun flash (shown briefly when firing)
    const flashGeo = new THREE.SphereGeometry(0.3, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.8 });
    this.flash = new THREE.Mesh(flashGeo, flashMat);
    this.flash.position.set(0.55, 1.5, -0.7);
    this.flash.visible = false;
    this.group.add(this.flash);

    this.group.position.set(0, 0, 8);
    scene.add(this.group);

    // Movement direction
    this.rotationY = 0;
  }

  get position() {
    return this.group.position;
  }

  update(input, dt) {
    // WASD movement
    const moveDir = new THREE.Vector3();
    if (input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp')) moveDir.z -= 1;
    if (input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown')) moveDir.z += 1;
    if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) moveDir.x -= 1;
    if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) moveDir.x += 1;

    if (moveDir.length() > 0) {
      moveDir.normalize();
      this.group.position.addScaledVector(moveDir, this.speed * dt);
      this.rotationY = Math.atan2(moveDir.x, moveDir.z);
      this.group.rotation.y = this.rotationY;
    }

    // Clamp to play area
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -44, 44);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -44, 44);

    // Cooldown
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= dt;
    }

    // Hide flash after brief display
    if (this.flash.visible && this.cooldownTimer < this.stunGunCooldown - 0.08) {
      this.flash.visible = false;
    }
  }

  // Fire stun gun — returns true if fired
  tryFire() {
    if (this.cooldownTimer > 0) return false;
    this.cooldownTimer = this.stunGunCooldown;
    this.flash.visible = true;
    return true;
  }

  hide() { this.group.visible = false; }
  show() { this.group.visible = true; }

  reset() {
    this.group.position.set(0, 0, 8);
    this.rotationY = 0;
    this.group.rotation.y = 0;
    this.cooldownTimer = 0;
  }
}
