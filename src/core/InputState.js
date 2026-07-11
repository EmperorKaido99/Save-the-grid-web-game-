// Normalized input interface — the ONLY thing movement/camera code reads.
// Keyboard/mouse populates it today; a gamepad reader can populate the same
// fields later without touching MovementSystem or CameraController.

export class InputState {
  constructor() {
    // Analog move vector, camera-relative convention: x = strafe right,
    // y = forward. Length is clamped to 1 (keyboard is always 0/1 digital,
    // gamepad sticks will be analog).
    this.moveVector = { x: 0, y: 0 };
    // Per-frame look delta in "pixels" (mouse) / normalized stick units (pad)
    this.lookDelta = { x: 0, y: 0 };
    this.sprintHeld = false;
    this.aimHeld = false;
    this.fireHeld = false;
    // Single-frame edge triggers
    this.firePressed = false;
    this.jumpPressed = false;
    this.switchPressed = false;
    this.zoomDelta = 0;
  }

  // Called by the owner at the end of every frame to clear per-frame values
  endFrame() {
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    this.firePressed = false;
    this.jumpPressed = false;
    this.switchPressed = false;
    this.zoomDelta = 0;
  }
}

// Keyboard + mouse reader. Prefers pointer lock (infinite look, hidden
// cursor) — which browsers only grant from inside a real click handler.
// Falls back to plain cursor deltas plus edge-glide when the environment
// refuses the lock, so mouse look always works.
export class KeyboardMouseReader {
  constructor(state, canvas) {
    this.state = state;
    this.canvas = canvas;
    this.enabled = false; // set true while the controller should receive input
    this.lockFailed = false;
    this._keys = {};
    this._lastClient = null;
    this._lockTimer = null;
    this._edge = { x: 0, y: 0 };

    window.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      if (!e.repeat && this.enabled) {
        if (e.code === 'Space') this.state.jumpPressed = true;
        if (e.code === 'Tab' || e.code === 'KeyQ') this.state.switchPressed = true;
      }
      if (e.code === 'Tab' || (e.code === 'Space' && e.target === document.body)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => { this._keys[e.code] = false; });

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.isLocked) {
        this.state.lookDelta.x += e.movementX;
        this.state.lookDelta.y += e.movementY;
        return;
      }
      // Fallback look from cursor deltas
      if (this._lastClient) {
        const dx = e.clientX - this._lastClient.x;
        const dy = e.clientY - this._lastClient.y;
        if (Math.abs(dx) < 150 && Math.abs(dy) < 150) {
          this.state.lookDelta.x += dx;
          this.state.lookDelta.y += dy;
        }
      }
      this._lastClient = { x: e.clientX, y: e.clientY };
      // Track edge proximity for edge-glide (applied in update())
      const m = 40;
      this._edge.x = e.clientX <= m ? -1 : (e.clientX >= window.innerWidth - m ? 1 : 0);
      this._edge.y = e.clientY <= m ? -1 : (e.clientY >= window.innerHeight - m ? 1 : 0);
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 2) { this.state.aimHeld = true; return; }
      if (e.button !== 0) return;
      // Unlocked left click captures the mouse first; if the environment
      // keeps refusing the capture, stop swallowing clicks
      if (!this.isLocked && !this.lockFailed) {
        this.requestLock();
        clearTimeout(this._lockTimer);
        this._lockTimer = setTimeout(() => {
          if (!this.isLocked) this.lockFailed = true;
        }, 400);
        return;
      }
      this.state.fireHeld = true;
      this.state.firePressed = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.state.fireHeld = false;
      if (e.button === 2) this.state.aimHeld = false;
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.state.zoomDelta += e.deltaY;
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this._lastClient = null;
      if (!this.isLocked) {
        this.state.fireHeld = false;
        this.state.aimHeld = false;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isLocked() {
    return document.pointerLockElement === this.canvas;
  }

  requestLock() {
    if (this.isLocked) return;
    try {
      // unadjustedMovement = raw input (no OS acceleration) where supported
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch(() => {
          try {
            const p2 = this.canvas.requestPointerLock();
            if (p2 && p2.catch) p2.catch(() => {});
          } catch (_) { /* refused */ }
        });
      }
    } catch (_) {
      try { this.canvas.requestPointerLock(); } catch (_) { /* refused */ }
    }
  }

  exitLock() {
    if (this.isLocked) document.exitPointerLock();
  }

  // Call once per frame BEFORE the systems read the state
  update(dt) {
    const s = this.state;
    if (!this.enabled) {
      s.moveVector.x = 0; s.moveVector.y = 0;
      s.sprintHeld = false;
      return;
    }
    let x = 0, y = 0;
    if (this._keys['KeyW'] || this._keys['ArrowUp']) y += 1;
    if (this._keys['KeyS'] || this._keys['ArrowDown']) y -= 1;
    if (this._keys['KeyA'] || this._keys['ArrowLeft']) x -= 1;
    if (this._keys['KeyD'] || this._keys['ArrowRight']) x += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    s.moveVector.x = x;
    s.moveVector.y = y;
    s.sprintHeld = !!(this._keys['ShiftLeft'] || this._keys['ShiftRight']);

    // Edge-glide: without pointer lock the cursor jams at screen borders,
    // so keep feeding look delta while it's pushed against an edge
    if (!this.isLocked && (this._edge.x || this._edge.y)) {
      s.lookDelta.x += this._edge.x * 900 * dt;
      s.lookDelta.y += this._edge.y * 600 * dt;
    }
  }
}
