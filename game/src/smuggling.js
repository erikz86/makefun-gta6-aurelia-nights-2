// Run selundupan: jantung playable pasar gelap. Stash dimuat ke dalam
// satu run, game memilih dealer tujuan di seberang kota dan meletakkan
// tiga checkpoint di antaranya, lalu pemain mengantar (naik mobil atau
// lari) sebelum timer habis. Tiap checkpoint membayar sedikit reputasi
// dan mendinginkan heat; finis membayar seluruh nilai stash sebagai
// uang kotor, ditambah bonus badai dan bonus cepat. Ketangkap, tewas,
// atau kehabisan waktu membakar run — barang tetap di stash, tapi fee
// dan heat tetap menempel.
//
// Ditulis ulang round 4b: bonus payout kini tabel (cuaca, malam, kru,
// cepat); syarat mulai run kini daftar cek; dan satu tick run dipecah
// menjadi fase — timer, kedatangan (checkpoint/drop-off), tekanan heat,
// dan near miss — yang dijalankan berurutan.

import { DEALERS, CONTRABAND, GOODS_ORDER, stashValue, stashWeight, stashCount, addHeat, gainRep } from './blackmarket.js';
import { nearestRoadPoint } from './world.js';
import { isNight } from './sky.js';
import { addWanted } from './law.js';
import { clamp } from './rng.js';

// Titik drop-off di tepi jalan dekat tiap dealer, supaya run selalu
// berakhir di tempat yang bisa dijangkau mobil.
export const DROPOFFS = {
  rook: { x: 720, y: 2360, name: 'Dermaga Kontainer' },
  zara: { x: 3120, y: 2050, name: 'Gang Neon' },
  silencio: { x: 4080, y: 940, name: 'Parkir Downtown' },
};

// Bonus pengali payout per kondisi — dijumlah ke pengali dasar 1.35.
const PAYOUT_BONUS = {
  base: 1.35,
  weather: { storm: 0.25, rain: 0.1 },
  night: 0.1,
  lenaCrew: 0.1,
  fast: 0.15,
};

// Checkpoint di sepanjang garis lurus asal-tujuan, masing-masing
// digeser acak supaya rutenya membelok lewat jalan sungguhan, bukan
// memotong blok kota.
function buildCheckpoints(game, from, to, count = 3) {
  const stops = [];
  for (let i = 1; i <= count; i += 1) {
    const t = i / (count + 1);
    const midX = from.x + (to.x - from.x) * t;
    const midY = from.y + (to.y - from.y) * t;
    const jitterX = (game.rng() - 0.5) * 700;
    const jitterY = (game.rng() - 0.5) * 700;
    const roadX = clamp(midX + jitterX, 150, 4450);
    const roadY = clamp(midY + jitterY, 150, 3250);
    const onRoad = nearestRoadPoint(roadX, roadY);
    stops.push({ x: onRoad.x, y: onRoad.y });
  }
  return stops;
}

// Bayaran run: nilai stash dikali pengali cuaca, malam, kru, dan cepat.
export function runPayout(game, run) {
  const base = run.stashValue;
  let mult = PAYOUT_BONUS.base;
  mult += PAYOUT_BONUS.weather[game.sky.weather] || 0;
  if (isNight(game.sky)) mult += PAYOUT_BONUS.night;
  const lena = game.crew && game.crew.members.lena;
  if (lena && lena.hired) mult += PAYOUT_BONUS.lenaCrew;
  if (run.finishedFast) mult += PAYOUT_BONUS.fast;
  return Math.round(base * mult);
}

// Syarat mulai run — dicek berurutan, yang pertama gagal menjawab.
const START_CHECKS = [
  { test: (game) => !!game.blackmarket.run, why: 'Sudah ada run selundupan berjalan.' },
  { test: (game) => stashCount(game.blackmarket) === 0, why: 'Stash kosong — beli barang dulu sebelum run.' },
  { test: (game) => !isNight(game.sky), why: 'Run selundupan hanya jalan di malam hari.' },
];

// Tujuan: dealer lain, diutamakan yang terjauh, supaya run selalu
// menyeberang kota dan timernya terasa berarti.
function farthestDealer(fromDealer) {
  let dest = null;
  let farthest = -1;
  for (const d of DEALERS) {
    if (d.id === fromDealer.id) continue;
    const dist = Math.hypot(d.x - fromDealer.x, d.y - fromDealer.y);
    if (dist > farthest) { farthest = dist; dest = d; }
  }
  return dest;
}

function buildRun(game, dealer, dest) {
  const bm = game.blackmarket;
  const drop = DROPOFFS[dest.id];
  const from = { x: dealer.x, y: dealer.y };
  const to = { x: drop.x, y: drop.y };
  const points = buildCheckpoints(game, from, to, 3);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  // Timer: longgar untuk jarak lari kaki, ketat untuk jarak sekota.
  // Mobil adalah cara yang dimaksud — mobil tercepat ~500 u/dtk.
  const timer = clamp(Math.round(distance / 14), 55, 150);
  const manifest = {};
  for (const id of GOODS_ORDER) manifest[id] = bm.stash[id] || 0;
  return {
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
}

export function startSmuggleRun(game, dealer) {
  const bm = game.blackmarket;
  for (const check of START_CHECKS) {
    if (check.test(game)) {
      game.toast(check.why);
      return false;
    }
  }
  const dest = farthestDealer(dealer);
  bm.run = buildRun(game, dealer, dest);
  game.screen = 'play';
  game.toast(`RUN: antar ${stashCount(bm)} barang ke ${dest.name} (${dest.district}) — ${bm.run.timer} dtk!`);
  if (game.sound) game.sound.runStart();
  return true;
}

// ---- Satu tick run: timer, kedatangan, tekanan, near miss. ----

// Timer jalan; bila habis, run gagal. True = tick selesai di sini.
function tickRunTimer(game, run, dt) {
  run.timer -= dt;
  if (run.timer > 0) return false;
  failSmuggleRun(game, 'Waktu habis — pembeli pergi, barang tetap di stash.');
  return true;
}

// Kedatangan: drop-off dulu bila semua checkpoint lolos, lalu
// checkpoint berikutnya. True = tick selesai di sini.
function checkRunArrival(game, run) {
  const p = game.player;
  // Drop-off dulu: begitu semua checkpoint lolos, satu-satunya target
  // adalah halaman tujuan — pengecekan ini harus sebelum lookup
  // checkpoint, karena points[pointI] sudah undefined saat itu.
  if (run.pointI >= run.points.length) {
    const drop = DROPOFFS[run.destDealer];
    const dd = Math.hypot(p.x - drop.x, p.y - drop.y);
    if (dd < 150) completeSmuggleRun(game);
    return true;
  }
  const pt = run.points[run.pointI];
  if (!pt) return true;
  const d = Math.hypot(p.x - pt.x, p.y - pt.y);
  const radius = p.car ? 130 : 100;
  if (d >= radius) return false;
  run.pointI += 1;
  addHeat(game, -4, '');
  gainRep(game, 2, '');
  if (game.sound) game.sound.blip();
  if (run.pointI >= run.points.length) {
    // Semua checkpoint lolos: drop-off menjadi tujuan.
    run.tx = DROPOFFS[run.destDealer].x;
    run.ty = DROPOFFS[run.destDealer].y;
    run.label = `${run.fromName} → ${run.destName} (DROP-OFF)`;
    game.toast(`Semua checkpoint dilewati! Antar ke ${run.dropName}.`);
  } else {
    run.tx = run.points[run.pointI].x;
    run.ty = run.points[run.pointI].y;
    game.toast(`Checkpoint ${run.pointI}/${run.points.length} — lanjut!`);
  }
  return true;
}

// Tekanan heat: selama run hidup, heat pasar merayap naik dan polisi
// makin tajam. Kabut adalah kawan pelari.
function applyRunPressure(game, run, dt) {
  const bm = game.blackmarket;
  if (game.sky.weather === 'fog') return;
  bm.heat = clamp(bm.heat + dt * 0.25, 0, 100);
  if (bm.heat >= 85 && game.wanted < 3) addWanted(game, 1, 'Polisi mencium run selundupan');
}

// Nyaris ketangkap: menyerempet mobil interceptor tanpa tertangkap
// dihitung sebagai near miss dan membayar bonus nyali.
function checkNearMisses(game, run, dt, input) {
  if (input && game.wanted > 0) {
    const p = game.player;
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

export function stepSmuggleRun(game, dt, input) {
  const bm = game.blackmarket;
  const run = bm.run;
  if (!run) return;
  if (tickRunTimer(game, run, dt)) return;
  if (checkRunArrival(game, run)) return;
  applyRunPressure(game, run, dt);
  checkNearMisses(game, run, dt, input);
}

export function completeSmuggleRun(game) {
  const bm = game.blackmarket;
  const run = bm.run;
  if (!run) return 0;
  const elapsed = game.time - run.startedAt;
  run.finishedFast = elapsed < run.timerStart * 0.55;
  const payout = runPayout(game, run);
  // Stash kosong ke tangan pembeli; uangnya mendarat sebagai uang kotor.
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

// Penanda dunia/minimap untuk target run saat ini: checkpoint
// berikutnya, atau drop-off begitu checkpoint habis.
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

// Pemeriksaan cepat yang dipakai engine saat pemain busted atau wasted
// di tengah run: run gagal, barang tetap, heat tetap.
export function abortRunOnArrest(game) {
  if (game.blackmarket && game.blackmarket.run) {
    failSmuggleRun(game, 'Kau ditangkap di tengah run.');
  }
}

// Label checkpoint run untuk banner: "CHECKPOINT 2/4 • 38 dtk".
export function runCheckpointLabel(run) {
  if (!run || !run.points) return '';
  const at = Math.min(run.pointI + 1, run.points.length);
  const timer = typeof run.timer === 'number' ? ` • ${Math.ceil(run.timer)} dtk` : '';
  return `CHECKPOINT ${at}/${run.points.length}${timer}`;
}

// Sisa waktu run sebagai 0..1 untuk bar progres banner.
export function runTimeRatio(run, startSeconds) {
  if (!run || typeof run.timer !== 'number' || !startSeconds) return 0;
  return Math.max(0, Math.min(1, run.timer / startSeconds));
}
