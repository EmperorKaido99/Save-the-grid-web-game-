import * as THREE from 'three';

export class Player {
  constructor(scene) {
    this.speed = 10;
    this.acceleration = 40;
    this.friction = 12;
    this.stunGunRange = 12;
    this.stunGunDamage = 18;
    this.stunGunCooldown = 0.25;
    this.cooldownTimer = 0;

    // Velocity for smooth movement
    this.velocity = new THREE.Vector3();

    // Where the player is aiming (world position on ground)
    // Default to in front of starting position so first shot isn't random
    this.aimPoint = new THREE.Vector3(0, 0, -5);

    // Reusable raycaster (avoid allocating per frame)
    this._raycaster = new THREE.Raycaster();

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

    // Walking bob state
    this._bobTime = 0;
    this._bobOffset = 0;

    // Store base Y positions for all children so bob can offset them
    this.group.children.forEach(child => {
      child.userData.baseY = child.position.y;
    });

    this.group.position.set(0, 0, 8);
    scene.add(this.group);

    this.rotationY = 0;
  }

  get position() {
    return this.group.position;
  }

  update(input, dt, camera, ground) {
    // --- Movement with acceleration/friction ---
    const inputDir = new THREE.Vector3();
    if (input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp')) inputDir.z -= 1;
    if (input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown')) inputDir.z += 1;
    if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) inputDir.x -= 1;
    if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) inputDir.x += 1;

    if (inputDir.length() > 0) {
      inputDir.normalize();
      // Accelerate toward input direction
      this.velocity.x += inputDir.x * this.acceleration * dt;
      this.velocity.z += inputDir.z * this.acceleration * dt;
    }

    // Apply friction (deceleration when no input or always)
    const frictionFactor = Math.exp(-this.friction * dt);
    this.velocity.x *= frictionFactor;
    this.velocity.z *= frictionFactor;

    // Clamp to max speed
    const currentSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (currentSpeed > this.speed) {
      const scale = this.speed / currentSpeed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // Apply velocity
    this.group.position.x += this.velocity.x * dt;
    this.group.position.z += this.velocity.z * dt;

    // Clamp to play area
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -44, 44);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -44, 44);

    // --- Aim toward mouse (raycast onto ground) ---
    if (camera && ground) {
      this._raycaster.setFromCamera(
        { x: input.mouse.ndcX, y: input.mouse.ndcY },
        camera
      );
      const hits = this._raycaster.intersectObject(ground);
      if (hits.length > 0) {
        this.aimPoint.copy(hits[0].point);
        // Rotate player to face aim point
        const dx = this.aimPoint.x - this.group.position.x;
        const dz = this.aimPoint.z - this.group.position.z;
        this.rotationY = Math.atan2(dx, dz);
      }
    }

    // Smooth rotation toward aim direction
    this.group.rotation.y = this.rotationY;

    // --- Walking bob (offset children, NOT group.position.y, so camera/collision stay flat) ---
    if (currentSpeed > 0.5) {
      this._bobTime += dt * currentSpeed * 1.5;
      this._bobOffset = Math.abs(Math.sin(this._bobTime)) * 0.12;
    } else {
      this._bobTime = 0;
      this._bobOffset = THREE.MathUtils.lerp(this._bobOffset, 0, 10 * dt);
    }
    this.group.children.forEach(child => {
      if (child.userData.baseY !== undefined) {
        child.position.y = child.userData.baseY + this._bobOffset;
      }
    });

    // --- Cooldown ---
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

  // Get the point the stun gun fires toward (aim-based)
  getStunTarget() {
    const dir = new THREE.Vector3(
      this.aimPoint.x - this.group.position.x,
      0,
      this.aimPoint.z - this.group.position.z
    );
    if (dir.length() < 0.1) {
      // Fallback: fire forward
      dir.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationY);
    } else {
      dir.normalize();
    }
    const stunPoint = this.group.position.clone().add(
      dir.multiplyScalar(this.stunGunRange * 0.5)
    );
    stunPoint.y = 1;
    return stunPoint;
  }

  hide() { this.group.visible = false; }
  show() { this.group.visible = true; }

  reset() {
    this.group.position.set(0, 0, 8);
    this.velocity.set(0, 0, 0);
    this.rotationY = 0;
    this.group.rotation.y = 0;
    this.cooldownTimer = 0;
    this._bobTime = 0;
  }
}
