// Keyboard + mouse for Aurelia Nights II. The game reads this, never the
// DOM directly, so the screenshot autopilot can drive the same interface.

export function createControls() {
  return {
    keys: new Set(),
    pressed: new Set(), // keys hit since the last step (edge-triggered)
    mouse: { x: 0, y: 0, down: false, clicked: false },
    attach(canvas) {
      window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
        if (!e.repeat) this.pressed.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
        this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      });
      window.addEventListener('keyup', (e) => {
        this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      });
      canvas.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
        this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
      });
      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      });
      window.addEventListener('mouseup', () => { this.mouse.down = false; });
    },
    down(...names) {
      return names.some((n) => this.keys.has(n));
    },
    hit(...names) {
      return names.some((n) => this.pressed.has(n));
    },
    moveX() {
      return (this.down('d', 'ArrowRight') ? 1 : 0) - (this.down('a', 'ArrowLeft') ? 1 : 0);
    },
    moveY() {
      return (this.down('s', 'ArrowDown') ? 1 : 0) - (this.down('w', 'ArrowUp') ? 1 : 0);
    },
    endStep() {
      this.pressed.clear();
      this.mouse.clicked = false;
    },
  };
}

// A fake control set the screenshot autopilot writes into, shaped exactly
// like the real one. Key state lives in `st` so it never shadows the
// `down()` method.
export function createAutoControls() {
  const c = {
    keys: new Set(),
    pressed: new Set(),
    mouse: { x: 640, y: 360, down: false, clicked: false },
    st: { up: false, down: false, left: false, right: false },
    mx: 0, my: 0,
    down(...names) {
      if (names.includes('w') || names.includes('ArrowUp')) return c.st.up;
      if (names.includes('s') || names.includes('ArrowDown')) return c.st.down;
      if (names.includes('a') || names.includes('ArrowLeft')) return c.st.left;
      if (names.includes('d') || names.includes('ArrowRight')) return c.st.right;
      return false;
    },
    hit() { return false; },
    moveX() { return c.mx; },
    moveY() { return c.my; },
    endStep() {},
  };
  return c;
}

// ---- Dealer-panel hotkeys and a tiny input helper. ----
// The black-market panel is driven by number keys; this table is the
// single source of truth the HUD footer and the engine both read, so
// the on-screen help can never drift from the real bindings.
export const DEALER_HOTKEYS = {
  buy: ['1', '2', '3', '4', '5'],
  sellAll: '6',
  run: '7',
  wash: '8',
  close: ['g', 'G', 'Escape'],
};

export const RUN_HOTKEYS = {
  nitro: ['Shift'],
  cancel: ['x', 'X'],
};

// Human-readable key labels for HUD hints (Shift reads better than
// the raw event key, and 'Spasi' beats ' ' in Indonesian hints).
export function keyLabel(key) {
  if (key === ' ') return 'Spasi';
  if (key === 'Shift') return 'Shift';
  if (key === 'Escape') return 'Esc';
  if (key === 'Enter') return 'Enter';
  return key.toUpperCase();
}

// Press a key into any control set (real or autopilot) without going
// through the DOM — the screenshot harness and the tests use this to
// drive the dealer panel deterministically.
export function pressKey(controls, key) {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (controls.pressed) controls.pressed.add(k);
  if (controls.keys) controls.keys.add(k);
}

// Tombol yang berhubungan dengan efek visual round 3: M bisu, P jeda.
// Didaftar di sini supaya panel bantuan dan HUD tidak menulis ulang.
export const FX_KEYS = {
  mute: ['m', 'M'],
  pause: ['p', 'P', 'Escape'],
  mission: ['f', 'F'],
};
