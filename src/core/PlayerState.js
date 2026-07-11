// Player simulation state — lives in /core so ANY system (camera, enemies
// targeting the player, UI, animation) can read it without importing
// movement or render code. Plain math objects only; no three.js, no Rapier.

// Per-character tuning. Both playable workers share the same controller;
// only these numbers differ.
export const CHARACTER_CONFIGS = {
  COMBAT: {
    id: 'COMBAT',
    name: 'Combat Worker',
    runSpeed: 7.0,        // full stick / WASD speed (u/s)
    sprintMultiplier: 1.6,
    aimSpeedMultiplier: 0.5,
    accelLambda: 10,      // exp-damp rate toward desired velocity
    decelLambda: 14,      // stopping is a touch quicker than starting
    airControlLambda: 3,
    jumpSpeed: 8.5,
    turnLambda: 14,       // facing chase rate (rad-domain damping)
    aimTurnLambda: 22,    // snappier facing while aiming
    canAim: true,         // stun gun aim mode
  },
  REPAIR: {
    id: 'REPAIR',
    name: 'Repair Worker',
    runSpeed: 6.0,
    sprintMultiplier: 1.6,
    aimSpeedMultiplier: 0.55,
    accelLambda: 9,
    decelLambda: 13,
    airControlLambda: 3,
    jumpSpeed: 8.5,
    turnLambda: 13,
    aimTurnLambda: 20,
    canAim: false,        // wrench, not a gun
  },
};

// Animation hook states. The movement state machine emits transitions
// between these; an animation-blending layer keys off the events without
// movement code knowing it exists.
export const Locomotion = { IDLE: 'idle', WALK: 'walk', RUN: 'run', SPRINT: 'sprint' };
export const AirState = { GROUNDED: 'grounded', AIRBORNE: 'airborne' };

export class PlayerState {
  constructor(characterId = 'COMBAT') {
    this.characterId = characterId;

    // Simulation state (written by MovementSystem, read by everyone)
    this.position = { x: 0, y: 0, z: 0 };  // capsule FEET position
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;               // facing angle (radians, model forward = -Z)
    this.grounded = true;
    this.groundNormal = { x: 0, y: 1, z: 0 };
    this.speed = 0;             // horizontal speed, u/s

    // Ability/aim state
    this.aiming = false;
    this.sprinting = false;

    // Animation hook state machine
    this.locomotion = Locomotion.IDLE;
    this.airState = AirState.GROUNDED;

    this._listeners = {};
  }

  get config() {
    return CHARACTER_CONFIGS[this.characterId];
  }

  // --- Event emitter for animation / effects hooks ---
  // Events: 'locomotion' (from, to) | 'air' (from, to) | 'landed' (fallSpeed)
  //         'aim-enter' | 'aim-exit' | 'fire' | 'character' (from, to)
  on(event, cb) {
    (this._listeners[event] = this._listeners[event] || []).push(cb);
    return this;
  }

  emit(event, ...args) {
    const l = this._listeners[event];
    if (l) for (const cb of l) cb(...args);
  }

  setLocomotion(next) {
    if (next === this.locomotion) return;
    const prev = this.locomotion;
    this.locomotion = next;
    this.emit('locomotion', prev, next);
  }

  setAirState(next, fallSpeed = 0) {
    if (next === this.airState) return;
    const prev = this.airState;
    this.airState = next;
    this.emit('air', prev, next);
    if (next === AirState.GROUNDED) this.emit('landed', fallSpeed);
  }

  setAiming(aiming) {
    if (aiming === this.aiming) return;
    this.aiming = aiming;
    this.emit(aiming ? 'aim-enter' : 'aim-exit');
  }

  setCharacter(id) {
    if (id === this.characterId || !CHARACTER_CONFIGS[id]) return;
    const prev = this.characterId;
    this.characterId = id;
    this.emit('character', prev, id);
  }
}
