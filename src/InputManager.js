// Centralized input state — keyboard + mouse (with pointer lock for third-person look)
export class InputManager {
  constructor(canvas) {
    this.keys = {};
    this.pressed = {}; // single-frame key presses (cleared in endFrame)
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, down: false, clicked: false, rightDown: false };
    this.look = { dx: 0, dy: 0 };
    this.wheelDelta = 0;
    this.canvas = canvas;

    // When true (action mode), the mouse controls the camera.
    // Preferred: pointer lock (infinite rotation, hidden cursor). Pointer lock
    // MUST be requested from inside a real click event handler — browsers
    // reject requests made from the game loop.
    // Fallback: if the environment refuses pointer lock (file://, embedded
    // previews, some iframes), plain mousemove deltas drive the camera so
    // look control always works.
    this.wantsLock = false;
    this.lockFailed = false;
    this._lockTimer = null;
    this._lastClient = null;

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (!e.repeat) this.pressed[e.code] = true;
      // Prevent Tab from switching browser focus and Space from scrolling
      if (e.code === 'Tab' || (e.code === 'Space' && e.target === document.body)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isLocked) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
        return;
      }
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.ndcY = -(e.clientY / window.innerHeight) * 2 + 1;

      // Unlocked cursor deltas: drive the action camera before/without
      // pointer lock, and right-drag panning in god mode
      if (this._lastClient) {
        const dx = e.clientX - this._lastClient.x;
        const dy = e.clientY - this._lastClient.y;
        if (Math.abs(dx) < 150 && Math.abs(dy) < 150) {
          this.look.dx += dx;
          this.look.dy += dy;
        }
      }
      this._lastClient = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this.mouse.rightDown = true;
        return;
      }
      if (e.button !== 0) return;
      // In action mode, an unlocked click tries to capture the mouse first.
      // If capture keeps getting refused, stop swallowing clicks so the
      // player can still shoot/repair using the fallback look.
      if (this.wantsLock && !this.isLocked && !this.lockFailed) {
        this.requestLock();
        clearTimeout(this._lockTimer);
        this._lockTimer = setTimeout(() => {
          if (!this.isLocked) this.lockFailed = true;
        }, 400);
        return;
      }
      this.mouse.down = true;
      this.mouse.clicked = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rightDown = false;
    });
    canvas.addEventListener('wheel', (e) => {
      // Action mode: camera zoom. God mode: isometric map zoom.
      this.wheelDelta += e.deltaY;
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      // Avoid a huge fallback delta when the cursor reappears after unlock
      this._lastClient = null;
      // Releasing the lock (e.g. Esc) shouldn't leave a stale click/hold
      if (!this.isLocked) {
        this.mouse.down = false;
        this.mouse.clicked = false;
        this.mouse.rightDown = false;
      }
    });

    // Prevent context menu on right-click (right mouse = aim)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isLocked() {
    return document.pointerLockElement === this.canvas;
  }

  // Look control is live when locked, or in fallback mode (lock unavailable),
  // where plain mouse movement rotates the camera
  get lookActive() {
    return this.wantsLock && (this.isLocked || this.lockFailed);
  }

  requestLock() {
    if (this.isLocked) return;
    try {
      // unadjustedMovement = raw mouse input (no OS acceleration) where supported
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch(() => {
          // Retry without the option — some browsers reject it outright
          try {
            const p2 = this.canvas.requestPointerLock();
            if (p2 && p2.catch) p2.catch(() => {});
          } catch (_) { /* refused */ }
        });
      }
    } catch (_) {
      try {
        this.canvas.requestPointerLock();
      } catch (_) { /* refused — next click retries or fallback takes over */ }
    }
  }

  exitLock() {
    if (this.isLocked) {
      document.exitPointerLock();
    }
  }

  isKeyDown(code) {
    return !!this.keys[code];
  }

  // True only on the frame the key went down
  wasPressed(code) {
    return !!this.pressed[code];
  }

  // Call at end of frame to reset single-frame flags
  endFrame() {
    this.mouse.clicked = false;
    this.look.dx = 0;
    this.look.dy = 0;
    this.wheelDelta = 0;
    this.pressed = {};
  }
}
