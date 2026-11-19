// Acak seeded untuk Aurelia Nights II. Satu generator kecil
// (mulberry32) plus segenggam helper; kota, traffic, dan scene
// screenshot semuanya mengambil dari sini, jadi satu seed selalu
// membangun kembali Port Aurelia yang sama.

export function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// Satu entri acak dari daftar.
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// Bilangan acak di [min, max).
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

// Bilangan bulat acak di [min, max] (inklusif).
export function intRange(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Benar dengan peluang p.
export function chance(rng, p) {
  return rng() < p;
}

// Jepit nilai ke dalam [lo, hi].
export function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// Interpolasi linear a → b sejauh t.
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Jarak dua titik.
export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

// Sudut dari titik pertama ke titik kedua.
export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

// Bungkus sudut ke (-π, π].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Pilih berbobot: entri berupa [nilai, bobot]; bobot lebih berat
// menang lebih sering. Pasar gelap memakainya untuk kabar jalanan
// dan stok dealer.
export function weightedPick(rng, entries) {
  let total = 0;
  for (const entry of entries) total += entry[1];
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry[1];
    if (roll <= 0) return entry[0];
  }
  return entries[entries.length - 1][0];
}

// Acak Fisher-Yates yang tidak pernah mengubah daftar masukan.
export function shuffled(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// Acak mirip lonceng di [min, max], terpusat di tengah — dipakai
// jitter checkpoint dan goyangan harga dealer supaya run tidak
// pernah terasa sempurna mekanis.
export function gauss(rng, min, max) {
  const mid = (min + max) / 2;
  const half = (max - min) / 2;
  const centred = (rng() + rng() + rng()) / 3; // 0..1, terpusat di 0.5
  return mid + (centred - 0.5) * 2 * half * 0.8;
}

// Goyangan kecil di sekitar nol untuk guncangan dan getaran visual.
// Mengembalikan nilai -amount..amount dari RNG game yang sama.
export function jitter(rng, amount) {
  return (rng() - 0.5) * 2 * amount;
}

// Acak boolean berbobot: true dengan peluang p (0..1).
export function chanceRoll(rng, p) {
  return rng() < p;
}
