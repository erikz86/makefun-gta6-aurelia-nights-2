// Visual FX Port Aurelia — pencahayaan day-night, partikel, dan efek
// kendaraan. File ini ditulis ulang round 4b sebagai mesin efek berbasis
// tabel: fase hari, perilaku partikel, tahap step, dan lapisan gambar
// semuanya dideklarasikan sebagai data, lalu satu pelaksana generik yang
// menjalankan tabel itu. Tujuannya: menambah efek baru tinggal menambah
// satu baris tabel, bukan satu cabang if lagi — dan logika yang sama
// tidak tersebar di lima tempat berbeda.
//
// Asal mula modul ini: keluhan paling keras soal game ini — malamnya
// gelap merata tanpa suasana, polisi tidak terlihat dari jauh, dan mobil
// melaju tanpa jejak. Semua yang digambar di sini dihitung dari state
// game yang sudah ada (langit, cuaca, mobil, peluru). Tidak ada aset
// baru, tidak ada gambar luar, hanya kanvas 2D dan matematika.
//
// Dipakai engine: createVisuals() sekali di createGame, stepVisuals()
// tiap stepWorld, drawWorldFx() tepat setelah drawWorld, lalu
// drawLightOverlay() sebelum HUD digambar.

import { daylight, isNight, weatherNow } from './sky.js';

// ------------------------------------------------------------------
// Fase cahaya: tabel jam, bukan rantai if.
//
// Tiap baris: [jamMulai, namaFase]. Jam 0..24 dicari dari belakang:
// baris terakhir yang jamMulainya <= jam sekarang adalah fasenya.
// Badai di malam hari menimpa semuanya dengan stormDark — dicek dulu
// sebelum tabel, karena itu pengecuali cuaca, bukan soal jam.
// ------------------------------------------------------------------
const DAY_PHASE_TABLE = [
  [0, 'deepNight'],
  [4.5, 'lateNight'],
  [6, 'dawn'],
  [8, 'morning'],
  [11, 'noon'],
  [16, 'afternoon'],
  [17.5, 'dusk'],
  [19.5, 'lateNight'],
  [22, 'deepNight'],
];

const NIGHT_STORM_PHASE = 'stormDark';

// Palet suasana per fase hari. Tiap entri: warna tint layar, seberapa
// pekat tint itu, warna hangat untuk fajar/senja, dan warna kabut.
export const LIGHT_PHASES = {
  deepNight: { tint: '#0a1030', strength: 0.42, warm: '#1b2a6b', haze: '#0d1533' },
  lateNight: { tint: '#101736', strength: 0.34, warm: '#27336e', haze: '#121a3a' },
  dawn: { tint: '#3a2a55', strength: 0.22, warm: '#ff9a3c', haze: '#4a3560' },
  morning: { tint: '#7fa8d8', strength: 0.08, warm: '#ffd27a', haze: '#a8c4e0' },
  noon: { tint: '#bcd6f5', strength: 0.04, warm: '#fff3c4', haze: '#cfe0f2' },
  afternoon: { tint: '#e8c98f', strength: 0.07, warm: '#ffb347', haze: '#e6cf9e' },
  dusk: { tint: '#4a2350', strength: 0.26, warm: '#ff6b35', haze: '#5a2d55' },
  stormDark: { tint: '#05070f', strength: 0.5, warm: '#2a3a6b', haze: '#0a0e22' },
};

// Warna partikel per sumber, supaya asap knalpot tidak tertukar dengan
// asap kebakaran dan percikan tembakan tidak tertukar dengan debu jalan.
export const PARTICLE_COLOURS = {
  spark: ['#ffd76a', '#ffb347', '#fff3c4', '#ff8c42'],
  smoke: ['#5a5a5a', '#7a7a7a', '#3d3d3d', '#9a9a9a'],
  dust: ['#c9b18a', '#b39b6e', '#d8c49a'],
  rainSplash: ['#a8d8ff', '#7fb8e8', '#cfe8ff'],
  fire: ['#ff6b35', '#f7b731', '#e84118', '#ffd32a'],
  bloodlessHit: ['#f1c40f', '#e67e22'],
};

// Batas praktis supaya efek tidak pernah menumpuk sampai memperlambat
// frame di mesin kentang: partikel dan bekas ban dibuang yang tertua.
export const FX_LIMITS = {
  particles: 420,
  skids: 160,
  flashes: 24,
  floats: 12,
  rainDrops: 90,
};

// Nama fase yang tampil di HUD, dan nama cuaca — dipisah dari LIGHT_PHASES
// supaya menambah bahasa atau mengganti label tidak menyentuh palet.
const PHASE_LABELS = {
  deepNight: 'TENGAH MALAM',
  lateNight: 'MALAM',
  dawn: 'FAJAR',
  morning: 'PAGI',
  noon: 'SIANG',
  afternoon: 'SORE',
  dusk: 'SENJA',
  stormDark: 'BADAI MALAM',
};
const WEATHER_LABELS = { clear: 'CERAH', rain: 'HUJAN', storm: 'BADAI', fog: 'KABUT' };

export function createVisuals() {
  return {
    particles: [],
    skids: [],
    flashes: [],
    floats: [],
    rainDrops: [],
    shake: 0,
    shakeX: 0,
    shakeY: 0,
    strobe: 0,
    prevBullets: 0,
    prevCarHealth: new Map(),
    prevMissionIndex: 0,
    splashTimer: 0,
    smokeTimer: 0,
    lightningSeen: 0,
    dustTimer: 0,
    time: 0,
  };
}

function clamp01(v) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// Acak 0..1 dari RNG game bila ada, Math.random sebagai cadangan
// untuk shot statis.
function rand01(game) {
  if (game && game.rng) return game.rng();
  return Math.random();
}

function pickFrom(game, list) {
  return list[Math.floor(rand01(game) * list.length) % list.length];
}

// Fase cahaya dari jam dan cuaca. Jam diambil dari sky.clock supaya
// transisi fajar dan senja mengikuti siklus yang sama dengan gameplay.
export function lightPhaseFor(sky) {
  const h = ((sky.clock / 60) % 24 + 24) % 24;
  const weather = sky.weather || 'clear';
  if (weather === 'storm' && (h >= 19 || h < 6)) return NIGHT_STORM_PHASE;
  let phase = DAY_PHASE_TABLE[0][1];
  for (const [from, name] of DAY_PHASE_TABLE) {
    if (h >= from) phase = name;
  }
  return phase;
}

// Palet lengkap untuk satu frame: tint, kekuatan, warna hangat, kabut,
// plus seberapa terang siang itu (0..1) untuk mengunci efek lampu.
export function lightPaletteFor(sky) {
  const phase = lightPhaseFor(sky);
  const base = LIGHT_PHASES[phase];
  const day = daylight(sky);
  const night = isNight(sky);
  const weather = weatherNow(sky);
  const lampGlow = night ? 1 : clamp01((0.45 - day) * 2.2);
  // Sorot lampu mobil hanya berarti saat gelap atau berkabut.
  const headlightNeed = night ? 1 : sky.weather === 'fog' ? 0.7 : clamp01((0.5 - day) * 1.6);
  return {
    phase,
    tint: base.tint,
    strength: base.strength,
    warm: base.warm,
    haze: base.haze,
    daylight: day,
    night,
    weatherKind: sky.weather || 'clear',
    grip: weather.grip,
    sight: weather.sight,
    lampGlow,
    headlightNeed,
  };
}

// Warna strobo polisi: merah dan biru bergantian dua kali per detik.
// Fase diambil dari jam game supaya semua mobil polisi berkedip serempak,
// seperti iring-iringan sungguhan, bukan masing-masing acak.
export function policeStrobeColour(game, carId) {
  const phase = Math.floor(game.time * 4 + (carId % 2) * 0.5) % 2;
  return phase === 0 ? '#ff2d2d' : '#2d7dff';
}

export function policeStrobeOn(game) {
  return Math.floor(game.time * 4) % 2 === 0;
}

// ------------------------------------------------------------------
// Spawner partikel: satu emit generik + spesifikasi per jenis.
//
// Tiap jenis partikel didefinisikan sebagai fungsi yang, diberi game
// dan posisi, mengembalikan satu objek partikel lengkap. Wrapper
// spawn* di bawah hanya mengulang emit sebanyak yang diminta (dengan
// batas jumlah) lalu memangkas antrean. Menambah jenis partikel baru
// berarti menambah satu entri di PARTICLE_SPECS, bukan satu fungsi.
// ------------------------------------------------------------------

// Perilaku tiap jenis saat dimajukan satu frame — dipakai stepVisuals
// lewat advanceParticle, supaya update tidak lagi bercabang per jenis.
const PARTICLE_RULES = {
  spark: { gravity: 320, drag: 1, grow: 0, shrink: 1, draw: 'dot', alpha: 1 },
  splash: { gravity: 320, drag: 1, grow: 0, shrink: 1, draw: 'dot', alpha: 1 },
  smoke: { gravity: 0, drag: 0.98, grow: 14, shrink: 1, draw: 'puff', alpha: 0.4 },
  dust: { gravity: 0, drag: 1, grow: 0, shrink: 1, draw: 'puff', alpha: 0.4 },
  fire: { gravity: 0, drag: 1, grow: 0, shrink: 0.985, draw: 'flame', alpha: 0.85 },
};

function jitter(game, amount) {
  return (rand01(game) - 0.5) * amount;
}

function radialSpeed(game, base) {
  const angle = rand01(game) * Math.PI * 2;
  const speed = base * (0.35 + rand01(game) * 0.85);
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

const PARTICLE_SPECS = {
  spark: (game, x, y, o) => {
    const v = radialSpeed(game, o.speed || 260);
    return {
      kind: 'spark', x, y, ...v,
      life: 0.28 + rand01(game) * 0.3, maxLife: 0.58,
      size: 1.5 + rand01(game) * 2.5,
      colour: pickFrom(game, PARTICLE_COLOURS.spark),
    };
  },
  smoke: (game, x, y, o) => ({
    kind: 'smoke',
    x: x + jitter(game, 26), y: y + jitter(game, 18),
    vx: jitter(game, 24), vy: -18 - rand01(game) * 30,
    life: 0.9 + rand01(game) * 0.9, maxLife: 1.8,
    size: 7 + rand01(game) * 12,
    colour: o.dark ? pickFrom(game, PARTICLE_COLOURS.smoke) : '#8a8a8a',
  }),
  dust: (game, x, y) => ({
    kind: 'dust',
    x: x + jitter(game, 30), y: y + jitter(game, 20),
    vx: jitter(game, 40), vy: -6 - rand01(game) * 16,
    life: 0.5 + rand01(game) * 0.5, maxLife: 1,
    size: 4 + rand01(game) * 7,
    colour: pickFrom(game, PARTICLE_COLOURS.dust),
  }),
  fire: (game, x, y) => ({
    kind: 'fire',
    x: x + jitter(game, 30), y: y + jitter(game, 30),
    vx: jitter(game, 90), vy: -20 - rand01(game) * 60,
    life: 0.35 + rand01(game) * 0.35, maxLife: 0.7,
    size: 9 + rand01(game) * 16,
    colour: pickFrom(game, PARTICLE_COLOURS.fire),
  }),
  splash: (game, x, y) => ({
    kind: 'splash', x, y,
    vx: jitter(game, 60), vy: -40 - rand01(game) * 60,
    life: 0.22 + rand01(game) * 0.14, maxLife: 0.36,
    size: 1.5 + rand01(game) * 2,
    colour: pickFrom(game, PARTICLE_COLOURS.rainSplash),
  }),
};

function trimParticles(fx) {
  if (fx.particles.length > FX_LIMITS.particles) {
    fx.particles.splice(0, fx.particles.length - FX_LIMITS.particles);
  }
}

// Emit N partikel sejenis, dengan jumlah dijepit ke [1, cap].
function emit(fx, game, kind, x, y, count, cap, opts) {
  const n = Math.max(1, Math.min(count, cap));
  const spec = PARTICLE_SPECS[kind];
  for (let i = 0; i < n; i += 1) fx.particles.push(spec(game, x, y, opts || {}));
  trimParticles(fx);
}

export function spawnSparks(fx, game, x, y, count, speed) {
  emit(fx, game, 'spark', x, y, count, 26, { speed });
}

export function spawnSmoke(fx, game, x, y, count, dark) {
  emit(fx, game, 'smoke', x, y, count, 14, { dark });
}

export function spawnDust(fx, game, x, y, count) {
  emit(fx, game, 'dust', x, y, count, 10, {});
}

export function spawnRainSplash(fx, game, x, y) {
  emit(fx, game, 'splash', x, y, 1, 1, {});
}

export function spawnExplosion(fx, game, x, y, big) {
  spawnSparks(fx, game, x, y, big ? 34 : 18, big ? 420 : 300);
  spawnSmoke(fx, game, x, y, big ? 12 : 6, true);
  emit(fx, game, 'fire', x, y, big ? 10 : 5, 10, {});
  fx.flashes.push({ x, y, r: big ? 150 : 90, life: 0.22, maxLife: 0.22, colour: '#ffd76a' });
  addShake(fx, big ? 14 : 7);
  trimParticles(fx);
}

export function spawnMuzzle(fx, game, x, y, angle) {
  const tipX = x + Math.cos(angle) * 26;
  const tipY = y + Math.sin(angle) * 26;
  fx.flashes.push({ x: tipX, y: tipY, r: 26, life: 0.09, maxLife: 0.09, colour: '#ffe9a8', angle });
  spawnSparks(fx, game, tipX, tipY, 5, 320);
}

export function addSkidMark(fx, x, y, angle, strength) {
  fx.skids.push({ x, y, angle, life: 5, maxLife: 5, strength: clamp01(strength) });
  if (fx.skids.length > FX_LIMITS.skids) fx.skids.splice(0, fx.skids.length - FX_LIMITS.skids);
}

export function addFloatText(fx, x, y, text, colour) {
  fx.floats.push({ x, y, text, colour: colour || '#f1c40f', life: 2.2, maxLife: 2.2 });
  if (fx.floats.length > FX_LIMITS.floats) fx.floats.shift();
}

export function addShake(fx, amount) {
  fx.shake = Math.min(18, fx.shake + amount);
}

// Seberapa keras mobil menikung: kecepatan tinggi + kemudi penuh di jalan
// basah = selip. Dipakai step untuk memutuskan kapan bekas ban muncul.
export function driftAmount(car, steering, grip) {
  if (!car) return 0;
  const speedRatio = Math.abs(car.speed || 0) / Math.max(1, car.top || 220);
  const steer = Math.abs(steering || 0);
  const slick = 1.35 - Math.min(1, grip || 1) * 0.55;
  return clamp01(speedRatio * steer * slick * 1.6 - 0.25);
}

// ------------------------------------------------------------------
// Step: tiap tahap adalah fungsi kecil; STEP_STAGES menjalankannya
// berurutan. Dipanggil dari stepWorld setelah stepSky, supaya efek
// cuaca memakai cuaca yang sudah diperbarui.
// ------------------------------------------------------------------

// Majukan satu partikel menurut tabel PARTICLE_RULES. Mengembalikan
// false bila partikel itu sudah habis dan harus dibuang.
function advanceParticle(pt, dt) {
  const rule = PARTICLE_RULES[pt.kind] || PARTICLE_RULES.spark;
  pt.life -= dt;
  if (pt.life <= 0) return false;
  pt.x += pt.vx * dt;
  pt.y += pt.vy * dt;
  pt.vy += rule.gravity * dt;
  pt.vx *= rule.drag;
  pt.size += rule.grow * dt;
  pt.size *= rule.shrink;
  return true;
}

// Buang yang sudah mati dari sebuah antrean berumur (life/maxLife).
function ageOut(list, dt, sink) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    item.life -= dt;
    if (sink) sink(item, dt);
    if (item.life <= 0) list.splice(i, 1);
  }
}

function stageShake(game, input, dt) {
  const fx = game.visuals;
  fx.time += dt;
  fx.strobe = (fx.strobe + dt) % 1;
  // Guncangan kamera meluruh; posisi acaknya dihitung di draw.
  fx.shake = Math.max(0, fx.shake - dt * 26);
  fx.shakeX = (rand01(game) - 0.5) * fx.shake;
  fx.shakeY = (rand01(game) - 0.5) * fx.shake;
}

function stageLightning(game, input, dt) {
  const fx = game.visuals;
  // Kilat badai dari sky: simpan puncaknya supaya overlay bisa memudar
  // dengan halus, bukan berkedip satu frame lalu hilang.
  const bolt = game.sky ? (game.sky.lightning || 0) : 0;
  if (bolt > fx.lightningSeen) fx.lightningSeen = bolt;
  else fx.lightningSeen = Math.max(0, fx.lightningSeen - dt * 2.2);
}

function stageGunfire(game, input, dt) {
  const fx = game.visuals;
  // Tembakan baru = peluru baru di daftar game. Tanpa menyentuh combat,
  // muzzle flash muncul tepat di ujung laras pemain.
  const bullets = game.bullets ? game.bullets.length : 0;
  if (bullets > fx.prevBullets && game.player) {
    spawnMuzzle(fx, game, game.player.x, game.player.y, game.player.angle);
  }
  fx.prevBullets = bullets;
}

function stageCarDamage(game, input, dt) {
  const fx = game.visuals;
  // Mobil yang rusak berasap; mobil yang hancur meledak sekali.
  for (const car of game.cars || []) {
    const prev = fx.prevCarHealth.get(car.id);
    const health = typeof car.health === 'number' ? car.health : 100;
    if (typeof prev === 'number' && health <= 0 && prev > 0) {
      spawnExplosion(fx, game, car.x, car.y, car.type === 'truck' || car.type === 'van');
    }
    if (health < 45 && health > 0) {
      fx.smokeTimer -= dt;
      if (fx.smokeTimer <= 0) {
        fx.smokeTimer = 0.16;
        spawnSmoke(fx, game, car.x, car.y - 6, 1, true);
      }
    }
    fx.prevCarHealth.set(car.id, health);
  }
  if (fx.prevCarHealth.size > 80) {
    const first = fx.prevCarHealth.keys().next().value;
    fx.prevCarHealth.delete(first);
  }
}

function stagePlayerTrails(game, input, dt) {
  const fx = game.visuals;
  const p = game.player;
  if (!p || !p.car || !input) return;
  const steering = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const drift = driftAmount(p.car, steering, game.grip);
  // Bekas ban: pemain menikung keras di kecepatan tinggi. Hujan dan
  // badai membuat ban lebih mudah selip, jadi ambang ikut grip.
  if (drift > 0.35 && Math.abs(p.car.speed) > 120) {
    // Titik ban belakang: setengah panjang mobil di belakang pusat.
    const halfLen = (p.car.w || 34) * 0.5;
    const bx = p.car.x - Math.cos(p.car.angle) * halfLen;
    const by = p.car.y - Math.sin(p.car.angle) * halfLen;
    addSkidMark(fx, bx, by, p.car.angle, drift);
    if (rand01(game) < drift * 0.5) spawnDust(fx, game, bx, by, 1);
  }
  // Debu saat ngebut di jalan kering, cipratan saat hujan deras.
  if (Math.abs(p.car.speed) > 260) {
    fx.dustTimer -= dt;
    if (fx.dustTimer <= 0) {
      fx.dustTimer = 0.09;
      const wet = game.sky && (game.sky.weather === 'rain' || game.sky.weather === 'storm');
      if (wet) spawnRainSplash(fx, game, p.car.x, p.car.y + 10);
      else spawnDust(fx, game, p.car.x, p.car.y + 12, 1);
    }
  }
}

function stageRainField(game, input, dt) {
  const fx = game.visuals;
  // Hujan menetes di jalan: cipratan acak di sekitar kamera, bukan di
  // seluruh peta, supaya jumlahnya tetap kecil dan terlihat.
  if (!game.sky || (game.sky.weather !== 'rain' && game.sky.weather !== 'storm')) return;
  fx.splashTimer -= dt;
  if (fx.splashTimer <= 0) {
    fx.splashTimer = game.sky.weather === 'storm' ? 0.05 : 0.11;
    const cam = game.camera || { x: 1430, y: 1370 };
    const sx = cam.x + (rand01(game) - 0.5) * 1100;
    const sy = cam.y + (rand01(game) - 0.5) * 700;
    spawnRainSplash(fx, game, sx, sy);
  }
}

function stageAging(game, input, dt) {
  const fx = game.visuals;
  // Majukan partikel: gerak, gravitasi ringan untuk percikan, lalu mati.
  for (let i = fx.particles.length - 1; i >= 0; i -= 1) {
    if (!advanceParticle(fx.particles[i], dt)) fx.particles.splice(i, 1);
  }
  ageOut(fx.skids, dt, null);
  ageOut(fx.flashes, dt, null);
  ageOut(fx.floats, dt, (f) => { f.y -= 26 * dt; });
}

const STEP_STAGES = [
  stageShake,
  stageLightning,
  stageGunfire,
  stageCarDamage,
  stagePlayerTrails,
  stageRainField,
  stageAging,
];

export function stepVisuals(game, input, dt) {
  const fx = game.visuals;
  if (!fx) return;
  for (const stage of STEP_STAGES) stage(game, input, dt);
}

// ------------------------------------------------------------------
// Gambar dunia: bekas ban, partikel, sorot lampu, strobo polisi.
// Semua koordinat dunia diubah ke layar dengan kamera + guncangan.
// WORLD_STAGES menjalankan tiap pelukis berurutan; menambah lapisan
// baru berarti menambah satu entri, bukan mengedit drawWorldFx.
// ------------------------------------------------------------------

function worldToScreen(game, ctx, W, H) {
  const cam = game.camera || { x: 1430, y: 1370 };
  const fx = game.visuals;
  const sx = fx ? fx.shakeX : 0;
  const sy = fx ? fx.shakeY : 0;
  return { x0: cam.x - W / 2 + sx, y0: cam.y - H / 2 + sy };
}

function paintSkids(fx, ctx, x0, y0) {
  for (const skid of fx.skids) {
    const a = clamp01(skid.life / skid.maxLife) * 0.55 * skid.strength;
    ctx.strokeStyle = `rgba(12,12,14,${a.toFixed(3)})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(skid.x - Math.cos(skid.angle) * 16 - x0, skid.y - Math.sin(skid.angle) * 16 - y0);
    ctx.lineTo(skid.x + Math.cos(skid.angle) * 16 - x0, skid.y + Math.sin(skid.angle) * 16 - y0);
    ctx.stroke();
  }
}

// Sorot lampu depan: kerucut hangat di depan mobil saat gelap. Mobil
// pemain paling terang; mobil lalu lintas lebih redup supaya pemain
// tetap jadi pusat perhatian.
function paintHeadlights(game, ctx, x0, y0, need) {
  if (need <= 0.15) return;
  for (const car of game.cars || []) {
    if (!car.driver) continue;
    const bright = car.driver === 'player' ? 0.34 : 0.16;
    const alpha = bright * need;
    const fx0 = car.x - x0;
    const fy0 = car.y - y0;
    const nx = Math.cos(car.angle);
    const ny = Math.sin(car.angle);
    const grad = ctx.createRadialGradient(fx0 + nx * 60, fy0 + ny * 60, 8, fx0 + nx * 60, fy0 + ny * 60, 150);
    grad.addColorStop(0, `rgba(255,240,180,${alpha.toFixed(3)})`);
    grad.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(fx0 + nx * 10, fy0 + ny * 10);
    ctx.lineTo(fx0 + nx * 150 - ny * 42, fy0 + ny * 150 + nx * 42);
    ctx.lineTo(fx0 + nx * 150 + ny * 42, fy0 + ny * 150 - nx * 42);
    ctx.closePath();
    ctx.fill();
  }
}

// Strobo polisi: lingkaran merah/biru berdenyut di atas mobil polisi
// plus pantulan di jalan — polisi terlihat dari dua blok jauhnya.
function paintPoliceStrobes(game, ctx, x0, y0) {
  for (const car of game.cars || []) {
    if (car.driver !== 'police') continue;
    const colour = policeStrobeColour(game, car.id || 0);
    const cx = car.x - x0;
    const cy = car.y - y0;
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 24 + (car.id || 0));
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 74);
    grad.addColorStop(0, colour);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.28 + 0.3 * pulse;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(cx - 12, cy - 10, 4.5, 0, Math.PI * 2);
    ctx.arc(cx + 12, cy - 10, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Satu partikel, digambar menurut tabel PARTICLE_RULES: 'puff' itu
// lingkaran lembut, 'flame' lingkaran yang mengecil, 'dot' kotak kecil.
function paintOneParticle(pt, ctx, x0, y0) {
  const rule = PARTICLE_RULES[pt.kind] || PARTICLE_RULES.spark;
  const a = clamp01(pt.life / pt.maxLife) * rule.alpha;
  const sx = pt.x - x0;
  const sy = pt.y - y0;
  ctx.globalAlpha = a;
  ctx.fillStyle = pt.colour;
  if (rule.draw === 'puff' || rule.draw === 'flame') {
    const radius = rule.draw === 'flame' ? pt.size * (0.5 + clamp01(pt.life / pt.maxLife) * 0.5) : pt.size;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(sx - pt.size / 2, sy - pt.size / 2, pt.size, pt.size);
  }
}

// Partikel: percikan, asap, debu, api — alpha mengikuti sisa hidup.
function paintParticles(fx, ctx, x0, y0) {
  for (const pt of fx.particles) paintOneParticle(pt, ctx, x0, y0);
  ctx.globalAlpha = 1;
}

function paintFlashesAndFloats(fx, ctx, x0, y0) {
  // Kilat tembakan dan ledakan: lingkaran cahaya yang langsung menghilang.
  for (const fl of fx.flashes) {
    const a = clamp01(fl.life / fl.maxLife);
    const grad = ctx.createRadialGradient(fl.x - x0, fl.y - y0, 2, fl.x - x0, fl.y - y0, fl.r);
    grad.addColorStop(0, `rgba(255,240,180,${(0.9 * a).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fl.x - x0, fl.y - y0, fl.r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Teks melayang: hadiah misi, peringatan, dan info penting lainnya.
  ctx.font = 'bold 17px monospace';
  ctx.textAlign = 'center';
  for (const f of fx.floats) {
    const a = clamp01(f.life / f.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(f.text, f.x - x0 + 1, f.y - y0 + 1);
    ctx.fillStyle = f.colour;
    ctx.fillText(f.text, f.x - x0, f.y - y0);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

const WORLD_STAGES = [
  { id: 'skids', paint: (game, ctx, x0, y0) => paintSkids(game.visuals, ctx, x0, y0) },
  { id: 'headlights', paint: (game, ctx, x0, y0, pal) => paintHeadlights(game, ctx, x0, y0, pal.headlightNeed) },
  { id: 'strobes', paint: (game, ctx, x0, y0) => paintPoliceStrobes(game, ctx, x0, y0) },
  { id: 'particles', paint: (game, ctx, x0, y0) => paintParticles(game.visuals, ctx, x0, y0) },
  { id: 'flashes', paint: (game, ctx, x0, y0) => paintFlashesAndFloats(game.visuals, ctx, x0, y0) },
];

export function drawWorldFx(game, ctx, W, H) {
  const fx = game.visuals;
  if (!fx) return;
  const { x0, y0 } = worldToScreen(game, ctx, W, H);
  const pal = lightPaletteFor(game.sky);
  for (const stage of WORLD_STAGES) stage.paint(game, ctx, x0, y0, pal);
}

// ------------------------------------------------------------------
// Overlay cahaya: tint day-night, fajar/senja hangat, kilat, hujan
// layar, kabut, dan vignette. Digambar setelah dunia, sebelum HUD,
// supaya teks HUD tetap terbaca jernih di atasnya. Tiap lapisan
// adalah satu fungsi di OVERLAY_LAYERS, dijalankan berurutan.
// ------------------------------------------------------------------

function layerNightTint(game, ctx, W, H, pal) {
  // Tint utama malam/siang.
  if (pal.strength <= 0.02) return;
  ctx.fillStyle = pal.tint;
  ctx.globalAlpha = pal.strength;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

function layerWarmHorizon(game, ctx, W, H, pal) {
  // Sapuan hangat fajar dan senja: gradien dari ufuk atas, tipis saja
  // supaya tidak menutupi jalan.
  if (pal.phase !== 'dawn' && pal.phase !== 'dusk') return;
  const warm = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  warm.addColorStop(0, pal.warm);
  warm.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = pal.phase === 'dusk' ? 0.16 : 0.12;
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, W, H * 0.55);
  ctx.globalAlpha = 1;
}

function layerFog(game, ctx, W, H, pal) {
  // Kabut: lapisan haze yang bergerak pelan mengikuti waktu game.
  if (!game.sky || game.sky.weather !== 'fog') return;
  const drift = (game.time * 6) % 260;
  ctx.fillStyle = pal.haze;
  ctx.globalAlpha = 0.16;
  ctx.fillRect(-drift, 0, W + 260, H);
  ctx.globalAlpha = 0.1;
  ctx.fillRect(drift - 260, 0, W + 260, H);
  ctx.globalAlpha = 1;
}

function layerScreenRain(game, ctx, W, H, pal) {
  // Hujan di layar: garis miring cepat, hanya saat hujan/badai.
  if (!game.sky || (game.sky.weather !== 'rain' && game.sky.weather !== 'storm')) return;
  const drops = game.sky.weather === 'storm' ? 70 : 42;
  ctx.strokeStyle = 'rgba(174,214,241,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < drops; i += 1) {
    const seed = (i * 137.5 + game.time * 620) % (H + 80);
    const x = (i * 197.3) % W;
    const y = (seed + i * 31) % (H + 40) - 20;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 5, y + 17);
  }
  ctx.stroke();
}

function layerLightningFlash(game, ctx, W, H, pal) {
  // Kilat: kilasan putih yang memudar, sinkron dengan sky.lightning.
  const fx = game.visuals;
  if (!fx || fx.lightningSeen <= 0.03) return;
  ctx.fillStyle = '#dfe9ff';
  ctx.globalAlpha = Math.min(0.5, fx.lightningSeen * 0.55);
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

function layerVignette(game, ctx, W, H, pal) {
  // Vignette: tepi layar lebih gelap di malam hari supaya fokus ke tengah
  // dan suasana terasa sinematik; siang hari hampir tidak terasa.
  const vigStrength = pal.night ? 0.34 : 0.12;
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, `rgba(0,0,0,${vigStrength})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

const OVERLAY_LAYERS = [
  layerNightTint,
  layerWarmHorizon,
  layerFog,
  layerScreenRain,
  layerLightningFlash,
  layerVignette,
];

export function drawLightOverlay(game, ctx, W, H) {
  const pal = lightPaletteFor(game.sky);
  for (const layer of OVERLAY_LAYERS) layer(game, ctx, W, H, pal);
}

// Ringkasan satu baris untuk HUD: fase cahaya + cuaca, mis. "SENJA • HUJAN".
export function lightSummary(game) {
  const pal = lightPaletteFor(game.sky);
  const phase = PHASE_LABELS[pal.phase] || 'MALAM';
  const weather = WEATHER_LABELS[pal.weatherKind] || 'CERAH';
  return `${phase} • ${weather}`;
}
