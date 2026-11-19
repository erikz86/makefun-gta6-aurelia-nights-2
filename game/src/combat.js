// Combat: fists, and three guns sold at Ironworks. The shotgun throws a
// spread, the SMG throws lead fast, the pistol is the reliable starter.
// Shots scare pedestrians, dent cars, and always draw the law's eye.

import { WEAPONS } from './tuning.js';
import { scarePeds } from './traffic.js';
import { addWanted } from './law.js';
import { wrapAngle } from './rng.js';

export function createArsenal() {
  const guns = {};
  for (const [id, def] of Object.entries(WEAPONS)) {
    guns[id] = { id, name: def.name, owned: def.owned, ammo: def.ammo, cooldown: 0 };
  }
  return { guns, current: 'pistol' };
}

export function weaponDef(id) {
  return WEAPONS[id];
}

// ---- Black-market ammunition: the illegal side of Ironworks. ----
// Smuggled ammo is bought in bulk with dirty money's clean cousin —
// cash, no questions — and it is cheaper per bullet than the shop,
// but every crate raises market heat. A runner who shoots his way
// out of a run pays for it twice: once in cash, once in heat.
export function buySmuggledAmmo(game, gunId, crates = 1) {
  const gun = game.arsenal.guns[gunId];
  if (!gun || !gun.owned) {
    game.toast('Senjata itu belum kau miliki.');
    return false;
  }
  const pricePerCrate = gunId === 'shotgun' ? 90 : gunId === 'smg' ? 70 : 40;
  const bulletsPerCrate = gunId === 'shotgun' ? 18 : gunId === 'smg' ? 72 : 60;
  const price = pricePerCrate * crates;
  if (game.money < price) {
    game.toast(`Amunisi selundupan butuh $${price}.`);
    return false;
  }
  game.money -= price;
  gun.ammo += bulletsPerCrate * crates;
  if (game.blackmarket) {
    game.blackmarket.heat = Math.min(100, game.blackmarket.heat + 3 * crates);
    game.blackmarket.dealsDone += 1;
  }
  game.toast(`Amunisi selundupan: +${bulletsPerCrate * crates} peluru ${gun.name} ($${price}). Heat +${3 * crates}.`);
  if (game.sound) game.sound.deal();
  return true;
}

// Intimidation: a runner with a gun and a reputation can make a
// tailing pedestrian scatter without firing a shot — cheaper than a
// bullet, louder than silence.
export function intimidate(game) {
  const near = game.peds.find((p) => Math.hypot(p.x - game.player.x, p.y - game.player.y) < 160);
  if (!near) return false;
  scarePeds(game, game.player.x, game.player.y, 260);
  game.toast('Kau mengacungkan senjata — jalanan memberi jalan.');
  return true;
}

export function switchWeapon(arsenal, id) {
  if (arsenal.guns[id] && arsenal.guns[id].owned) arsenal.current = id;
}

export function currentGun(game) {
  return game.arsenal.guns[game.arsenal.current];
}

export function tryShoot(game, tx, ty) {
  const p = game.player;
  const gun = currentGun(game);
  const def = weaponDef(gun.id);
  if (gun.cooldown > 0 || gun.ammo <= 0 || p.car) return false;
  gun.cooldown = def.rate;
  gun.ammo -= 1;
  const base = Math.atan2(ty - p.y, tx - p.x);
  game.bullets = game.bullets || [];
  for (let i = 0; i < def.pellets; i += 1) {
    const a = base + (game.rng() - 0.5) * def.spread * 2;
    game.bullets.push({
      x: p.x, y: p.y, angle: a,
      speed: 900, life: def.range / 900,
      damage: def.damage,
    });
  }
  game.sound.shoot(gun.id);
  scarePeds(game, p.x, p.y, 320);
  addWanted(game, 0, '');
  game.wanted = Math.max(game.wanted, 1);
  game.quietSeconds = 0;
  return true;
}

export function punch(game) {
  const p = game.player;
  if (p.car || p.punchCooldown > 0) return;
  p.punchCooldown = 0.45;
  p.punchArc = 0.25;
  game.sound.tone(180, 0.1, 'square', 0.15, 90);
  // A swing in front of the player: peds flee, cars take a dent, cops notice.
  const fx = p.x + Math.cos(p.angle) * 34;
  const fy = p.y + Math.sin(p.angle) * 34;
  for (const ped of game.peds) {
    if (Math.hypot(ped.x - fx, ped.y - fy) < 46) {
      ped.angle = Math.atan2(ped.y - p.y, ped.x - p.x);
      ped.flee = 3;
    }
  }
  for (const car of game.cars) {
    if (Math.hypot(car.x - fx, car.y - fy) < 52) {
      car.health -= 12;
      if (car.driver === 'traffic' || car.driver === 'police') addWanted(game, 1, 'Menyerang mobil');
    }
  }
  const nearPed = game.peds.some((pd) => Math.hypot(pd.x - fx, pd.y - fy) < 46);
  if (nearPed) addWanted(game, 1, 'Menyerang warga');
}

export function stepBullets(game, dt) {
  if (!game.bullets) game.bullets = [];
  for (const b of game.bullets) {
    b.life -= dt;
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    // Hit a car?
    for (const car of game.cars) {
      if (Math.hypot(car.x - b.x, car.y - b.y) < car.w / 2 + 4) {
        car.health -= b.damage;
        b.life = 0;
        if (car.driver === 'police') addWanted(game, 1, 'Menembak polisi');
        else if (car.driver === 'traffic') addWanted(game, 1, 'Menembak mobil warga');
        break;
      }
    }
    // A bullet through the jewel store's window smashes a display case.
    if (b.life > 0 && game.story.active && game.story.active.id === 'jewel' && game.story.active.step === 1
      && Math.hypot(b.x - 2900, b.y - 950) < 120) {
      game.storeShot = true;
      b.life = 0;
    }
    if (b.life <= 0) continue;
    for (const ped of game.peds) {
      if (Math.hypot(ped.x - b.x, ped.y - b.y) < 16) {
        ped.flee = 4;
        ped.angle = Math.atan2(ped.y - b.y, ped.x - b.x);
        b.life = 0;
        addWanted(game, 1, 'Menembak warga');
        break;
      }
    }
  }
  game.bullets = game.bullets.filter((b) => b.life > 0);
  for (const gun of Object.values(game.arsenal.guns)) {
    if (gun.cooldown > 0) gun.cooldown -= dt;
  }
  if (game.player.punchCooldown > 0) game.player.punchCooldown -= dt;
  if (game.player.punchArc > 0) game.player.punchArc -= dt;
}
