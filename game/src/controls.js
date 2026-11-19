// Keyboard + mouse untuk Aurelia Nights II. Game membaca dari sini,
// tidak pernah langsung dari DOM, supaya autopilot screenshot bisa
// mengemudikan antarmuka yang sama.

// Normalisasi satu tombol: huruf jadi huruf kecil, tombol khusus
// tetap apa adanya.
function normalKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function createControls() {
  return {
    keys: new Set(),
    pressed: new Set(), // tombol yang ditekan sejak step terakhir (edge-triggered)
    mouse: { x: 0, y: 0, down: false, clicked: false },
    attach(canvas) {
      window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
        if (!e.repeat) this.pressed.add(normalKey(e.key));
        this.keys.add(normalKey(e.key));
      });
      window.addEventListener('keyup', (e) => {
        this.keys.delete(normalKey(e.key));
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

// Set kontrol palsu yang ditulis autopilot screenshot, dibentuk persis
// seperti yang asli. State tombol tinggal di `st` supaya tidak
// membayangi method `down()`.
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

// ---- Hotkey panel dealer dan helper input kecil. ----
// Panel pasar gelap digerakkan tombol angka; tabel ini adalah satu
// sumber kebenaran yang dibaca footer HUD dan engine, supaya bantuan
// di layar tidak pernah meleset dari binding aslinya.
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

// Label tombol yang ramah dibaca untuk petunjuk HUD (Shift lebih enak
// dibaca daripada tombol mentah, dan 'Spasi' mengalahkan ' ' dalam
// petunjuk berbahasa Indonesia).
export function keyLabel(key) {
  if (key === ' ') return 'Spasi';
  if (key === 'Shift') return 'Shift';
  if (key === 'Escape') return 'Esc';
  if (key === 'Enter') return 'Enter';
  return key.toUpperCase();
}

// Tekan satu tombol ke set kontrol apa pun (asli atau autopilot)
// tanpa lewat DOM — harness screenshot dan tes memakai ini untuk
// menggerakkan panel dealer secara deterministik.
export function pressKey(controls, key) {
  const k = normalKey(key);
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
