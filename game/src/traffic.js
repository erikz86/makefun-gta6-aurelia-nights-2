// The living city: traffic that follows the road grid and pedestrians who
// walk the pavements, scatter when shots ring out, and thin out when the
// weather turns. Traffic density follows the weather and the hour — the
// port is quiet at 3 a.m., the Neon Mile never sleeps.

import { AVENUES, STREETS, ROAD_W } from './world.js';
import { createCar } from './vehicles.js';
import { pick, range, intRange, chance, clamp } from './rng.js';
import { weatherNow, isNight } from './sky.js';

const PED_COLOURS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#ecf0f1', '#1abc9c', '#e67e22'];
const TRAFFIC_TYPES = ['sedan', 'sedan', 'taxi', 'van', 'sport', 'truck'];

export function makeRoute(rng, startX, startY) {
  // A loop of road intersections: pick a random avenue and street, walk
  // the grid. Traffic never leaves the asphalt this way.
  const pts = [];
  let x = startX;
  let y = startY;
  for (let i = 0; i < 6; i += 1) {
    if (chance(rng, 0.5)) x = pick(rng, AVENUES);
    else y = pick(rng, STREETS);
    pts.push({ x: x + range(rng, -8, 8), y: y + range(rng, -8, 8) });
  }
  return pts;
}

export function spawnTraffic(game, n) {
  for (let i = 0; i < n; i += 1) {
    const x = pick(game.rng, AVENUES) + range(game.rng, -20, 20);
    const y = pick(game.rng, STREETS) + range(game.rng, -20, 20);
    const car = createCar(x, y, pick(game.rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]), pick(game.rng, TRAFFIC_TYPES));
    car.driver = 'traffic';
    car.route = makeRoute(game.rng, x, y);
    car.speed = range(game.rng, 120, 220);
    game.cars.push(car);
  }
}

export function spawnParked(game, n) {
  for (let i = 0; i < n; i += 1) {
    const along = chance(game.rng, 0.5);
    const x = along ? pick(game.rng, AVENUES) + (chance(game.rng, 0.5) ? ROAD_W / 2 - 8 : -ROAD_W / 2 + 8)
      : pick(game.rng, AVENUES) + range(game.rng, -30, 30);
    const y = along ? pick(game.rng, STREETS) + range(game.rng, -30, 30)
      : pick(game.rng, STREETS) + (chance(game.rng, 0.5) ? ROAD_W / 2 - 8 : -ROAD_W / 2 + 8);
    const car = createCar(x, y, along ? (chance(game.rng, 0.5) ? 0 : Math.PI) : (chance(game.rng, 0.5) ? Math.PI / 2 : -Math.PI / 2), pick(game.rng, TRAFFIC_TYPES));
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

export function stepTraffic(game, dt) {
  const w = weatherNow(game.sky);
  const wantCars = Math.round((isNight(game.sky) ? 13 : 18) * w.traffic);
  const driving = game.cars.filter((c) => c.driver === 'traffic').length;
  if (driving < wantCars && chance(game.rng, dt * 0.7)) spawnTraffic(game, 1);
  if (driving > wantCars + 4) {
    const far = game.cars.find((c) => c.driver === 'traffic' && Math.hypot(c.x - game.player.x, c.y - game.player.y) > 1500);
    if (far) game.cars.splice(game.cars.indexOf(far), 1);
  }
  // Parked cars slowly refresh so there is always something to steal.
  if (game.cars.filter((c) => !c.driver).length < 10 && chance(game.rng, dt * 0.25)) spawnParked(game, 1);
}

export function stepPeds(game, dt) {
  const w = weatherNow(game.sky);
  const wantPeds = Math.round((isNight(game.sky) ? 16 : 30) * w.pedRate);
  if (game.peds.length < wantPeds && chance(game.rng, dt * 1.2)) {
    const near = game.player;
    game.peds.push(createPed(
      clamp(near.x + range(game.rng, -700, 700), 120, 4480),
      clamp(near.y + range(game.rng, -500, 500), 120, 3280),
      game.rng,
    ));
  }
  if (game.peds.length > wantPeds + 8) game.peds.splice(0, game.peds.length - wantPeds);
  for (const p of game.peds) {
    if (p.flee > 0) {
      p.flee -= dt;
      p.x += Math.cos(p.angle) * 150 * dt;
      p.y += Math.sin(p.angle) * 150 * dt;
      continue;
    }
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
}

export function scarePeds(game, x, y, radius) {
  for (const p of game.peds) {
    if (Math.hypot(p.x - x, p.y - y) < radius) {
      p.angle = Math.atan2(p.y - y, p.x - x);
      p.flee = 2.5;
    }
  }
}

// ---- Black-market street life: lookouts and a getaway van. ----
// Lookouts are peds who stand near the dealer corners after dark and
// drift away by dawn. They are flavour with a function: standing near
// one while a run is live slows the market heat a touch, because the
// street is watching for you.
export function spawnDealerLookouts(game) {
  const spots = [
    { x: 520, y: 2420 }, { x: 3350, y: 1860 }, { x: 3980, y: 720 },
  ];
  for (const s of spots) {
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

// One matte-black smuggler van, parked by the container yard at night.
// It is the fastest car a runner can steal — and the police notice it.
export function spawnSmugglerVan(game) {
  if (game.cars.some((c) => c.type === 'smuggler')) return null;
  const van = createCar(640, 2280, Math.PI / 2, 'smuggler');
  van.driver = null;
  van.nitro = 3;
  van.nitroCd = 0;
  game.cars.push(van);
  return van;
}
