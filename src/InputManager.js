// Centralized input state — keyboard + mouse
export class InputManager {
  constructor(canvas) {
    this.keys = {};
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, down: false, clicked: false };
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.clicked = true;
      }
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isKeyDown(code) {
    return !!this.keys[code];
  }

  // Call at end of frame to reset single-frame flags
  endFrame() {
    this.mouse.clicked = false;
  }
}
