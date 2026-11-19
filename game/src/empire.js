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

// ---- The laundry: where dirty money becomes clean. ----
// Kilau Laundry is the only legal business that touches the black
// market. Every game hour it washes a slice of the dirty money on its
// own (the night shift), and the dealer panel can wash a lump sum on
// demand. The cut shrinks as the laundry levels up.
export function laundryWashCap(game) {
  const laundry = game.empire.props.laundry;
  if (!laundry || !laundry.owned) return 0;
  return [0, 800, 2000, 5000][laundry.level] || 800;
}

export function laundryWashCut(game) {
  const laundry = game.empire.props.laundry;
  if (!laundry || !laundry.owned) return 0.35;
  return [0, 0.35, 0.25, 0.15][laundry.level] || 0.35;
}

export function tickLaundryWash(game) {
  if (!game.blackmarket || game.blackmarket.dirtyMoney <= 0) return 0;
  const cap = laundryWashCap(game);
  if (cap <= 0) return 0;
  // The hourly auto-wash is a quarter of the cap: slow, steady, safe.
  const amount = Math.min(game.blackmarket.dirtyMoney, Math.floor(cap / 4));
  const fee = Math.round(amount * laundryWashCut(game));
  const clean = amount - fee;
  game.blackmarket.dirtyMoney -= amount;
  game.blackmarket.washedTotal += clean;
  game.money += clean;
  return clean;
}

// A stash room above the garage: owning the garage at level 2+ adds
// safe storage the police never search, worth +10 stash capacity.
export function stashCapacity(game) {
  const garage = game.empire.props.garage;
  let cap = 40;
  if (garage && garage.owned && garage.level >= 2) cap += 10;
  if (game.crew && game.crew.members.bruno && game.crew.members.bruno.hired) cap += 10;
  return cap;
}
