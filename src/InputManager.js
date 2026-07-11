// Centralized input state — keyboard + mouse (with pointer lock for third-person look)
export class InputManager {
  constructor(canvas) {
    this.keys = {};
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, down: false, clicked: false };
    this.look = { dx: 0, dy: 0 };
    this.wheelDelta = 0;
    this.canvas = canvas;

    // When true (action mode), clicking the canvas captures the mouse.
    // Pointer lock MUST be requested from inside a real click event handler —
    // browsers reject requests made from the game loop.
    this.wantsLock = false;
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      // Prevent Tab from switching browser focus
      if (e.code === 'Tab') e.preventDefault();
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
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      // In action mode, an unlocked click captures the mouse instead of firing
      if (this.wantsLock && !this.isLocked) {
        this.requestLock();
        return;
      }
      this.mouse.down = true;
      this.mouse.clicked = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('wheel', (e) => {
      if (this.wantsLock) {
        this.wheelDelta += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      // Releasing the lock (e.g. Esc) shouldn't leave a stale click/hold
      if (!this.isLocked) {
        this.mouse.down = false;
        this.mouse.clicked = false;
      }
      if (this.onLockChange) this.onLockChange(this.isLocked);
    });
    document.addEventListener('pointerlockerror', () => {
      // Lock refused (browser policy) — nothing to do, next click retries
    });

    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isLocked() {
    return document.pointerLockElement === this.canvas;
  }

  requestLock() {
    if (this.isLocked) return;
    try {
      const p = this.canvas.requestPointerLock();
      // Some browsers return a promise that rejects if the gesture is stale
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* refused — next click retries */ }
  }

  exitLock() {
    if (this.isLocked) {
      document.exitPointerLock();
    }
  }

  isKeyDown(code) {
    return !!this.keys[code];
  }

  // Call at end of frame to reset single-frame flags
  endFrame() {
    this.mouse.clicked = false;
    this.look.dx = 0;
    this.look.dy = 0;
    this.wheelDelta = 0;
  }
}
