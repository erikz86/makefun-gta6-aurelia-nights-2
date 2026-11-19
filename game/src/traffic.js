// Kota yang hidup: traffic yang mengikuti grid jalan dan pejalan kaki
// yang berjalan di trotoar, menyebar saat tembakan berbunyi, dan menipis
// saat cuaca memburuk. Kepadatan traffic mengikuti cuaca dan jam —
// pelabuhan sepi jam 3 pagi, Neon Mile tidak pernah tidur.
//
// Ditulis ulang round 4b: titik spawn (jalan, parkir, pejalan kaki)
// kini diambil dari satu set helper titik jalan; satu tick traffic
// dan satu tick pejalan kaki dipecah menjadi fase target/jumlah dan
// langkah per individu; lookout dan van tetap memakai helper yang
// sama supaya perilaku kotanya tidak berubah.

import { AVENUES, STREETS, ROAD_W } from './world.js';
import { createCar } from './vehicles.js';
import { pick, range, intRange, chance, clamp } from './rng.js';
import { weatherNow, isNight } from './sky.js';

const PED_COLOURS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#ecf0f1', '#1abc9c', '#e67e22'];
const TRAFFIC_TYPES = ['sedan', 'sedan', 'taxi', 'van', 'sport', 'truck'];
const ROUTE_STOPS = 6;
const CARDINAL_ANGLES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

// ---- Titik di grid jalan. ----

// Satu titik acak di persimpangan jalan, dengan sedikit jitter supaya
// mobil tidak menumpuk persis di garis tengah.
function randomRoadPoint(rng, jitter = 20) {
  return {
    x: pick(rng, AVENUES) + range(rng, -jitter, jitter),
    y: pick(rng, STREETS) + range(rng, -jitter, jitter),
  };
}

// Titik parkir di tepi jalan: sepanjang avenue (mobil menghadap
// timur/barat) atau sepanjang street (menghadap utara/selatan).
function parkedSpot(rng) {
  const alongAvenue = chance(rng, 0.5);
  const side = chance(rng, 0.5) ? 1 : -1;
  const edge = ROAD_W / 2 - 8;
  if (alongAvenue) {
    return {
      x: pick(rng, AVENUES) + side * edge,
      y: pick(rng, STREETS) + range(rng, -30, 30),
      angle: chance(rng, 0.5) ? 0 : Math.PI,
    };
  }
  return {
    x: pick(rng, AVENUES) + range(rng, -30, 30),
    y: pick(rng, STREETS) + side * edge,
    angle: chance(rng, 0.5) ? Math.PI / 2 : -Math.PI / 2,
  };
}

// Rute putaran persimpangan jalan: pilih avenue dan street acak,
// berjalan mengikuti grid. Traffic tidak pernah meninggalkan aspal
// dengan cara ini.
export function makeRoute(rng, startX, startY) {
  const pts = [];
  let x = startX;
  let y = startY;
  for (let i = 0; i < ROUTE_STOPS; i += 1) {
    if (chance(rng, 0.5)) x = pick(rng, AVENUES);
    else y = pick(rng, STREETS);
    pts.push({ x: x + range(rng, -8, 8), y: y + range(rng, -8, 8) });
  }
  return pts;
}

export function spawnTraffic(game, n) {
  for (let i = 0; i < n; i += 1) {
    const spot = randomRoadPoint(game.rng, 20);
    const car = createCar(spot.x, spot.y, pick(game.rng, CARDINAL_ANGLES), pick(game.rng, TRAFFIC_TYPES));
    car.driver = 'traffic';
    car.route = makeRoute(game.rng, spot.x, spot.y);
    car.speed = range(game.rng, 120, 220);
    game.cars.push(car);
  }
}

export function spawnParked(game, n) {
  for (let i = 0; i < n; i += 1) {
    const spot = parkedSpot(game.rng);
    const car = createCar(spot.x, spot.y, spot.angle, pick(game.rng, TRAFFIC_TYPES));
    car.driver = null;
    game.cars.push(car);
  }
}

export function createPed(x, y, rng) {
  return {
    x, y,
    angle: rng() * Math.PI * 2,
    speed: range(rng, 40, 75),
    colour: pick(rng, PED_COLOURS),
    flee: 0,
    wait: range(rng, 0, 4),
    tx: x, ty: y,
  };
}

export function spawnPeds(game, n) {
  for (let i = 0; i < n; i += 1) {
    const x = range(game.rng, 200, 4400);
    const y = range(game.rng, 200, 3200);
    game.peds.push(createPed(x, y, game.rng));
  }
}

// ---- Tick traffic: jumlah target, lalu tambah/kurangi. ----

function targetCarCount(game) {
  const w = weatherNow(game.sky);
  const base = isNight(game.sky) ? 13 : 18;
  return Math.round(base * w.traffic);
}

function cullFarTrafficCar(game) {
  const far = game.cars.find((c) => c.driver === 'traffic' && Math.hypot(c.x - game.player.x, c.y - game.player.y) > 1500);
  if (far) game.cars.splice(game.cars.indexOf(far), 1);
}

export function stepTraffic(game, dt) {
  const wantCars = targetCarCount(game);
  const driving = game.cars.filter((c) => c.driver === 'traffic').length;
  if (driving < wantCars && chance(game.rng, dt * 0.7)) spawnTraffic(game, 1);
  if (driving > wantCars + 4) cullFarTrafficCar(game);
  // Mobil parkir diperbarui pelan-pelan supaya selalu ada yang bisa dicuri.
  if (game.cars.filter((c) => !c.driver).length < 10 && chance(game.rng, dt * 0.25)) spawnParked(game, 1);
}

// ---- Satu pejalan kaki: lari bila ketakutan, kalau tidak berjalan
// santai menuju target acak berikutnya. ----

function stepFleeingPed(p, dt) {
  p.flee -= dt;
  p.x += Math.cos(p.angle) * 150 * dt;
  p.y += Math.sin(p.angle) * 150 * dt;
}

function stepWanderingPed(game, p, dt) {
  p.wait -= dt;
  if (p.wait <= 0) {
    p.tx = clamp(p.x + range(game.rng, -260, 260), 100, 4500);
    p.ty = clamp(p.y + range(game.rng, -260, 260), 100, 3300);
    p.wait = range(game.rng, 2, 7);
  }
  const dx = p.tx - p.x;
  const dy = p.ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d > 8) {
    p.angle = Math.atan2(dy, dx);
    p.x += Math.cos(p.angle) * p.speed * dt;
    p.y += Math.sin(p.angle) * p.speed * dt;
  }
}

function stepOnePed(game, p, dt) {
  if (p.flee > 0) stepFleeingPed(p, dt);
  else stepWanderingPed(game, p, dt);
}

function targetPedCount(game) {
  const w = weatherNow(game.sky);
  const base = isNight(game.sky) ? 16 : 30;
  return Math.round(base * w.pedRate);
}

export function stepPeds(game, dt) {
  const wantPeds = targetPedCount(game);
  if (game.peds.length < wantPeds && chance(game.rng, dt * 1.2)) {
    const near = game.player;
    game.peds.push(createPed(
      clamp(near.x + range(game.rng, -700, 700), 120, 4480),
      clamp(near.y + range(game.rng, -500, 500), 120, 3280),
      game.rng,
    ));
  }
  if (game.peds.length > wantPeds + 8) game.peds.splice(0, game.peds.length - wantPeds);
  for (const p of game.peds) stepOnePed(game, p, dt);
}

export function scarePeds(game, x, y, radius) {
  for (const p of game.peds) {
    if (Math.hypot(p.x - x, p.y - y) < radius) {
      p.angle = Math.atan2(p.y - y, p.x - x);
      p.flee = 2.5;
    }
  }
}

// ---- Kehidupan jalanan pasar gelap: lookout dan van kabur. ----
// Lookout adalah pejalan kaki yang berdiri di dekat sudut dealer
// setelah gelap dan menjauh saat fajar. Mereka flavour yang punya
// fungsi: berdiri di dekat salah satunya saat run hidup memperlambat
// heat pasar sedikit, karena jalanan sedang mengawasimu.
const LOOKOUT_SPOTS = [
  { x: 520, y: 2420 }, { x: 3350, y: 1860 }, { x: 3980, y: 720 },
];

export function spawnDealerLookouts(game) {
  for (const s of LOOKOUT_SPOTS) {
    for (let i = 0; i < 2; i += 1) {
      const ped = createPed(s.x + (game.rng() - 0.5) * 90, s.y + (game.rng() - 0.5) * 90, game.rng);
      ped.colour = '#1a1a2e';
      ped.lookout = true;
      ped.homeX = s.x;
      ped.homeY = s.y;
      game.peds.push(ped);
    }
  }
}

export function lookoutCount(game) {
  return game.peds.filter((p) => p.lookout).length;
}

// Satu van selundupan hitam matte, parkir di lapangan kontainer saat
// malam. Mobil tercepat yang bisa dicuri pelari — dan polisi sadar.
export function spawnSmugglerVan(game) {
  if (game.cars.some((c) => c.type === 'smuggler')) return null;
  const van = createCar(640, 2280, Math.PI / 2, 'smuggler');
  van.driver = null;
  van.nitro = 3;
  van.nitroCd = 0;
  game.cars.push(van);
  return van;
}

// Warna lampu belakang mobil: polisi biru-merah, lalu lintas merah
// biasa, parkir mati. Dipakai renderer efek saat menggambar jejak cahaya.
const TAIL_LIGHT_BY_DRIVER = { police: '#ff2d2d' };

export function tailLightColour(car) {
  if (!car || !car.driver) return null;
  return TAIL_LIGHT_BY_DRIVER[car.driver] || '#e74c3c';
}

// Lampu depan menyala bila gelap atau berkabut — cerminan aturan sky.
const NIGHT_START_HOUR = 19;
const NIGHT_END_HOUR = 6;

export function headlightsOn(game) {
  if (!game || !game.sky) return false;
  const h = ((game.sky.clock / 60) % 24 + 24) % 24;
  const isNightHour = h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
  return isNightHour || game.sky.weather === 'fog';
}
