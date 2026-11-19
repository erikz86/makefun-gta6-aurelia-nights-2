// Hukum di Port Aurelia: wanted level 0 sampai 5 bintang, interceptor
// polisi yang memburu pemain, dan roadblock begitu keadaan memanas.
// Kabut dan hujan adalah kawan pemain — polisi tidak bisa melihat
// sejauh biasa saat cuaca menutup.

import { WANTED } from './tuning.js';
import { createCar, stepCar } from './vehicles.js';
import { wrapAngle, clamp } from './rng.js';
import { sightFactor } from './sky.js';
import { nearestRoadPoint } from './world.js';

// Biaya suap satu bintang wanted, dibayar dengan uang bersih.
export const WANTED_BRIBE = 400;

export function addWanted(game, stars, reason) {
  if (game.wanted >= WANTED.max) return;
  game.wanted = clamp(game.wanted + stars, 0, WANTED.max);
  game.quietSeconds = 0;
  if (reason) game.toast(`${reason} — Wanted naik ke ${game.wanted} bintang!`);
}

// ---- Heat pasar dan hukum: sistem wanted kedua. ----
// Bintang wanted adalah apa yang dilakukan polisi sekarang; heat pasar
// adalah apa yang mereka curigai. Heat di atas 70 membuat patroli
// muncul sendiri, heat di atas 85 selama run memanggil interceptor
// langsung ke pelari.
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

// Suap yang dibayar dengan uang bersih: satu bintang hilang, tapi heat
// pasar tetap ingat — suap tidak mendinginkan pasar gelap, hanya jalanan.
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

// Satu mobil polisi baru, muncul di jalan sekitar 900 unit dari pemain.
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

// Jumlah polisi yang diinginkan dari wanted level: 0 sampai 5.
function wantedCopCount(wanted) {
  if (wanted === 0) return 0;
  if (wanted <= 1) return 1;
  if (wanted <= 2) return 2;
  if (wanted <= 3) return 3;
  if (wanted <= 4) return 4;
  return 5;
}

export function stepLaw(game, dt) {
  const wantCops = wantedCopCount(game.wanted);
  if (copCount(game) < wantCops && game.wanted > 0) {
    if (game.copTimer === undefined) game.copTimer = 0;
    game.copTimer -= dt;
    if (game.copTimer <= 0) {
      spawnCop(game);
      game.copTimer = 4;
      if (game.sound) game.sound.siren();
    }
  }
  // Waktu tenang memudarkan panas, satu bintang demi satu bintang.
  if (game.wanted > 0) {
    game.quietSeconds += dt;
    if (game.quietSeconds > WANTED.decaySeconds) {
      game.wanted -= 1;
      game.quietSeconds = 0;
      game.toast(`Polisi kehilangan jejakmu. Wanted ${game.wanted}.`);
    }
  }
  // Jalan kaki, polisi yang berdiri di sebelahmu cukup lama berarti BUSTED.
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

// Input mengemudi polisi menuju satu sudut yang diinginkan.
function copSteering(car, wantAngle, grip, maxSpeed) {
  const diff = wrapAngle(wantAngle - car.angle);
  const input = {
    up: true,
    down: false,
    left: diff < -0.08,
    right: diff > 0.08,
  };
  if (car.speed > maxSpeed) input.up = false;
  return input;
}

export function stepCops(game, dt) {
  const sight = sightFactor(game.sky);
  const p = game.player;
  for (const car of game.cars) {
    if (car.driver !== 'police') continue;
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const d = Math.hypot(dx, dy);
    // Di kabut polisi kehilanganmu lebih cepat dan menyerah mengejar
    // dari jarak jauh.
    const loseRange = 1500 * sight;
    if (d > loseRange) {
      // Jelajahi grid sambil mencarimu.
      const want = Math.atan2(dy, dx);
      const diff = wrapAngle(want - car.angle);
      const cruise = { up: true, down: false, left: diff < -0.1, right: diff > 0.1 };
      stepCar(car, cruise, dt, game.grip * 0.9);
      continue;
    }
    const want = Math.atan2(dy, dx);
    stepCar(car, copSteering(car, want, game.grip, WANTED.copSpeed), dt, game.grip);
    // Menabrak pemain itu menyakitkan: mobilnya, atau pemain yang jalan kaki.
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
  // Singkirkan polisi yang melayang terlalu jauh.
  game.cars = game.cars.filter((c) => c.driver !== 'police' || Math.hypot(c.x - p.x, c.y - p.y) < 2600);
}

// Fase strobo polisi 0/1 dari jam game: semua mobil polisi berkedip
// serempak, empat ketukan per detik, merah lalu biru.
export function policeStrobePhase(game) {
  return Math.floor(game.time * 4) % 2;
}

// Intensitas pantulan strobo di jalan: penuh saat gelap, redup di siang.
export function policeGlowStrength(game) {
  const h = ((game.sky.clock / 60) % 24 + 24) % 24;
  const night = h >= 19 || h < 6;
  return night ? 1 : 0.35;
}
