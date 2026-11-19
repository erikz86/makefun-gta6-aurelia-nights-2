// The empire: Port Aurelia is for sale, one storefront at a time. Buy a
// business, upgrade it, and it pays you every game hour — the money that
// funds the next heist. Rent is due in daylight; the Neon Tide only makes
// real money after dark.

import { PROPERTIES } from './tuning.js';
import { isNight } from './sky.js';

export function createEmpire() {
  const props = {};
  for (const def of PROPERTIES) {
    props[def.id] = { ...def, level: 0, owned: false };
  }
  return { props, earnedTotal: 0 };
}

export function incomePerHour(game, prop) {
  if (!prop.owned) return 0;
  let base = prop.income * prop.level;
  // Nightlife pays at night; the diner pays at lunch. The garage never sleeps.
  if (prop.id === 'club' && isNight(game.sky)) base *= 2;
  if (prop.id === 'diner' && !isNight(game.sky)) base *= 1.4;
  return Math.round(base);
}

export function ownedCount(empire) {
  return Object.values(empire.props).filter((p) => p.owned).length;
}

export function buyProperty(game, id) {
  const prop = game.empire.props[id];
  if (!prop || prop.owned) return false;
  if (game.money < prop.price) {
    game.toast(`Uang tidak cukup: ${prop.name} harganya $${prop.price}.`);
    return false;
  }
  game.money -= prop.price;
  prop.owned = true;
  prop.level = 1;
  game.empire.earnedTotal += 0;
  game.toast(`${prop.name} resmi milikmu! Penghasilan $${incomePerHour(game, prop)}/jam.`);
  game.sound.coin();
  return true;
}

export function upgradeProperty(game, id) {
  const prop = game.empire.props[id];
  if (!prop || !prop.owned || prop.level >= 3) return false;
  const cost = prop.upgrade[prop.level - 1];
  if (game.money < cost) {
    game.toast(`Upgrade butuh $${cost}.`);
    return false;
  }
  game.money -= cost;
  prop.level += 1;
  game.toast(`${prop.name} naik ke level ${prop.level}: $${incomePerHour(game, prop)}/jam.`);
  game.sound.coin();
  return true;
}

// Called every time the clock crosses an hour boundary.
export function tickHourIncome(game) {
  let total = 0;
  for (const prop of Object.values(game.empire.props)) {
    total += incomePerHour(game, prop);
  }
  if (total > 0) {
    game.money += total;
    game.empire.earnedTotal += total;
    game.toast(`Bisnismu menghasilkan $${total}.`);
    game.sound.coin();
  }
  return total;
}

export function nearestProperty(game, maxDist = 300) {
  let best = null;
  let bestD = maxDist;
  for (const prop of Object.values(game.empire.props)) {
    const d = Math.hypot(prop.x - game.player.x, prop.y - game.player.y);
    if (d < bestD) { best = prop; bestD = d; }
  }
  return best;
}
