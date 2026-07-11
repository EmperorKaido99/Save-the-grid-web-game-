# Save the Grid — Project Notes

Browser tower-defense / third-person hybrid built on Three.js (no bundler —
plain ES modules + import maps, dependencies pinned via esm.sh). Serve the
repo root with any static server (`python3 -m http.server`) and open
`index.html` (full game) or `controller-test.html` (controller sandbox).

## Architecture rules

Code is split by responsibility; keep new code in the right layer:

- **`src/core/`** — engine-agnostic game state and input. No Three.js
  rendering objects, no Rapier handles. Movement state (position, velocity,
  aim state, state machine) lives here in `PlayerState` so any system —
  enemies targeting the player, UI, animation — can read it without
  importing movement or render code. `InputState` is the normalized input
  interface `{moveVector, lookDelta, sprintHeld, aimHeld, fireHeld, …}`;
  keyboard/mouse populates it today (`KeyboardMouseReader`), a gamepad
  reader can populate the same fields later without touching movement or
  camera logic.
- **`src/systems/`** — simulation logic. `MovementSystem` drives a Rapier
  kinematic capsule (collide-and-slide shape-casts, slope limits, autostep,
  ground snap, coyote-time jump) and is the only writer of `PlayerState`.
- **`src/render/`** — presentation. `CameraController` is the third-person
  spring-arm rig (collision-aware arm, separate position/rotation smoothing,
  shoulder offset, dynamic FOV, decoupled `shake(intensity, duration)` API).
  It reads player state; it never writes it. Physics access is injected as
  a `castRay` callback so the render layer has no Rapier dependency.
- **`src/test/`** — standalone sandboxes. `sandbox.js` runs the controller
  against a bare scene (ground, walls, ramps at 20°/60°, stairs) with zero
  dependency on turrets/enemies/waves.
- **`src/` (flat files)** — the current shipped game loop (Game.js,
  Player.js, …). The controller module above is built standalone first and
  will replace the movement/camera code in these files when wired in.

## Controller sandbox

`controller-test.html` — WASD move (camera-relative), mouse look (pointer
lock preferred, cursor-delta + edge-glide fallback when the environment
refuses the lock), Shift sprint (FOV kick), Space jump, right-click aim
(over-the-shoulder framing, FOV focus — Combat Worker only), left-click
fire (camera shake via the decoupled hook), Tab/Q switch between the two
workers, wheel zoom, R reset. The HUD shows the live animation-hook states
(`idle/walk/run/sprint`, `grounded/airborne`, aim) and recent state-machine
events.

## Animation hook points

`PlayerState` emits: `locomotion(from, to)`, `air(from, to)`,
`landed(fallSpeed)`, `aim-enter`, `aim-exit`, `fire(characterId)`,
`character(from, to)`. An animation-blending layer should key off these
events/states only — don't reach into MovementSystem internals.

## Open design questions

- Mobile/touch input (virtual sticks?) — not yet designed; input layer is
  ready for another reader implementation.
- Sprint stamina/cooldown — hook exists (`sprinting` state), tuning TBD.
- Gamepad reader — populate `InputState` from the Gamepad API.

## Verifying changes

Automated feel/behavior checks run headless with Playwright against a local
static server (see session scratchpad scripts). Cover both pointer-lock and
lock-refused environments when touching input or camera code.
