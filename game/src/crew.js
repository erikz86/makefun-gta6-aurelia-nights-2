// The crew and the heists. A heist is not a mission you stumble into: you
// plan it at the safehouse board, hire the people it needs, run its prep,
// then execute it in phases while the wanted level climbs. Every crew
// member takes a cut, and a better crew cracks faster and pays more.

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

// The take, after the crew's cuts, with the night bonus applied.
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

// ---- Crew skills that feed the black market. ----
// The crew is not just for heists: Lena's driving makes runs pay
// better, Otto's hacking cools market heat faster, and Bruno's muscle
// lets the stash hold more. Hiring the crew therefore changes the
// night economy, not just the heist board.
export function crewRunBonus(game) {
  let bonus = 0;
  if (game.crew.members.lena && game.crew.members.lena.hired) bonus += 0.1;
  if (game.crew.members.bruno && game.crew.members.bruno.hired) bonus += 0.05;
  return bonus;
}

export function crewStashBonus(game) {
  return game.crew.members.bruno && game.crew.members.bruno.hired ? 10 : 0;
}

export function crewHeatCooling(game) {
  return game.crew.members.otto && game.crew.members.otto.hired ? 1.25 : 1;
}

export function crewSmuggleAdvice(game) {
  if (game.crew.members.lena && !game.crew.members.lena.hired) return 'Lena Voss (pembalap) membuat run membayar 10% lebih.';
  if (game.crew.members.otto && !game.crew.members.otto.hired) return 'Otto Kran (hacker) mendinginkan heat pasar 25% lebih cepat.';
  if (game.crew.members.bruno && !game.crew.members.bruno.hired) return 'Bruno Halden (otot) menambah kapasitas stash +10.';
  return 'Kru lengkap — pasar gelap berjalan dengan dukungan penuh.';
}
