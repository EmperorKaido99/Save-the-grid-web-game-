import { Locomotion, AirState } from '../core/PlayerState.js';

// Physics-driven third-person movement on a Rapier kinematic character
// controller. The capsule is moved with shape-casts (no tunneling through
// thin geometry at speed), slopes are climbed up to maxSlopeClimbAngle and
// slid/blocked beyond it, and grounding comes from the controller's
// shape-cast plus an explicit downward ray for the ground normal.
//
// This system OWNS the write-side of PlayerState (position, velocity, yaw,
// grounded, locomotion/air state machine). It never touches rendering.

const DEG = Math.PI / 180;

export const MOVEMENT_DEFAULTS = {
  capsuleRadius: 0.4,
  capsuleHalfHeight: 0.5,   // cylinder part; total height = 2*(hh + r) = 1.8
  gravity: -24,             // slightly heavier than earth for grounded feel
  maxSlopeClimbAngle: 42 * DEG,  // walk up to this
  minSlopeSlideAngle: 48 * DEG,  // slide down beyond this
  autostepHeight: 0.35,     // stairs / curbs
  autostepMinWidth: 0.2,
  snapToGroundDistance: 0.4,
  controllerOffset: 0.05,
  coyoteTime: 0.12,         // jump grace after walking off a ledge
};

// Frame-rate independent exponential damping
function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export class MovementSystem {
  // rapier: the RAPIER module (already init()ed); world: a RAPIER.World the
  // owner built its level colliders into.
  constructor(rapier, world, playerState, options = {}) {
    this.RAPIER = rapier;
    this.world = world;
    this.player = playerState;
    this.opts = { ...MOVEMENT_DEFAULTS, ...options };

    const o = this.opts;
    const spawn = options.spawn || { x: 0, y: 0, z: 0 };
    this._capsuleCenterY = o.capsuleHalfHeight + o.capsuleRadius;

    this.body = world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(spawn.x, spawn.y + this._capsuleCenterY, spawn.z)
    );
    this.collider = world.createCollider(
      rapier.ColliderDesc.capsule(o.capsuleHalfHeight, o.capsuleRadius),
      this.body
    );

    this.controller = world.createCharacterController(o.controllerOffset);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle(o.maxSlopeClimbAngle);
    this.controller.setMinSlopeSlideAngle(o.minSlopeSlideAngle);
    this.controller.enableAutostep(o.autostepHeight, o.autostepMinWidth, true);
    this.controller.enableSnapToGround(o.snapToGroundDistance);
    this.controller.setApplyImpulsesToDynamicBodies(false);

    // Working state
    this.velocity = { x: 0, y: 0, z: 0 };
    this._grounded = true;
    this._coyote = 0;
    this._writeBack(spawn.x, spawn.y + this._capsuleCenterY, spawn.z);
  }

  // Teleport (spawn, character swap, reset). y is FEET height.
  setPosition(x, y, z) {
    this.body.setNextKinematicTranslation({ x, y: y + this._capsuleCenterY, z });
    this.body.setTranslation({ x, y: y + this._capsuleCenterY, z }, true);
    this.velocity.x = 0; this.velocity.y = 0; this.velocity.z = 0;
    this._writeBack(x, y + this._capsuleCenterY, z);
  }

  // Camera-collision helper for the render layer: cast a ray through the
  // physics world, ignoring the player capsule. Returns hit distance or null.
  castRay(origin, dir, maxDist) {
    const ray = new this.RAPIER.Ray(origin, dir);
    const hit = this.world.castRay(
      ray, maxDist, true, undefined, undefined, this.collider, this.body
    );
    if (!hit) return null;
    return hit.toi !== undefined ? hit.toi : hit.timeOfImpact;
  }

  // input: InputState (normalized), cameraYaw: horizontal camera direction.
  // The owner steps the Rapier world once per frame AFTER all systems.
  update(input, dt, cameraYaw) {
    const p = this.player;
    const cfg = p.config;
    const o = this.opts;

    // --- Aim state (stun-gun soft-ADS; repair worker has no aim mode) ---
    p.setAiming(cfg.canAim && input.aimHeld);

    // --- Desired horizontal velocity, camera-relative ---
    const mv = input.moveVector;
    const hasInput = mv.x !== 0 || mv.y !== 0;
    p.sprinting = !p.aiming && input.sprintHeld && mv.y > 0;
    const speedMult = p.aiming ? cfg.aimSpeedMultiplier
      : (p.sprinting ? cfg.sprintMultiplier : 1);
    const maxSpeed = cfg.runSpeed * speedMult;

    // Camera forward is (-sin(yaw), 0, -cos(yaw)); right is (cos(yaw), 0, -sin(yaw))
    const sinY = Math.sin(cameraYaw), cosY = Math.cos(cameraYaw);
    const desiredX = (-sinY * mv.y + cosY * mv.x) * maxSpeed;
    const desiredZ = (-cosY * mv.y - sinY * mv.x) * maxSpeed;

    // Acceleration/deceleration ramps — weighty but responsive
    const lambda = !this._grounded ? cfg.airControlLambda
      : (hasInput ? cfg.accelLambda : cfg.decelLambda);
    this.velocity.x = damp(this.velocity.x, desiredX, lambda, dt);
    this.velocity.z = damp(this.velocity.z, desiredZ, lambda, dt);

    // --- Vertical: gravity, jump (with coyote time) ---
    this._coyote = this._grounded ? o.coyoteTime : Math.max(0, this._coyote - dt);
    if (input.jumpPressed && this._coyote > 0) {
      this.velocity.y = cfg.jumpSpeed;
      this._coyote = 0;
      this._grounded = false;
    }
    if (!this._grounded) {
      this.velocity.y += o.gravity * dt;
    } else if (this.velocity.y < 0) {
      this.velocity.y = 0;
    }

    // --- Collide-and-slide through Rapier ---
    const move = {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt + (this._grounded ? -0.05 : 0), // keep contact
      z: this.velocity.z * dt,
    };
    this.controller.computeColliderMovement(this.collider, move);
    const corrected = this.controller.computedMovement();
    const wasGrounded = this._grounded;
    const fallSpeed = this.velocity.y;
    this._grounded = this.controller.computedGrounded();

    const t = this.body.translation();
    const nx = t.x + corrected.x, ny = t.y + corrected.y, nz = t.z + corrected.z;
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });

    // Ceiling / floor contact kills vertical velocity so it doesn't build up
    if (this._grounded && this.velocity.y < 0) this.velocity.y = 0;
    if (!this._grounded && this.velocity.y > 0 &&
        corrected.y < move.y - 1e-4) {
      this.velocity.y = 0; // bonked a ceiling
    }

    // Effective horizontal velocity after collision (walls stop you)
    if (dt > 0) {
      this.velocity.x = corrected.x / dt;
      this.velocity.z = corrected.z / dt;
      if (wasGrounded || this._grounded) {
        // vertical handled separately; don't let slope correction leak in
      } else {
        this.velocity.y = corrected.y / dt;
      }
    }

    // --- Ground normal via explicit downward ray (slope info) ---
    const down = this.castRay(
      { x: nx, y: ny, z: nz }, { x: 0, y: -1, z: 0 },
      this._capsuleCenterY + o.snapToGroundDistance + 0.1
    );
    if (down !== null) {
      // castRay gives distance only; refine with castRayAndGetNormal
      const ray = new this.RAPIER.Ray({ x: nx, y: ny, z: nz }, { x: 0, y: -1, z: 0 });
      const hit = this.world.castRayAndGetNormal(
        ray, this._capsuleCenterY + o.snapToGroundDistance + 0.1, true,
        undefined, undefined, this.collider, this.body
      );
      if (hit && hit.normal) p.groundNormal = { ...hit.normal };
    }

    // --- Facing: toward movement, or camera-locked while aiming ---
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (p.aiming) {
      p.yaw = this._turnToward(p.yaw, cameraYaw, cfg.aimTurnLambda, dt);
    } else if (speed > 0.5) {
      const target = Math.atan2(-this.velocity.x, -this.velocity.z);
      p.yaw = this._turnToward(p.yaw, target, cfg.turnLambda, dt);
    }

    // --- Write back to core state ---
    this._writeBack(nx, ny, nz);
    p.speed = speed;

    // --- State machine for animation hooks ---
    p.setAirState(this._grounded ? AirState.GROUNDED : AirState.AIRBORNE,
      wasGrounded === this._grounded ? 0 : Math.abs(Math.min(0, fallSpeed)));
    if (speed < 0.4) p.setLocomotion(Locomotion.IDLE);
    else if (p.sprinting && speed > cfg.runSpeed * 1.1) p.setLocomotion(Locomotion.SPRINT);
    else if (speed > cfg.runSpeed * 0.55) p.setLocomotion(Locomotion.RUN);
    else p.setLocomotion(Locomotion.WALK);

    // Fire event (stun gun / wrench) — systems listening decide what it does
    if (input.firePressed) p.emit('fire', p.characterId);
  }

  _turnToward(current, target, lambda, dt) {
    let diff = target - current;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // short way around
    return current + diff * (1 - Math.exp(-lambda * dt));
  }

  _writeBack(cx, cy, cz) {
    const p = this.player;
    p.position.x = cx;
    p.position.y = cy - this._capsuleCenterY; // feet
    p.position.z = cz;
    p.velocity.x = this.velocity.x;
    p.velocity.y = this.velocity.y;
    p.velocity.z = this.velocity.z;
    p.grounded = this._grounded;
  }
}
