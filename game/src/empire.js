// Empire: Port Aurelia dijual, satu etalase demi satu etalase. Beli
// bisnis, upgrade, dan ia membayar tiap jam game — uang yang mendanai
// heist berikutnya. Sewa jatuh tempo di siang hari; Neon Tide baru
// menghasilkan uang sungguhan setelah gelap.

import { PROPERTIES } from './tuning.js';
import { isNight } from './sky.js';

export function createEmpire() {
  const props = {};
  for (const def of PROPERTIES) {
    props[def.id] = { ...def, level: 0, owned: false };
  }
  return { props, earnedTotal: 0 };
}

// Penghasilan per jam game untuk satu properti (0 bila belum dimiliki).
export function incomePerHour(game, prop) {
  if (!prop.owned) return 0;
  let base = prop.income * prop.level;
  // Hiburan malam membayar di malam hari; warung membayar saat makan
  // siang. Bengkel tidak pernah tidur.
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

// Dipanggil tiap kali jam berganti: semua properti membayar sekaligus.
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

// ---- Laundry: tempat uang kotor menjadi bersih. ----
// Kilau Laundry adalah satu-satunya bisnis legal yang menyentuh pasar
// gelap. Tiap jam game ia mencuci sepotong uang kotor sendiri (shift
// malam), dan panel dealer bisa mencuci sekaligus atas permintaan.
// Potongannya mengecil seiring level laundry naik.
function laundryLevel(game) {
  const laundry = game.empire.props.laundry;
  if (!laundry || !laundry.owned) return 0;
  return laundry.level;
}

export function laundryWashCap(game) {
  const level = laundryLevel(game);
  if (level <= 0) return 0;
  return [0, 800, 2000, 5000][level] || 800;
}

export function laundryWashCut(game) {
  const level = laundryLevel(game);
  if (level <= 0) return 0.35;
  return [0, 0.35, 0.25, 0.15][level] || 0.35;
}

export function tickLaundryWash(game) {
  if (!game.blackmarket || game.blackmarket.dirtyMoney <= 0) return 0;
  const cap = laundryWashCap(game);
  if (cap <= 0) return 0;
  // Cuci otomatis per jam adalah seperempat cap: pelan, stabil, aman.
  const amount = Math.min(game.blackmarket.dirtyMoney, Math.floor(cap / 4));
  const fee = Math.round(amount * laundryWashCut(game));
  const clean = amount - fee;
  game.blackmarket.dirtyMoney -= amount;
  game.blackmarket.washedTotal += clean;
  game.money += clean;
  return clean;
}

// Ruang stash di atas bengkel: memiliki garage level 2+ menambah
// penyimpanan aman yang tidak pernah digeledah polisi, senilai +10
// kapasitas stash.
export function stashCapacity(game) {
  const garage = game.empire.props.garage;
  let cap = 40;
  if (garage && garage.owned && garage.level >= 2) cap += 10;
  if (game.crew && game.crew.members.bruno && game.crew.members.bruno.hired) cap += 10;
  return cap;
}

// Warna cahaya properti milik pemain di peta: hijau saat untung,
// kuning saat baru dibeli dan belum menghasilkan.
export function empireGlowColour(game, prop) {
  if (!prop || !prop.owned) return '#f1c40f';
  return incomePerHour(game, prop) > 0 ? '#2ecc71' : '#f39c12';
}

// Total lampu empire: properti milik pemain menyala di malam hari.
export function empireLitCount(game) {
  if (!game.empire || !game.empire.props) return 0;
  return Object.values(game.empire.props).filter((p) => p && p.owned).length;
}
