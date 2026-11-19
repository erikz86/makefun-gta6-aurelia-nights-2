// Kru dan heist. Heist bukan misi yang kau temukan tanpa sengaja:
// kau merencanakannya di papan safehouse, merekrut orang yang
// dibutuhkan, menjalankan prep-nya, lalu mengeksekusinya bertahap
// sementara wanted level memanjat. Tiap anggota kru mengambil potongan,
// dan kru yang lebih baik membobol lebih cepat dan membayar lebih.

import { CREW, HEISTS } from './tuning.js';
import { heistBonus } from './sky.js';

export function createCrewState() {
  const members = {};
  for (const def of CREW) members[def.id] = { ...def, hired: false };
  const heists = {};
  for (const def of HEISTS) heists[def.id] = { ...def, prepDone: false, done: false, times: 0 };
  return { members, heists, boardOpen: false };
}

export function hiredCrew(game) {
  return Object.values(game.crew.members).filter((m) => m.hired);
}

export function hireMember(game, id) {
  const m = game.crew.members[id];
  if (!m || m.hired) return false;
  if (game.money < m.hire) {
    game.toast(`Merekrut ${m.name} butuh $${m.hire}.`);
    return false;
  }
  game.money -= m.hire;
  m.hired = true;
  game.toast(`${m.name} (${m.role}) bergabung dengan kru. Potongan ${Math.round(m.cut * 100)}%.`);
  game.sound.mission();
  return true;
}

// Anggota kru terdekat yang belum direkrut, dalam jarak maksimum.
export function nearestMember(game, maxDist = 320) {
  let best = null;
  let bestD = maxDist;
  for (const m of Object.values(game.crew.members)) {
    if (m.hired) continue;
    const d = Math.hypot(m.x - game.player.x, m.y - game.player.y);
    if (d < bestD) { best = m; bestD = d; }
  }
  return best;
}

// Total potongan semua anggota yang direkrut.
export function crewCut(game) {
  return hiredCrew(game).reduce((sum, m) => sum + m.cut, 0);
}

export function heistReady(game, heist) {
  return heist.need.every((id) => game.crew.members[id].hired) && heist.prepDone;
}

export function heistMissing(game, heist) {
  const missing = heist.need.filter((id) => !game.crew.members[id].hired);
  return { missing, prep: !heist.prepDone };
}

// Hasil rampasan, setelah potongan kru, dengan bonus malam diterapkan.
export function heistPayout(game, heist) {
  const gross = Math.round(heist.payout * heistBonus(game.sky));
  const cut = Math.round(gross * crewCut(game));
  return { gross, cut, net: gross - cut };
}

export function completeHeist(game, heist) {
  const { gross, cut, net } = heistPayout(game, heist);
  game.money += net;
  heist.done = true;
  heist.times += 1;
  game.stats.heistsDone += 1;
  game.toast(`Heist ${heist.name} berhasil! Kotor $${gross}, potongan kru $${cut}, bersih $${net}.`);
  game.sound.mission();
  return net;
}

// ---- Skill kru yang mengalir ke pasar gelap. ----
// Kru bukan cuma untuk heist: mengemudi Lena membuat run membayar
// lebih, hacking Otto mendinginkan heat pasar lebih cepat, dan otot
// Bruno membuat stash memuat lebih banyak. Merekrut kru karena itu
// mengubah ekonomi malam, bukan cuma papan heist.
function memberHired(game, id) {
  return !!(game.crew.members[id] && game.crew.members[id].hired);
}

export function crewRunBonus(game) {
  let bonus = 0;
  if (memberHired(game, 'lena')) bonus += 0.1;
  if (memberHired(game, 'bruno')) bonus += 0.05;
  return bonus;
}

export function crewStashBonus(game) {
  return memberHired(game, 'bruno') ? 10 : 0;
}

export function crewHeatCooling(game) {
  return memberHired(game, 'otto') ? 1.25 : 1;
}

export function crewSmuggleAdvice(game) {
  if (game.crew.members.lena && !game.crew.members.lena.hired) return 'Lena Voss (pembalap) membuat run membayar 10% lebih.';
  if (game.crew.members.otto && !game.crew.members.otto.hired) return 'Otto Kran (hacker) mendinginkan heat pasar 25% lebih cepat.';
  if (game.crew.members.bruno && !game.crew.members.bruno.hired) return 'Bruno Halden (otot) menambah kapasitas stash +10.';
  return 'Kru lengkap — pasar gelap berjalan dengan dukungan penuh.';
}

// Label kesiapan kru untuk banner heist: berapa anggota sudah direkrut.
export function crewReadyLabel(game) {
  const members = game.crew && game.crew.members ? game.crew.members : {};
  const hired = Object.values(members).filter((m) => m && m.hired).length;
  const total = Math.max(1, Object.keys(members).length);
  return `KRU ${hired}/${total} SIAP`;
}

// Kru lengkap membuka bonus visual: penanda anggota berdenyut emas.
export function crewFull(game) {
  const members = game.crew && game.crew.members ? game.crew.members : {};
  const keys = Object.keys(members);
  return keys.length > 0 && keys.every((k) => members[k] && members[k].hired);
}
