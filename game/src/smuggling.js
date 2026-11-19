// Smuggle runs: the playable heart of the black market. You load the
// stash into a run, the game picks a destination dealer across town and
// lays three checkpoints along the way, and you drive (or sprint) there
// before the timer dies. Every checkpoint pays a little reputation and
// drops the heat a touch; finishing pays the whole stash value as dirty
// money, with a storm bonus and a speed bonus. Getting busted, wasted,
// or running out of time burns the run — the goods stay in the stash,
// but the fee and the heat stay with you.

import { DEALERS, CONTRABAND, GOODS_ORDER, stashValue, stashWeight, stashCount, addHeat, gainRep } from './blackmarket.js';
import { nearestRoadPoint } from './world.js';
import { isNight } from './sky.js';
import { addWanted } from './law.js';
import { clamp } from './rng.js';

// Drop-off points are road-adjacent spots near each dealer, so a run
// always ends somewhere a car can actually reach.
export const DROPOFFS = {
  rook: { x: 720, y: 2360, name: 'Dermaga Kontainer' },
  zara: { x: 3120, y: 2050, name: 'Gang Neon' },
  silencio: { x: 4080, y: 940, name: 'Parkir Downtown' },
};

function routeCheckpoints(game, from, to, n = 3) {
  const pts = [];
  for (let i = 1; i <= n; i += 1) {
    const t = i / (n + 1);
    const mx = from.x + (to.x - from.x) * t;
    const my = from.y + (to.y - from.y) * t;
    // Jitter each checkpoint off the straight line so the route bends
    // through real streets instead of cutting across blocks.
    const jx = (game.rng() - 0.5) * 700;
    const jy = (game.rng() - 0.5) * 700;
    const spot = nearestRoadPoint(clamp(mx + jx, 150, 4450), clamp(my + jy, 150, 3250));
    pts.push({ x: spot.x, y: spot.y });
  }
  return pts;
}

export function runPayout(game, run) {
  const base = run.stashValue;
  let mult = 1.35; // a run pays better than selling in place
  if (game.sky.weather === 'storm') mult += 0.25;
  else if (game.sky.weather === 'rain') mult += 0.1;
  if (isNight(game.sky)) mult += 0.1;
  if (game.crew && game.crew.members.lena && game.crew.members.lena.hired) mult += 0.1;
  const speedBonus = run.finishedFast ? 0.15 : 0;
  return Math.round(base * (mult + speedBonus));
}

export function startSmuggleRun(game, dealer) {
  const bm = game.blackmarket;
  if (bm.run) {
    game.toast('Sudah ada run selundupan berjalan.');
    return false;
  }
  if (stashCount(bm) === 0) {
    game.toast('Stash kosong — beli barang dulu sebelum run.');
    return false;
  }
  if (!isNight(game.sky)) {
    game.toast('Run selundupan hanya jalan di malam hari.');
    return false;
  }
  // Destination: another dealer, preferably the farthest one, so the
  // run always crosses town and the timer has to mean something.
  const others = DEALERS.filter((d) => d.id !== dealer.id);
  let dest = others[0];
  let bestD = -1;
  for (const d of others) {
    const dist = Math.hypot(d.x - dealer.x, d.y - dealer.y);
    if (dist > bestD) { bestD = dist; dest = d; }
  }
  const drop = DROPOFFS[dest.id];
  const from = { x: dealer.x, y: dealer.y };
  const to = { x: drop.x, y: drop.y };
  const points = routeCheckpoints(game, from, to, 3);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  // Timer: generous on foot-sprint distance, tight at full-town range.
  // Driving is the intended way — a car covers ~500 u/s at top speed.
  const timer = clamp(Math.round(distance / 14), 55, 150);
  const manifest = {};
  for (const id of GOODS_ORDER) manifest[id] = bm.stash[id] || 0;
  bm.run = {
    id: `run-${game.time.toFixed(0)}-${bm.runsDone + bm.runsFailed + 1}`,
    fromDealer: dealer.id,
    fromName: dealer.name,
    destDealer: dest.id,
    destName: dest.name,
    destDistrict: dest.district,
    dropName: drop.name,
    points,
    pointI: 0,
    tx: points[0].x,
    ty: points[0].y,
    timer,
    timerStart: timer,
    stashValue: stashValue(bm),
    stashWeight: stashWeight(bm),
    manifest,
    label: `${dealer.name} → ${dest.name}`,
    startedAt: game.time,
    finishedFast: false,
    nearMisses: 0,
    heatAtStart: bm.heat,
  };
  game.screen = 'play';
  game.toast(`RUN: antar ${stashCount(bm)} barang ke ${dest.name} (${dest.district}) — ${timer} dtk!`);
  if (game.sound) game.sound.runStart();
  return true;
}

export function stepSmuggleRun(game, dt, input) {
  const bm = game.blackmarket;
  const run = bm.run;
  if (!run) return;
  run.timer -= dt;
  if (run.timer <= 0) {
    failSmuggleRun(game, 'Waktu habis — pembeli pergi, barang tetap di stash.');
    return;
  }
  const p = game.player;
  // Drop-off first: once every checkpoint is cleared, the only target
  // left is the destination yard — checking it before the checkpoint
  // lookup matters, because points[pointI] is undefined by then.
  if (run.pointI >= run.points.length) {
    const drop = DROPOFFS[run.destDealer];
    const dd = Math.hypot(p.x - drop.x, p.y - drop.y);
    if (dd < 150) {
      completeSmuggleRun(game);
      return;
    }
    return;
  }
  const pt = run.points[run.pointI];
  if (!pt) return;
  const d = Math.hypot(p.x - pt.x, p.y - pt.y);
  const radius = p.car ? 130 : 100;
  if (d < radius) {
    run.pointI += 1;
    addHeat(game, -4, '');
    gainRep(game, 2, '');
    if (game.sound) game.sound.blip();
    if (run.pointI >= run.points.length) {
      // All checkpoints cleared: the drop-off is the destination.
      run.tx = DROPOFFS[run.destDealer].x;
      run.ty = DROPOFFS[run.destDealer].y;
      run.label = `${run.fromName} → ${run.destName} (DROP-OFF)`;
      game.toast(`Semua checkpoint dilewati! Antar ke ${run.dropName}.`);
    } else {
      run.tx = run.points[run.pointI].x;
      run.ty = run.points[run.pointI].y;
      game.toast(`Checkpoint ${run.pointI}/${run.points.length} — lanjut!`);
    }
    return;
  }
  // Heat pressure: while a run is live, the market heat creeps up and
  // the police get sharper. Fog is the runner's friend.
  if (game.sky.weather !== 'fog') {
    bm.heat = clamp(bm.heat + dt * 0.25, 0, 100);
    if (bm.heat >= 85 && game.wanted < 3) addWanted(game, 1, 'Polisi mencium run selundupan');
  }
  // Near-miss with a cop car: scraping past an interceptor without
  // being busted counts as a near miss and pays a little nerve bonus.
  if (input && game.wanted > 0) {
    for (const car of game.cars) {
      if (car.driver !== 'police') continue;
      const cd = Math.hypot(car.x - p.x, car.y - p.y);
      if (cd < 90 && !run._nearCd) {
        run._nearCd = 6;
        run.nearMisses += 1;
        game.toast('Nyaris ketangkap! +reputasi jalanan.');
        gainRep(game, 1, '');
      }
    }
  }
  if (run._nearCd > 0) run._nearCd -= dt;
}

export function completeSmuggleRun(game) {
  const bm = game.blackmarket;
  const run = bm.run;
  if (!run) return 0;
  const elapsed = game.time - run.startedAt;
  run.finishedFast = elapsed < run.timerStart * 0.55;
  const payout = runPayout(game, run);
  // The stash empties into the buyer's hands; the money lands dirty.
  for (const id of GOODS_ORDER) bm.stash[id] = 0;
  bm.dirtyMoney += payout;
  bm.runsDone += 1;
  bm.profitTotal += payout;
  if (payout > bm.bestRunPayout) bm.bestRunPayout = payout;
  gainRep(game, 8, '');
  addHeat(game, 8, 'Run besar terlacak');
  bm.run = null;
  const fast = run.finishedFast ? ' (bonus cepat +15%!)' : '';
  const near = run.nearMisses > 0 ? ` Nyaris ketangkap ${run.nearMisses}x.` : '';
  game.toast(`RUN SELESAI! +$${payout} uang kotor${fast}.${near} Cuci di laundry.`);
  game.stats.smuggleRuns = (game.stats.smuggleRuns || 0) + 1;
  game.stats.blackmarketProfit = (game.stats.blackmarketProfit || 0) + payout;
  if (game.sound) game.sound.mission();
  return payout;
}

export function failSmuggleRun(game, why) {
  const bm = game.blackmarket;
  const run = bm.run;
  if (!run) return;
  bm.run = null;
  bm.runsFailed += 1;
  addHeat(game, 10, 'Run gagal — polisi siaga');
  game.toast(`Run gagal: ${why}`);
  if (game.sound) game.sound.busted();
}

export function cancelSmuggleRun(game) {
  const bm = game.blackmarket;
  if (!bm.run) return false;
  failSmuggleRun(game, 'Run dibatalkan. Barang kembali ke stash.');
  return true;
}

// The minimap / world marker for the current run target: the next
// checkpoint, or the drop-off once the checkpoints are done.
export function runTarget(game) {
  const run = game.blackmarket && game.blackmarket.run;
  if (!run) return null;
  return { x: run.tx, y: run.ty, label: run.label, timer: run.timer, pointI: run.pointI, total: run.points.length };
}

export function runProgress(game) {
  const run = game.blackmarket && game.blackmarket.run;
  if (!run) return null;
  return {
    label: run.label,
    checkpoint: `${Math.min(run.pointI, run.points.length)}/${run.points.length}`,
    timer: Math.ceil(run.timer),
    timerStart: run.timerStart,
    stashValue: run.stashValue,
    payout: runPayout(game, run),
    nearMisses: run.nearMisses,
  };
}

// A quick legality check the engine uses when the player is busted or
// wasted mid-run: the run fails, the goods stay, the heat stays.
export function abortRunOnArrest(game) {
  if (game.blackmarket && game.blackmarket.run) {
    failSmuggleRun(game, 'Kau ditangkap di tengah run.');
  }
}
