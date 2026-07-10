import * as THREE from 'three';

// Character definitions — portable stats
const CHARACTERS = {
  COMBAT: {
    id: 'COMBAT',
    name: 'Combat Worker',
    speed: 10,
    acceleration: 40,
    friction: 12,
    ability: 'stun',
    abilityRange: 12,
    abilityDamage: 18,
    abilityCooldown: 0.25,
    repairRate: 0,
    bodyColor: 0x2266aa,
    hatColor: 0xffcc00,
    toolColor: 0x333333,
  },
  REPAIR: {
    id: 'REPAIR',
    name: 'Repair Worker',
    speed: 8,
    acceleration: 35,
    friction: 10,
    ability: 'repair',
    abilityRange: 6,
    abilityDamage: 5,        // weak self-defense stun
    abilityCooldown: 0.1,
    repairRate: 40,           // HP per second while clicking a target
    bodyColor: 0xdd6622,
    hatColor: 0xffffff,
    toolColor: 0x888833,
  },
};

export { CHARACTERS };

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.activeChar = 'COMBAT';

    // Shared state
    this.velocity = new THREE.Vector3();
    this.aimPoint = new THREE.Vector3(0, 0, -5);
    this._raycaster = new THREE.Raycaster();
    this.rotationY = 0;
    this.cooldownTimer = 0;
    this._bobTime = 0;
    this._bobOffset = 0;

    // Repair target (defense or station being repaired)
    this.repairTarget = null;
    this.isRepairing = false;

    // Build both character meshes
    this._combatGroup = this._buildCombatWorker();
    this._repairGroup = this._buildRepairWorker();

    // Main group holds the active character
    this.group = new THREE.Group();
    this.group.name = 'player';
    this.group.add(this._combatGroup);
    this.group.add(this._repairGroup);
    this._repairGroup.visible = false;

    // The idle partner stands nearby
    this._partnerGroup = new THREE.Group();
    this._partnerGroup.name = 'partner';
    this._partnerMesh = this._buildPartnerIndicator();
    this._partnerGroup.add(this._partnerMesh);
    this._partnerGroup.position.set(3, 0, 8);
    scene.add(this._partnerGroup);

    this.group.position.set(0, 0, 8);
    scene.add(this.group);
  }

  get stats() {
    return CHARACTERS[this.activeChar];
  }

  get position() {
    return this.group.position;
  }

  // --- Build character meshes ---

  _buildCombatWorker() {
    const g = new THREE.Group();
    const def = CHARACTERS.COMBAT;

    // Body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: def.bodyColor })
    );
    body.position.y = 1.3;
    body.castShadow = true;
    g.add(body);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xddaa77 })
    );
    head.position.y = 2.4;
    head.castShadow = true;
    g.add(head);

    // Hard hat (yellow)
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.45, 0.25, 8),
      new THREE.MeshStandardMaterial({ color: def.hatColor })
    );
    hat.position.y = 2.7;
    g.add(hat);

    // Stun gun
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, 0.6),
      new THREE.MeshStandardMaterial({ color: def.toolColor })
    );
    gun.position.set(0.55, 1.5, -0.3);
    g.add(gun);

    // Stun flash
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.8 })
    );
    flash.position.set(0.55, 1.5, -0.7);
    flash.visible = false;
    flash.name = 'flash';
    g.add(flash);

    // Shoulder armor
    const armor = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.2, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x334466 })
    );
    armor.position.set(-0.5, 1.8, 0);
    g.add(armor);

    // Store base Y for bob
    g.children.forEach(c => { c.userData.baseY = c.position.y; });

    return g;
  }

  _buildRepairWorker() {
    const g = new THREE.Group();
    const def = CHARACTERS.REPAIR;

    // Body (orange hi-vis)
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: def.bodyColor })
    );
    body.position.y = 1.3;
    body.castShadow = true;
    g.add(body);

    // Hi-vis stripes
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.52, 0.12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffff44 })
    );
    stripe.position.y = 1.0;
    g.add(stripe);
    const stripe2 = stripe.clone();
    stripe2.position.y = 1.5;
    g.add(stripe2);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xddaa77 })
    );
    head.position.y = 2.4;
    head.castShadow = true;
    g.add(head);

    // White hard hat
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.45, 0.25, 8),
      new THREE.MeshStandardMaterial({ color: def.hatColor })
    );
    hat.position.y = 2.7;
    g.add(hat);

    // Wrench
    const wrenchHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6),
      new THREE.MeshStandardMaterial({ color: def.toolColor })
    );
    wrenchHandle.position.set(0.55, 1.5, -0.2);
    wrenchHandle.rotation.x = 0.3;
    g.add(wrenchHandle);

    const wrenchHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.08, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xaabb33 })
    );
    wrenchHead.position.set(0.55, 1.5, -0.6);
    g.add(wrenchHead);

    // Repair glow (shown when repairing)
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.6 })
    );
    glow.position.set(0.55, 1.5, -0.7);
    glow.visible = false;
    glow.name = 'flash';
    g.add(glow);

    // Tool belt
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 0.15, 8),
      new THREE.MeshStandardMaterial({ color: 0x554422 })
    );
    belt.position.y = 0.7;
    g.add(belt);

    // Store base Y for bob
    g.children.forEach(c => { c.userData.baseY = c.position.y; });

    return g;
  }

  _buildPartnerIndicator() {
    // Small floating arrow above the idle partner's position
    const g = new THREE.Group();
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.5, 4),
      new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.6 })
    );
    arrow.position.y = 3.5;
    arrow.rotation.x = Math.PI; // point down
    g.add(arrow);

    // Label ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.05, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.3 })
    );
    ring.position.y = 0.1;
    ring.rotation.x = Math.PI / 2;
    g.add(ring);

    return g;
  }

  // --- Switch characters ---

  switchCharacter() {
    // Save current position for partner
    const partnerPos = this.group.position.clone();

    if (this.activeChar === 'COMBAT') {
      this.activeChar = 'REPAIR';
      this._combatGroup.visible = false;
      this._repairGroup.visible = true;
    } else {
      this.activeChar = 'COMBAT';
      this._combatGroup.visible = true;
      this._repairGroup.visible = false;
    }

    // Swap positions: active goes to partner's spot, partner goes to old spot
    const newPos = this._partnerGroup.position.clone();
    this._partnerGroup.position.copy(partnerPos);
    this.group.position.copy(newPos);

    // Reset state
    this.velocity.set(0, 0, 0);
    this.cooldownTimer = 0;
    this.isRepairing = false;
    this.repairTarget = null;

    return this.activeChar;
  }

  // --- Main update ---

  update(input, dt, camera, ground) {
    const stats = this.stats;

    // --- Movement ---
    const inputDir = new THREE.Vector3();
    if (input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp')) inputDir.z -= 1;
    if (input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown')) inputDir.z += 1;
    if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) inputDir.x -= 1;
    if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) inputDir.x += 1;

    if (inputDir.length() > 0) {
      inputDir.normalize();
      this.velocity.x += inputDir.x * stats.acceleration * dt;
      this.velocity.z += inputDir.z * stats.acceleration * dt;
    }

    const frictionFactor = Math.exp(-stats.friction * dt);
    this.velocity.x *= frictionFactor;
    this.velocity.z *= frictionFactor;

    const currentSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (currentSpeed > stats.speed) {
      const scale = stats.speed / currentSpeed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    this.group.position.x += this.velocity.x * dt;
    this.group.position.z += this.velocity.z * dt;

    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -44, 44);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -44, 44);

    // --- Aim toward mouse ---
    if (camera && ground) {
      this._raycaster.setFromCamera(
        { x: input.mouse.ndcX, y: input.mouse.ndcY },
        camera
      );
      const hits = this._raycaster.intersectObject(ground);
      if (hits.length > 0) {
        this.aimPoint.copy(hits[0].point);
        const dx = this.aimPoint.x - this.group.position.x;
        const dz = this.aimPoint.z - this.group.position.z;
        // Only rotate if aim point is far enough from player to be stable
        if (dx * dx + dz * dz > 1) {
          this.rotationY = Math.atan2(dx, dz);
        }
      }
    }

    this.group.rotation.y = this.rotationY;

    // --- Walking bob ---
    const activeGroup = this.activeChar === 'COMBAT' ? this._combatGroup : this._repairGroup;
    if (currentSpeed > 0.5) {
      this._bobTime += dt * currentSpeed * 1.5;
      this._bobOffset = Math.abs(Math.sin(this._bobTime)) * 0.12;
    } else {
      this._bobTime = 0;
      this._bobOffset = THREE.MathUtils.lerp(this._bobOffset, 0, 10 * dt);
    }
    activeGroup.children.forEach(child => {
      if (child.userData.baseY !== undefined) {
        child.position.y = child.userData.baseY + this._bobOffset;
      }
    });

    // --- Partner idle bob (floating arrow) ---
    if (this._partnerMesh) {
      const arrow = this._partnerMesh.children[0];
      if (arrow) arrow.position.y = 3.5 + Math.sin(performance.now() * 0.003) * 0.3;
    }

    // --- Cooldown ---
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= dt;
    }

    // Hide flash
    const flash = activeGroup.getObjectByName('flash');
    if (flash && flash.visible && this.cooldownTimer < stats.abilityCooldown - 0.08) {
      flash.visible = false;
    }
  }

  // --- Abilities ---

  tryFire() {
    if (this.cooldownTimer > 0) return false;
    this.cooldownTimer = this.stats.abilityCooldown;
    const activeGroup = this.activeChar === 'COMBAT' ? this._combatGroup : this._repairGroup;
    const flash = activeGroup.getObjectByName('flash');
    if (flash) flash.visible = true;
    return true;
  }

  // Combat: get stun target point
  getStunTarget() {
    const dir = new THREE.Vector3(
      this.aimPoint.x - this.group.position.x,
      0,
      this.aimPoint.z - this.group.position.z
    );
    if (dir.length() < 0.1) {
      dir.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationY);
    } else {
      dir.normalize();
    }
    const range = this.stats.abilityRange;
    const stunPoint = this.group.position.clone().add(
      dir.multiplyScalar(range * 0.5)
    );
    stunPoint.y = 1;
    return stunPoint;
  }

  // Repair: try to repair a defense or station near the aim point
  tryRepair(defenses, station, dt) {
    if (this.activeChar !== 'REPAIR') return null;
    if (!this.isRepairing) return null;

    const repairRange = this.stats.abilityRange;
    const repairHP = this.stats.repairRate * dt;

    // Check defenses near aim point
    for (const d of defenses) {
      if (!d.alive) continue;
      const dist = this.group.position.distanceTo(d.group.position);
      if (dist <= repairRange && d.health < d.maxHealth) {
        d.health = Math.min(d.maxHealth, d.health + repairHP);
        return { type: 'defense', target: d };
      }
    }

    // Check station
    const stationDist = this.group.position.distanceTo(station.position);
    if (stationDist <= repairRange + 5 && station.health < station.maxHealth) {
      station.health = Math.min(station.maxHealth, station.health + repairHP);
      return { type: 'station' };
    }

    return null;
  }

  hide() {
    this.group.visible = false;
    this._partnerGroup.visible = false;
  }

  show() {
    this.group.visible = true;
    this._partnerGroup.visible = true;
  }

  reset() {
    this.group.position.set(0, 0, 8);
    this._partnerGroup.position.set(3, 0, 8);
    this.velocity.set(0, 0, 0);
    this.rotationY = 0;
    this.group.rotation.y = 0;
    this.cooldownTimer = 0;
    this._bobTime = 0;
    this._bobOffset = 0;
    this.activeChar = 'COMBAT';
    this._combatGroup.visible = true;
    this._repairGroup.visible = false;
    this.isRepairing = false;
    this.repairTarget = null;
  }
}
