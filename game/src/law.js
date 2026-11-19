// The law in Port Aurelia: a wanted level from 0 to 5 stars, police
// interceptors that hunt the player, and roadblocks once things get hot.
// Fog and rain are the player's friends — the police cannot see as far
// when the weather closes in.

import { WANTED } from './tuning.js';
import { createCar, stepCar } from './vehicles.js';
import { wrapAngle, clamp } from './rng.js';
import { sightFactor } from './sky.js';
import { nearestRoadPoint } from './world.js';

export function addWanted(game, stars, reason) {
  if (game.wanted >= WANTED.max) return;
  game.wanted = clamp(game.wanted + stars, 0, WANTED.max);
  game.quietSeconds = 0;
  if (reason) game.toast(`${reason} — Wanted naik ke ${game.wanted} bintang!`);
}

// ---- Market heat and the law: the second wanted system. ----
// Wanted stars are what the police do right now; market heat is what
// they suspect. Heat over 70 makes patrols spawn on their own, heat
// over 85 during a run calls an interceptor straight to the runner.
export function marketHeatLevel(game) {
  const h = game.blackmarket ? game.blackmarket.heat : 0;
  if (h >= 85) return 'membara';
  if (h >= 70) return 'panas';
  if (h >= 40) return 'hangat';
  if (h > 0) return 'dingin';
  return 'bersih';
}

export function stepMarketHeat(game, dt) {
  if (!game.blackmarket) return;
  const bm = game.blackmarket;
  if (bm.heat >= 70 && game.wanted < 2) {
    game.heatTimer = (game.heatTimer || 0) - dt;
    if (game.heatTimer <= 0) {
      spawnCop(game);
      game.heatTimer = 9;
      game.toast('Patroli pasar gelap menemukan jejakmu!');
      if (game.sound) game.sound.siren();
    }
  }
}

// A bribe paid in clean money: one star gone, but the market heat
// remembers — bribes do not cool the black market, only the street.
export function bribeCop(game) {
  if (game.wanted <= 0) {
    game.toast('Tidak ada yang perlu disuap — jalanan bersih.');
    return false;
  }
  if (game.money < WANTED_BRIBE) {
    game.toast(`Suap butuh $${WANTED_BRIBE} uang bersih.`);
    return false;
  }
  game.money -= WANTED_BRIBE;
  game.wanted -= 1;
  game.quietSeconds = 0;
  game.toast(`Suap diterima. Wanted turun ke ${game.wanted} bintang.`);
  if (game.sound) game.sound.coin();
  return true;
}

export const WANTED_BRIBE = 400;

export function spawnCop(game) {
  const p = game.player;
  const angle = game.rng() * Math.PI * 2;
  const x = clamp(p.x + Math.cos(angle) * 900, 150, 4450);
  const y = clamp(p.y + Math.sin(angle) * 900, 150, 3250);
  const spot = nearestRoadPoint(x, y);
  const car = createCar(spot.x, spot.y, 0, 'police');
  car.driver = 'police';
  car.speed = 200;
  game.cars.push(car);
  return car;
}

function copCount(game) {
  return game.cars.filter((c) => c.driver === 'police').length;
}

export function stepLaw(game, dt) {
  const wantCops = game.wanted === 0 ? 0 : game.wanted <= 1 ? 1 : game.wanted <= 2 ? 2 : game.wanted <= 3 ? 3 : game.wanted <= 4 ? 4 : 5;
  if (copCount(game) < wantCops && game.wanted > 0) {
    if (game.copTimer === undefined) game.copTimer = 0;
    game.copTimer -= dt;
    if (game.copTimer <= 0) {
      spawnCop(game);
      game.copTimer = 4;
      if (game.sound) game.sound.siren();
    }
  }
  // Quiet time fades the heat, one star at a time.
  if (game.wanted > 0) {
    game.quietSeconds += dt;
    if (game.quietSeconds > WANTED.decaySeconds) {
      game.wanted -= 1;
      game.quietSeconds = 0;
      game.toast(`Polisi kehilangan jejakmu. Wanted ${game.wanted}.`);
    }
  }
  // On foot, a cop standing next to you for a while means BUSTED.
  if (!game.player.car && game.wanted > 0) {
    const near = game.cars.some((c) => c.driver === 'police' && Math.hypot(c.x - game.player.x, c.y - game.player.y) < 55);
    if (near) {
      game.bustTimer = (game.bustTimer || 0) + dt;
      if (game.bustTimer > WANTED.bustSeconds) game.busted = true;
    } else {
      game.bustTimer = 0;
    }
  }
}

export function stepCops(game, dt) {
  const sight = sightFactor(game.sky);
  const p = game.player;
  for (const car of game.cars) {
    if (car.driver !== 'police') continue;
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const d = Math.hypot(dx, dy);
    // In fog the cops lose you sooner and give up the chase at range.
    const loseRange = 1500 * sight;
    if (d > loseRange) {
      // Cruise the grid looking for you.
      const input = { up: true, down: false, left: false, right: false };
      const want = Math.atan2(dy, dx);
      const diff = wrapAngle(want - car.angle);
      input.left = diff < -0.1;
      input.right = diff > 0.1;
      stepCar(car, input, dt, game.grip * 0.9);
      continue;
    }
    const want = Math.atan2(dy, dx);
    const diff = wrapAngle(want - car.angle);
    const input = {
      up: true,
      down: false,
      left: diff < -0.08,
      right: diff > 0.08,
    };
    if (car.speed > WANTED.copSpeed) input.up = false;
    stepCar(car, input, dt, game.grip);
    // Ramming the player hurts: the car, or the player on foot.
    if (d < 46) {
      if (p.car) {
        p.car.health -= WANTED.copRamDamage * dt * 1.2;
        p.car.speed *= 0.985;
        car.speed *= 0.9;
      } else {
        p.health -= 26 * dt;
        if (p.health <= 0) game.wasted = true;
      }
    }
  }
  // Remove cops that drifted impossibly far away.
  game.cars = game.cars.filter((c) => c.driver !== 'police' || Math.hypot(c.x - p.x, c.y - p.y) < 2600);
}
