import * as THREE from 'three';
import { Models } from './ModelLoader.js';
import { CharacterAnimator } from './AnimationSystem.js';

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
    this.velY = 0;           // vertical velocity (jumping)
    this.grounded = true;
    this.rotationY = 0;
    this.cooldownTimer = 0;
    this.sprinting = false;
    this.moving = false;
    this._lean = 0;
    this._bobTime = 0;
    this._bobOffset = 0;

    // Repair target (defense or station being repaired)
    this.repairTarget = null;
    this.isRepairing = false;
    this._wasRepairing = false;

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

    // Animation state machines — clips loaded by ModelLoader (FBX + embedded)
    this._animators = { COMBAT: null, REPAIR: null };
    const wire = (charKey, group, modelKey) => {
      const model = group.getObjectByName('model');
      if (!model) return;
      const clips = Models.getClips(modelKey);
      const embedded = Models.getAnimations(modelKey);
      const animator = new CharacterAnimator(model, clips, embedded);
      if (animator.hasAnyClip) this._animators[charKey] = animator;
    };
    wire('COMBAT', this._combatGroup, 'combatWorker');
    wire('REPAIR', this._repairGroup, 'repairWorker');
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

    const model = Models.getClone('combatWorker');
    if (model) {
      // ModelLoader normalizes scale/ground offset/facing — use as-is
      model.name = 'model';
      g.add(model);
      g.userData.hasModel = true;
    } else {
      // Fallback primitive
      const def = CHARACTERS.COMBAT;
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.5, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: def.bodyColor })
      );
      body.position.y = 1.3;
      body.castShadow = true;
      g.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xddaa77 })
      );
      head.position.y = 2.4;
      g.add(head);
    }

    // Stun flash (always added for ability feedback)
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.8 })
    );
    flash.position.set(0.55, 1.5, -0.7);
    flash.visible = false;
    flash.name = 'flash';
    g.add(flash);

    // Store base Y for bob
    g.children.forEach(c => { c.userData.baseY = c.position.y; });

    return g;
  }

  _buildRepairWorker() {
    const g = new THREE.Group();

    const model = Models.getClone('repairWorker');
    if (model) {
      // ModelLoader normalizes scale/ground offset/facing — use as-is
      model.name = 'model';
      g.add(model);
      g.userData.hasModel = true;
    } else {
      // Fallback primitive
      const def = CHARACTERS.REPAIR;
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.5, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: def.bodyColor })
      );
      body.position.y = 1.3;
      body.castShadow = true;
      g.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xddaa77 })
      );
      head.position.y = 2.4;
      g.add(head);
    }

    // Repair glow (always added for ability feedback)
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.6 })
    );
    glow.position.set(0.55, 1.5, -0.7);
    glow.visible = false;
    glow.name = 'flash';
    g.add(glow);

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
    this.velY = 0;
    this.grounded = true;
    this.group.position.y = 0;
    this._lean = 0;
    this.cooldownTimer = 0;
    this.isRepairing = false;
    this.repairTarget = null;

    return this.activeChar;
  }

  // --- Main update ---

  update(input, dt, cameraYaw = 0, aiming = false) {
    const stats = this.stats;

    // --- Movement (camera-relative, standard third-person WASD) ---
    let fwd = 0, strafe = 0;
    if (input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp')) fwd += 1;
    if (input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown')) fwd -= 1;
    if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) strafe -= 1;
    if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) strafe += 1;
    // Virtual joystick (mobile) feeds the same movement path
    if (input.touchMove) {
      fwd += input.touchMove.y;
      strafe += input.touchMove.x;
    }
    const hasInput = Math.abs(fwd) > 0.01 || Math.abs(strafe) > 0.01;

    this.sprinting = !aiming && hasInput && fwd > 0 &&
      (input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight'));
    const speedMult = aiming ? 0.55 : (this.sprinting ? 1.65 : 1);
    const maxSpeed = stats.speed * speedMult;

    // Desired velocity from input, then damp toward it — crisp,
    // frame-rate-independent accel AND decel (no floaty drift)
    const desired = new THREE.Vector3();
    if (hasInput) {
      // Camera looks along (-sin(yaw), 0, -cos(yaw)); right is (cos(yaw), 0, -sin(yaw))
      const sinY = Math.sin(cameraYaw), cosY = Math.cos(cameraYaw);
      desired.set(
        -sinY * fwd + cosY * strafe,
        0,
        -cosY * fwd - sinY * strafe
      ).normalize().multiplyScalar(maxSpeed);
    }
    const accel = this.grounded ? 12 : 4; // less air control
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, desired.x, accel, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, desired.z, accel, dt);

    const currentSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    this.moving = currentSpeed > 0.5;

    // --- Jump & gravity ---
    if (this.grounded && input.wasPressed('Space')) {
      this.velY = 11;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.velY -= 30 * dt;
    }

    this.group.position.x += this.velocity.x * dt;
    this.group.position.z += this.velocity.z * dt;
    this.group.position.y += this.velY * dt;
    if (this.group.position.y <= 0) {
      this.group.position.y = 0;
      this.velY = 0;
      this.grounded = true;
    }

    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -44, 44);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -44, 44);

    // --- Facing (model forward is -Z) ---
    let turnDiff = 0;
    if (aiming) {
      // Aim mode: lock to the camera direction, strafe like a shooter
      let diff = cameraYaw - this.rotationY;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      turnDiff = diff;
      this.rotationY += diff * (1 - Math.exp(-20 * dt));
    } else if (this.moving) {
      // Turn smoothly toward the movement direction, the short way around
      const targetRot = Math.atan2(-this.velocity.x, -this.velocity.z);
      let diff = targetRot - this.rotationY;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      turnDiff = diff;
      this.rotationY += diff * (1 - Math.exp(-14 * dt));
    }

    this.group.rotation.y = this.rotationY;

    // --- Lean into turns (subtle roll for a modern, weighty feel) ---
    const wantLean = THREE.MathUtils.clamp(
      -turnDiff * (currentSpeed / stats.speed) * 0.25, -0.1, 0.1
    );
    this._lean = THREE.MathUtils.damp(this._lean, wantLean, 10, dt);
    this.group.rotation.z = this._lean;

    // --- Walking bob (primitive fallback only — GLB models animate instead) ---
    const activeGroup = this.activeChar === 'COMBAT' ? this._combatGroup : this._repairGroup;
    if (!activeGroup.userData.hasModel) {
      if (this.moving && this.grounded) {
        this._bobTime += dt * currentSpeed * (this.sprinting ? 1.8 : 1.5);
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
    }

    // --- Partner idle bob (floating arrow) ---
    if (this._partnerMesh) {
      const arrow = this._partnerMesh.children[0];
      if (arrow) arrow.position.y = 3.5 + Math.sin(performance.now() * 0.003) * 0.3;
    }

    // --- Animation state machine (crossfades once dedicated clips exist;
    //     falls back to the baked clip with speed-matched playback) ---
    const animator = this._animators[this.activeChar];
    if (animator) {
      const moveScale = Math.max(0.8, currentSpeed / stats.speed) * 1.1;
      if (this.activeChar === 'COMBAT') {
        if (aiming) {
          animator.setState(this.moving ? 'aim_walk' : 'aim_idle',
            this.moving ? ['walk', 'run'] : ['idle'], this.moving ? moveScale * 0.8 : 0.6);
        } else if (this.sprinting && this.moving) {
          animator.setState('run', ['walk'], 1.3);
        } else if (this.moving) {
          animator.setState('walk', ['run'], moveScale);
        } else {
          animator.setState('idle', [], 0.55);
        }
      } else {
        if (this.isRepairing) {
          this._wasRepairing = true;
          animator.setState('repair_loop', ['idle'], 1);
        } else if (this._wasRepairing) {
          this._wasRepairing = false;
          animator.playOneShot('stand_up', { timeScale: 1.2 });
        } else if (this.moving) {
          animator.setState('walk', ['run'], moveScale);
        } else {
          animator.setState('idle', [], 0.55);
        }
      }
      animator.update(dt);
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
    // Punchy fire clip if one has been converted (no-op until it exists)
    const animator = this._animators[this.activeChar];
    if (animator) animator.playOneShot('fire', { timeScale: 1.6 });
    return true;
  }

  // Combat: get stun target point (fires forward based on facing)
  getStunTarget() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationY);
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

    // Repair the nearest damaged defense in range (solar panels, wind turbines, etc.)
    let nearest = null;
    let nearestDist = Infinity;
    for (const d of defenses) {
      if (!d.alive || d.health >= d.maxHealth) continue;
      const dist = this.group.position.distanceTo(d.group.position);
      if (dist <= repairRange && dist < nearestDist) {
        nearest = d;
        nearestDist = dist;
      }
    }
    if (nearest) {
      nearest.health = Math.min(nearest.maxHealth, nearest.health + repairHP);
      return { type: 'defense', target: nearest };
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
    this.velY = 0;
    this.grounded = true;
    this.sprinting = false;
    this.moving = false;
    this._lean = 0;
    this.rotationY = 0;
    this.group.rotation.y = 0;
    this.group.rotation.z = 0;
    this.cooldownTimer = 0;
    this._bobTime = 0;
    this._bobOffset = 0;
    this.activeChar = 'COMBAT';
    this._combatGroup.visible = true;
    this._repairGroup.visible = false;
    this.isRepairing = false;
    this._wasRepairing = false;
    this.repairTarget = null;
  }
}
