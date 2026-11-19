// Seeded randomness for Aurelia Nights II. One tiny generator (mulberry32)
// plus a few helpers; the city, the traffic and the screenshot scenes all
// draw from it so a seed always rebuilds the same Port Aurelia.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function intRange(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function chance(rng, p) {
  return rng() < p;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Weighted pick: entries are [value, weight]; heavier entries win more
// often. The black market uses it for street rumours and dealer stock.
export function weightedPick(rng, entries) {
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rng() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

// Fisher-Yates shuffle that never mutates the input list.
export function shuffled(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Bell-ish random in [min, max], centred — used for checkpoint jitter
// and dealer price wobble so runs never feel perfectly mechanical.
export function gauss(rng, min, max) {
  const mid = (min + max) / 2;
  const spread = (max - min) / 2;
  const v = (rng() + rng() + rng()) / 3; // 0..1, centred on 0.5
  return mid + (v - 0.5) * 2 * spread * 0.8;
}

// Acak kecil di sekitar nol untuk guncangan dan getaran visual.
// Mengembalikan nilai -amount..amount dari RNG game yang sama.
export function jitter(rng, amount) {
  return (rng() - 0.5) * 2 * amount;
}

// Acak boolean berbobot: true dengan peluang p (0..1).
export function chanceRoll(rng, p) {
  return rng() < p;
}
