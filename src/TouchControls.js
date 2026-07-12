// Mobile touch controls — virtual joystick (move), drag-to-look zone, and
// action buttons. Feeds the same InputManager the keyboard/mouse uses, so
// Player/Game/camera logic doesn't know or care which device is driving.
// Only activates on touch-capable devices; creates no DOM otherwise.

const JOY_RADIUS = 55;      // px travel of the joystick knob
const LOOK_SENS = 2.2;      // touch look feels slower than mouse — boost it

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.enabled = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!this.enabled) return;

    // No pointer lock on touch — run the fallback control path and never
    // swallow taps waiting for a capture that can't happen
    input.lockFailed = true;
    input.touchMove = { x: 0, y: 0 };

    this._joyTouchId = null;
    this._lookTouchId = null;
    this._joyCenter = { x: 0, y: 0 };
    this._lookLast = { x: 0, y: 0 };
    this._aimOn = false;
    this._sprintOn = false;

    this._build();
    this.hide();
  }

  _build() {
    const root = document.createElement('div');
    root.className = 'touch-controls';
    root.innerHTML = `
      <div class="touch-zone" id="tc-move-zone"></div>
      <div class="touch-zone" id="tc-look-zone"></div>
      <div id="tc-joy-base"><div id="tc-joy-knob"></div></div>
      <button class="tc-btn tc-fire" id="tc-fire">&#9889;</button>
      <button class="tc-btn" id="tc-aim">&#127919;</button>
      <button class="tc-btn" id="tc-jump">&#11014;</button>
      <button class="tc-btn" id="tc-sprint">&#127939;</button>
      <button class="tc-btn tc-switch" id="tc-switch">&#8644;</button>
    `;
    document.body.appendChild(root);
    this.root = root;

    this.moveZone = root.querySelector('#tc-move-zone');
    this.lookZone = root.querySelector('#tc-look-zone');
    this.joyBase = root.querySelector('#tc-joy-base');
    this.joyKnob = root.querySelector('#tc-joy-knob');

    // --- Floating joystick: appears where the thumb lands ---
    this.moveZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this._joyTouchId !== null) return;
      const t = e.changedTouches[0];
      this._joyTouchId = t.identifier;
      this._joyCenter = { x: t.clientX, y: t.clientY };
      this.joyBase.style.display = 'block';
      this.joyBase.style.left = `${t.clientX}px`;
      this.joyBase.style.top = `${t.clientY}px`;
      this._setKnob(0, 0);
    }, { passive: false });

    this.moveZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joyTouchId) continue;
        let dx = t.clientX - this._joyCenter.x;
        let dy = t.clientY - this._joyCenter.y;
        const len = Math.hypot(dx, dy);
        if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
        this._setKnob(dx, dy);
        this.input.touchMove.x = dx / JOY_RADIUS;
        this.input.touchMove.y = -dy / JOY_RADIUS; // screen-up = forward
      }
    }, { passive: false });

    const joyEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joyTouchId) continue;
        this._joyTouchId = null;
        this.input.touchMove.x = 0;
        this.input.touchMove.y = 0;
        this.joyBase.style.display = 'none';
      }
    };
    this.moveZone.addEventListener('touchend', joyEnd);
    this.moveZone.addEventListener('touchcancel', joyEnd);

    // --- Look zone: drag to orbit the camera ---
    this.lookZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this._lookTouchId !== null) return;
      const t = e.changedTouches[0];
      this._lookTouchId = t.identifier;
      this._lookLast = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    this.lookZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookTouchId) continue;
        this.input.look.dx += (t.clientX - this._lookLast.x) * LOOK_SENS;
        this.input.look.dy += (t.clientY - this._lookLast.y) * LOOK_SENS;
        this._lookLast = { x: t.clientX, y: t.clientY };
      }
    }, { passive: false });

    const lookEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._lookTouchId) this._lookTouchId = null;
      }
    };
    this.lookZone.addEventListener('touchend', lookEnd);
    this.lookZone.addEventListener('touchcancel', lookEnd);

    // --- Buttons ---
    const press = (el, onDown, onUp) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); el.classList.add('active'); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); if (onUp) onUp(); el.classList.remove('active'); }, { passive: false });
      el.addEventListener('touchcancel', () => { if (onUp) onUp(); el.classList.remove('active'); });
    };

    // FIRE: hold to fire / repair (same as holding left mouse)
    press(root.querySelector('#tc-fire'),
      () => { this.input.mouse.down = true; this.input.mouse.clicked = true; },
      () => { this.input.mouse.down = false; });

    // AIM: toggle over-the-shoulder aim (same as holding right mouse)
    const aimBtn = root.querySelector('#tc-aim');
    aimBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._aimOn = !this._aimOn;
      this.input.mouse.rightDown = this._aimOn;
      aimBtn.classList.toggle('active', this._aimOn);
    }, { passive: false });

    // JUMP
    press(root.querySelector('#tc-jump'),
      () => { this.input.keys['Space'] = true; if (this.input.pressed) this.input.pressed['Space'] = true; },
      () => { this.input.keys['Space'] = false; });

    // SPRINT: toggle
    const sprintBtn = root.querySelector('#tc-sprint');
    sprintBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._sprintOn = !this._sprintOn;
      this.input.keys['ShiftLeft'] = this._sprintOn;
      sprintBtn.classList.toggle('active', this._sprintOn);
    }, { passive: false });

    // SWITCH character (Tab equivalent)
    press(root.querySelector('#tc-switch'),
      () => { this.input.keys['Tab'] = true; },
      () => { this.input.keys['Tab'] = false; });
  }

  _setKnob(dx, dy) {
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  show() {
    if (this.enabled && this.root) this.root.style.display = 'block';
  }

  hide() {
    if (!this.enabled || !this.root) return;
    this.root.style.display = 'none';
    // Release any held state so nothing sticks between modes
    this._joyTouchId = null;
    this._lookTouchId = null;
    this.input.touchMove.x = 0;
    this.input.touchMove.y = 0;
    this.input.mouse.down = false;
    this.input.mouse.rightDown = false;
    this.input.keys['Space'] = false;
    this.input.keys['ShiftLeft'] = false;
    this.input.keys['Tab'] = false;
    this._aimOn = false;
    this._sprintOn = false;
    this.joyBase.style.display = 'none';
  }
}
