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
