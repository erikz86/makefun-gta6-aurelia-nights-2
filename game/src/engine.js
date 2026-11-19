// Engine: state game, loop fixed-step, dan semua interaksi — mencuri
// mobil, berbicara dengan kru, membeli bisnis, membuka papan heist,
// menyimpan. Scene screenshot menggerakkan stepWorld langsung dengan
// input palsu, jadi yang mereka tampilkan adalah game sungguhan.
//
// Ditulis ulang round 4b: state game dirakit dari pabrik-pabrik bagian
// (core, pemain, dunia), simpan/muat digerakkan satu deskriptor field,
// dan semua dispatch — interaksi E, tombol panel, layar — berupa tabel
// yang dicari berurutan. Alur tiap layar dipecah menjadi fase-fase
// kecil yang dijalankan berurutan di stepPlayScreen.

import { STEP, WORLD_W, WORLD_H, START_MONEY, START_CLOCK_MINUTES, ON_FOOT, WEAPONS, DISTRICTS } from './tuning.js';
import { makeRng, clamp, lerp } from './rng.js';
import { buildCity, collideCircle, clampToWorld, nearestRoadPoint } from './world.js';
import { createSky, stepSky, gripFactor, weatherNow } from './sky.js';
import { createControls } from './controls.js';
import { createSound } from './sound.js';
import { createCar, stepCar, stepTrafficCar, resolveCarWorld, carsOverlap, applyNitro, stepNitro } from './vehicles.js';
import { spawnTraffic, spawnParked, spawnPeds, stepTraffic, stepPeds, spawnDealerLookouts, spawnSmugglerVan } from './traffic.js';
import { stepLaw, stepCops, addWanted, stepMarketHeat, bribeCop } from './law.js';
import { createArsenal, tryShoot, punch, stepBullets, switchWeapon, buySmuggledAmmo } from './combat.js';
import { createEmpire, tickHourIncome, nearestProperty, buyProperty, upgradeProperty, tickLaundryWash } from './empire.js';
import { createCrewState, hireMember, nearestMember } from './crew.js';
import { createStory, startStoryMission, stepStory, startGig, stepGig, availableGigs, dialogLine, STORY, dealerFirstMeeting, nightEmpireBeat } from './story.js';
import { createBlackMarket, nearestDealer, decayHeat, buyGood, sellAllStash, launderMoney } from './blackmarket.js';
import { startSmuggleRun, stepSmuggleRun, abortRunOnArrest, cancelSmuggleRun } from './smuggling.js';
import { drawWorld } from './render.js';
import { createVisuals, stepVisuals, drawWorldFx, drawLightOverlay } from './visuals.js';
import { createMissionFx, stepMissionFx, drawMissionBeacon, drawObjectiveBanner, drawCompassStrip } from './missionfx.js';
import { drawHud, drawPanel, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSE, SCREEN_BUSINESS, SCREEN_HEIST, SCREEN_SHOP, SCREEN_BLACKMARKET, SCREEN_OVER } from './hud.js';
import { createSessionStats, stepSessionStats } from './stats.js';

const SAVE_KEY = 'aurelia2-save-v1';

// Titik-titik penting di peta yang dipakai interaksi dan step.
const SHOP_POINT = { x: 1560, y: 2360, radius: 170 };
const SAFEHOUSE_POINT = { x: 420, y: 2920, radius: 220 };

// ------------------------------------------------------------------
// State awal: dirakit dari pabrik bagian supaya tiap kelompok field
// punya satu tempat. Urutan pemanggilan di createGame menentukan
// urutan spawn (traffic, parkir, pejalan kaki, lookout, van).
// ------------------------------------------------------------------

function coreState(seed, rng, city) {
  return {
    seed,
    rng,
    city,
    cityDistricts: DISTRICTS,
    sky: createSky(START_CLOCK_MINUTES, 'rain'),
    time: 0,
    money: START_MONEY,
    wanted: 0,
    quietSeconds: 0,
    copTimer: 0,
    bustTimer: 0,
    busted: false,
    wasted: false,
    screen: SCREEN_TITLE,
    hasSave: false,
    camera: { x: 1430, y: 1370 },
  };
}

function playerState() {
  return {
    player: { x: 1430, y: 1370, angle: Math.PI / 2, health: 100, car: null, punchCooldown: 0, punchArc: 0 },
    cars: [],
    peds: [],
    bullets: [],
    toasts: [],
  };
}

function systemState() {
  return {
    empire: createEmpire(),
    crew: createCrewState(),
    story: createStory(),
    arsenal: createArsenal(),
    blackmarket: createBlackMarket(),
    nearDealer: null,
    heatTimer: 0,
    stats: { missionsDone: 0, heistsDone: 0, carsStolen: 0, smuggleRuns: 0, blackmarketProfit: 0, dealsDone: 0 },
    grip: 1,
    lastHour: Math.floor(START_CLOCK_MINUTES / 60),
    sound: createSound(),
    visuals: createVisuals(),
    missionFx: createMissionFx(),
    sessionStats: createSessionStats(),
    nearProperty: null,
    nearMember: null,
    nearShop: false,
    nearSafehouse: false,
    storeShot: false,
    _lightCanvas: null,
  };
}

export function createGame(seed = 7) {
  const rng = makeRng(seed);
  const city = buildCity(seed);
  const game = { ...coreState(seed, rng, city), ...playerState(), ...systemState() };
  game.toast = (text) => {
    game.toasts.push({ text, until: game.time + 4 });
    if (game.toasts.length > 6) game.toasts.shift();
  };
  game.dialogLine = () => dialogLine(game);
  spawnTraffic(game, 16);
  spawnParked(game, 14);
  spawnPeds(game, 26);
  spawnDealerLookouts(game);
  spawnSmugglerVan(game);
  return game;
}

// ------------------------------------------------------------------
// Simpan / muat (localStorage; loteng menjaga empire tetap aman).
//
// Satu deskriptor SAVE_FIELDS menjelaskan bentuk simpanan: tiap entri
// tahu cara membaca dari game dan cara menulis kembali. saveGame dan
// loadSave hanya menjalankan deskriptor itu — bentuk JSON simpanan
// tidak berubah, jadi simpanan lama tetap bisa dibaca.
// ------------------------------------------------------------------

const SAVE_FIELDS = [
  { key: 'money', read: (g) => g.money, write: (g, v) => { g.money = v; } },
  { key: 'missionIndex', read: (g) => g.story.index, write: (g, v) => { g.story.index = v; } },
  { key: 'player', read: (g) => ({ x: g.player.x, y: g.player.y }), write: (g, v) => { g.player.x = v.x; g.player.y = v.y; } },
  { key: 'clock', read: (g) => g.sky.clock, write: (g, v) => { g.sky.clock = v; } },
  { key: 'weather', read: (g) => g.sky.weather, write: (g, v) => { g.sky.weather = v; } },
  {
    key: 'empire',
    read: (g) => Object.fromEntries(Object.entries(g.empire.props).map(([k, p]) => [k, { owned: p.owned, level: p.level }])),
    write: (g, v) => {
      for (const [k, val] of Object.entries(v || {})) {
        if (g.empire.props[k]) { g.empire.props[k].owned = val.owned; g.empire.props[k].level = val.level; }
      }
    },
  },
  {
    key: 'crew',
    read: (g) => Object.fromEntries(Object.entries(g.crew.members).map(([k, m]) => [k, m.hired])),
    write: (g, v) => {
      for (const [k, val] of Object.entries(v || {})) {
        if (g.crew.members[k]) g.crew.members[k].hired = val;
      }
    },
  },
  {
    key: 'heists',
    read: (g) => Object.fromEntries(Object.entries(g.crew.heists).map(([k, h]) => [k, { prepDone: h.prepDone, done: h.done, times: h.times }])),
    write: (g, v) => {
      for (const [k, val] of Object.entries(v || {})) {
        if (g.crew.heists[k]) Object.assign(g.crew.heists[k], val);
      }
    },
  },
  {
    key: 'guns',
    read: (g) => Object.fromEntries(Object.entries(g.arsenal.guns).map(([k, gg]) => [k, { owned: gg.owned, ammo: gg.ammo }])),
    write: (g, v) => {
      for (const [k, val] of Object.entries(v || {})) {
        if (g.arsenal.guns[k]) Object.assign(g.arsenal.guns[k], val);
      }
    },
  },
  { key: 'stats', read: (g) => g.stats, write: (g, v) => { Object.assign(g.stats, v || {}); } },
  {
    key: 'blackmarket',
    read: (g) => {
      const bm = g.blackmarket;
      return {
        stash: bm.stash, dirtyMoney: bm.dirtyMoney, washedTotal: bm.washedTotal,
        rep: bm.rep, heat: bm.heat, dealsDone: bm.dealsDone, runsDone: bm.runsDone,
        runsFailed: bm.runsFailed, goodsSold: bm.goodsSold, profitTotal: bm.profitTotal,
        bestRunPayout: bm.bestRunPayout, dealerMet: bm.dealerMet,
      };
    },
    write: (g, v) => {
      if (!v) return;
      const bm = g.blackmarket;
      Object.assign(bm.stash, v.stash || {});
      bm.dirtyMoney = v.dirtyMoney || 0;
      bm.washedTotal = v.washedTotal || 0;
      bm.rep = v.rep || 0;
      bm.heat = v.heat || 0;
      bm.dealsDone = v.dealsDone || 0;
      bm.runsDone = v.runsDone || 0;
      bm.runsFailed = v.runsFailed || 0;
      bm.goodsSold = v.goodsSold || 0;
      bm.profitTotal = v.profitTotal || 0;
      bm.bestRunPayout = v.bestRunPayout || 0;
      bm.dealerMet = v.dealerMet || {};
      bm.run = null;
    },
  },
];

export function saveGame(game) {
  try {
    const data = {};
    for (const field of SAVE_FIELDS) data[field.key] = field.read(game);
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    game.hasSave = true;
  } catch { /* penyimpanan tidak tersedia (mode privat, grader) */ }
}

export function loadSave(game) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    for (const field of SAVE_FIELDS) {
      if (d[field.key] !== undefined) field.write(game, d[field.key]);
    }
    game.hasSave = true;
    return true;
  } catch { return false; }
}

// ------------------------------------------------------------------
// Interaksi: tombol E.
//
// Daftar INTERACTIONS dicek berurutan; yang pertama cocok yang jalan:
// keluar mobil, rekrut kru, buka panel dealer/toko, atau curi mobil.
// ------------------------------------------------------------------

function exitCar(game) {
  const p = game.player;
  const car = p.car;
  car.driver = null;
  p.car = null;
  // Turun dari mobil, ke samping searah pintu.
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  p.angle = car.angle;
  game.sound.engine(false, 0);
}

function recruitNearbyMember(game) {
  const member = nearestMember(game, 320);
  if (!member) return false;
  hireMember(game, member.id);
  return true;
}

function openDealerPanel(game) {
  const dealer = game.nearDealer;
  if (!dealer) return false;
  // Sudut dealer di malam hari: E membuka panel pasar gelap. Panel
  // itu sendiri (G) adalah jalan masuk yang tenang; E adalah yang jelas.
  game.screen = SCREEN_BLACKMARKET;
  dealerFirstMeeting(game, dealer);
  if (game.sound) game.sound.whisper();
  return true;
}

// Mobil terdekat yang bisa dicuri: bukan polisi, dalam 80 unit.
function nearestStealableCar(game) {
  let best = null;
  let bestD = 80;
  for (const car of game.cars) {
    if (car.driver === 'police') continue;
    const d = Math.hypot(car.x - game.player.x, car.y - game.player.y);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function stealNearbyCar(game) {
  const p = game.player;
  const car = nearestStealableCar(game);
  if (!car) return false;
  car.driver = 'player';
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  game.stats.carsStolen += 1;
  addWanted(game, 1, 'Mencuri mobil');
  game.sound.engine(true, 0);
  return true;
}

const INTERACTIONS = [
  { when: (game) => !!game.player.car, do: (game) => { exitCar(game); return true; } },
  { when: (game) => !!nearestMember(game, 320), do: (game) => recruitNearbyMember(game) },
  { when: (game) => !!game.nearDealer, do: (game) => openDealerPanel(game) },
  {
    when: (game) => !!game.nearShop,
    do: (game) => { game.screen = SCREEN_SHOP; return true; },
  },
  { when: () => true, do: (game) => stealNearbyCar(game) },
];

function interactE(game) {
  for (const action of INTERACTIONS) {
    if (action.when(game) && action.do(game)) return;
  }
}

// ------------------------------------------------------------------
// Tombol angka di dalam panel: beli, jual, run, cuci, beli properti,
// beli senjata — tiap panel punya aturannya sendiri.
// ------------------------------------------------------------------

function panelBlackmarketKeys(game, input) {
  const dealer = game.nearDealer;
  if (!dealer) { game.screen = SCREEN_PLAY; return; }
  // Angka membeli dari stok dealer sesuai urutan stok; angka setelah
  // stok menjual semuanya, memulai run, atau mencuci uang.
  dealer.stock.forEach((goodId, i) => {
    if (input.hit(String(i + 1))) buyGood(game, dealer, goodId, 1);
  });
  const n = dealer.stock.length;
  if (input.hit(String(n + 1))) sellAllStash(game, dealer);
  if (input.hit(String(n + 2))) {
    if (startSmuggleRun(game, dealer)) game.screen = SCREEN_PLAY;
  }
  if (input.hit(String(n + 3))) launderMoney(game);
  // Amunisi selundupan, dibeli langsung dari panel dengan tombol huruf.
  if (input.hit('j', 'J')) buySmuggledAmmo(game, 'pistol', 1);
  if (input.hit('k', 'K')) buySmuggledAmmo(game, 'shotgun', 1);
  if (input.hit('l', 'L')) buySmuggledAmmo(game, 'smg', 1);
}

function panelBusinessKeys(game, input) {
  const ids = Object.keys(game.empire.props);
  for (let i = 0; i < ids.length; i += 1) {
    if (!input.hit(String(i + 1))) continue;
    const prop = game.empire.props[ids[i]];
    const near = Math.hypot(prop.x - game.player.x, prop.y - game.player.y) < 340;
    if (!near) { game.toast(`Datangi ${prop.name} dulu untuk mengurusnya.`); continue; }
    if (!prop.owned) buyProperty(game, prop.id);
    else upgradeProperty(game, prop.id);
  }
}

function buyOrRefillGun(game, gunId, index) {
  const gun = game.arsenal.guns[gunId];
  const def = WEAPONS[gunId];
  if (!gun.owned) {
    if (game.money < def.price) { game.toast(`Uang tidak cukup: ${def.name} $${def.price}.`); return; }
    game.money -= def.price;
    gun.owned = true;
    gun.ammo += 24;
    game.toast(`${def.name} dibeli! Tekan ${index + 1} di jalan untuk memakainya.`);
    game.sound.coin();
    return;
  }
  if (game.money < def.ammoPrice) { game.toast('Uang tidak cukup untuk amunisi.'); return; }
  game.money -= def.ammoPrice;
  gun.ammo += gunId === 'shotgun' ? 12 : 48;
  game.toast(`${def.name} diisi ulang.`);
  game.sound.coin();
}

function panelShopKeys(game, input) {
  const ids = Object.keys(game.arsenal.guns);
  for (let i = 0; i < ids.length; i += 1) {
    if (input.hit(String(i + 1))) buyOrRefillGun(game, ids[i], i);
  }
}

const PANEL_KEY_HANDLERS = {
  [SCREEN_BLACKMARKET]: panelBlackmarketKeys,
  [SCREEN_BUSINESS]: panelBusinessKeys,
  [SCREEN_SHOP]: panelShopKeys,
};

function handlePanelKeys(game, input) {
  const run = PANEL_KEY_HANDLERS[game.screen];
  if (run) run(game, input);
}

// ------------------------------------------------------------------
// Gerakan pemain: mengemudi atau jalan kaki.
// ------------------------------------------------------------------

function carInputFrom(input) {
  return {
    up: input.down('w', 'ArrowUp'),
    down: input.down('s', 'ArrowDown'),
    left: input.down('a', 'ArrowLeft'),
    right: input.down('d', 'ArrowRight'),
  };
}

function stepDriving(game, input, dt) {
  const p = game.player;
  stepCar(p.car, carInputFrom(input), dt, game.grip);
  stepNitro(p.car, dt);
  if (input.hit('Shift')) {
    if (applyNitro(p.car, dt)) game.toast('NITRO! Van selundupan melesat.');
  }
  resolveCarWorld(game, p.car);
  p.x = p.car.x;
  p.y = p.car.y;
  p.angle = p.car.angle;
  game.sound.engine(true, Math.abs(p.car.speed) / p.car.top);
  if (p.car.health <= 0) {
    game.cars.splice(game.cars.indexOf(p.car), 1);
    p.car = null;
    p.health -= 25;
    game.toast('Mobilmu hancur!');
    game.sound.noise(0.5, 0.5, 700);
  }
}

function stepWalking(game, input, dt) {
  const p = game.player;
  const sprint = input.down('Shift') ? ON_FOOT.sprint : ON_FOOT.speed;
  const mx = input.moveX();
  const my = input.moveY();
  if (mx || my) {
    const len = Math.hypot(mx, my);
    p.x += (mx / len) * sprint * dt;
    p.y += (my / len) * sprint * dt;
    p.angle = Math.atan2(my, mx);
  }
  const push = collideCircle(game.city, p.x, p.y, 13);
  if (push) { p.x += push.x; p.y += push.y; }
  const c = clampToWorld(p.x, p.y, 24);
  p.x = c.x; p.y = c.y;
  game.sound.engine(false, 0);
  if (input.mouse.x !== undefined && (input.mouse.x !== 640 || input.mouse.y !== 360)) {
    // Hadap kursor saat diam dan membidik.
    if (!mx && !my) p.angle = Math.atan2(game.camera.y + input.mouse.y - 360 - p.y, game.camera.x + input.mouse.x - 640 - p.x);
  }
}

// Benturan antar mobil: dorong berlawanan arah, remukkan kecepatan
// bila salah satunya mobil pemain.
function pushCarsApart(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const push = 26 - d / 2;
  a.x -= (dx / d) * push * 0.5;
  a.y -= (dy / d) * push * 0.5;
  b.x += (dx / d) * push * 0.5;
  b.y += (dy / d) * push * 0.5;
  if (a.driver === 'player' || b.driver === 'player') {
    a.speed *= 0.92;
    b.speed *= 0.92;
  }
}

function resolveCarBumps(game) {
  for (let i = 0; i < game.cars.length; i += 1) {
    for (let j = i + 1; j < game.cars.length; j += 1) {
      const a = game.cars[i];
      const b = game.cars[j];
      if (carsOverlap(a, b)) pushCarsApart(a, b);
    }
  }
}

// ------------------------------------------------------------------
// Step tetap: semua yang terjadi dalam 1/60 detik waktu game.
// stepPlayScreen dipecah menjadi fase: tombol, gerakan, simulasi
// dunia, lalu pemeriksaan akhir (tertangkap / tewas).
// ------------------------------------------------------------------

function playGlobalKeys(game, input) {
  const p = game.player;
  if (input.hit('p', 'P', 'Escape')) { game.screen = SCREEN_PAUSE; saveGame(game); }
  if (input.hit('m', 'M')) { game.sound.muted = !game.sound.muted; game.toast(game.sound.muted ? 'Suara mati.' : 'Suara hidup.'); }
  if (input.hit('b', 'B')) game.screen = SCREEN_BUSINESS;
  if (input.hit('h', 'H') && game.nearSafehouse) game.screen = SCREEN_HEIST;
  // Pasar gelap: G membuka panel dealer di sudut dealer; Y menyuap
  // satu bintang wanted dengan uang bersih; X membatalkan run.
  if (input.hit('g', 'G') && game.nearDealer) {
    game.screen = SCREEN_BLACKMARKET;
    dealerFirstMeeting(game, game.nearDealer);
    if (game.sound) game.sound.whisper();
  }
  if (input.hit('y', 'Y') && game.wanted > 0) bribeCop(game);
  if (input.hit('x', 'X') && game.blackmarket.run) cancelSmuggleRun(game);
  if (input.hit('f', 'F')) {
    if (!game.story.active && !game.story.gig) {
      if (game.story.index < STORY.length) startStoryMission(game, game.story.index);
      else {
        const gigs = availableGigs(game);
        startGig(game, gigs[Math.floor(game.rng() * gigs.length)]);
      }
    }
  }
  if (input.hit('e', 'E')) interactE(game);
  if (input.hit('1')) switchWeapon(game.arsenal, 'pistol');
  if (input.hit('2')) switchWeapon(game.arsenal, 'shotgun');
  if (input.hit('3')) switchWeapon(game.arsenal, 'smg');
  if (input.down(' ') || input.hit(' ')) punch(game);
  if (input.mouse.clicked && !p.car) {
    const wx = game.camera.x + input.mouse.x - 640;
    const wy = game.camera.y + input.mouse.y - 360;
    p.angle = Math.atan2(wy - p.y, wx - p.x);
    tryShoot(game, wx, wy);
  }
}

function playMovement(game, input, dt) {
  const p = game.player;
  if (p.car) stepDriving(game, input, dt);
  else stepWalking(game, input, dt);
  resolveCarBumps(game);
  // Bangkai menghilang (truk misi tetap sampai tugasnya selesai).
  game.cars = game.cars.filter((c) => c.health > 0 || c.driver === 'player' || c.missionTruck);
}

function playWorldSim(game, input, dt) {
  for (const car of game.cars) {
    if (car.driver === 'traffic') stepTrafficCar(game, car, dt);
  }
  stepTraffic(game, dt);
  stepPeds(game, dt);
  stepLaw(game, dt);
  stepCops(game, dt);
  stepBullets(game, dt);
  stepStory(game, dt, input);
  stepGig(game, dt, input);
  // Ekonomi malam berdetak bersama cerita: run maju, heat pasar
  // mendingin, dan heat yang panas memanggil patroli sendiri.
  stepSmuggleRun(game, dt, input);
  decayHeat(game, dt);
  stepMarketHeat(game, dt);
  nightEmpireBeat(game);
  // Guntur menggelegar saat kilat menyambar.
  if (game.sky.lightning > 0.95 && game.sound.ctx) game.sound.thunder();
  // Suara hujan mengikuti cuaca.
  const w = weatherNow(game.sky);
  game.sound.setRain(w.rain > 0, w.rain === 2);
}

function playCameraAndToasts(game, dt) {
  const p = game.player;
  // Kamera mengikuti pemain dengan halus.
  game.camera.x = lerp(game.camera.x, p.x, 1 - Math.pow(0.001, dt));
  game.camera.y = lerp(game.camera.y, p.y, 1 - Math.pow(0.001, dt));
  // Toast kedaluwarsa.
  game.toasts = game.toasts.filter((t) => t.until > game.time);
}

function playEndCheck(game) {
  const p = game.player;
  if (!game.busted && !game.wasted && p.health > 0) return;
  if (p.health <= 0) game.wasted = true;
  abortRunOnArrest(game);
  game.screen = SCREEN_OVER;
  game.sound.busted();
  game.sound.engine(false, 0);
  const loss = Math.min(400, Math.floor(game.money * 0.15));
  game.money -= loss;
  saveGame(game);
}

function stepPlayScreen(game, input, dt) {
  playGlobalKeys(game, input);
  playMovement(game, input, dt);
  playWorldSim(game, input, dt);
  playCameraAndToasts(game, dt);
  playEndCheck(game);
}

function stepTitleScreen(game, input, dt) {
  // Kota hidup di balik judul: traffic melaju, orang berjalan.
  stepTraffic(game, dt);
  stepPeds(game, dt);
  for (const car of game.cars) {
    if (car.driver === 'traffic') stepTrafficCar(game, car, dt);
  }
  game.camera.x = 1430 + Math.sin(game.time * 0.05) * 500;
  game.camera.y = 1370 + Math.cos(game.time * 0.04) * 300;
  if (input.hit('Enter') || input.mouse.clicked) {
    game.sound.ensure();
    game.screen = SCREEN_PLAY;
    if (game.hasSave) loadSave(game);
  }
  if (input.hit('n', 'N')) {
    game.sound.ensure();
    try { localStorage.removeItem(SAVE_KEY); } catch { /* abaikan */ }
    game.screen = SCREEN_PLAY;
  }
}

function stepPauseScreen(game, input) {
  if (input.hit('p', 'P', 'Escape')) game.screen = SCREEN_PLAY;
  if (input.hit('r', 'R')) { loadSave(game); game.screen = SCREEN_PLAY; game.toast('Simpanan dimuat.'); }
  if (input.hit('n', 'N')) {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* abaikan */ }
    const fresh = createGame(game.seed);
    Object.assign(game, fresh);
    game.screen = SCREEN_PLAY;
  }
}

function stepOverScreen(game, input) {
  if (input.hit('Enter')) {
    loadSave(game);
    game.player.health = 100;
    game.player.x = SAFEHOUSE_POINT.x;
    game.player.y = SAFEHOUSE_POINT.y;
    game.player.car = null;
    game.wanted = 0;
    game.busted = false;
    game.wasted = false;
    game.screen = SCREEN_PLAY;
  }
}

// Layar panel (bisnis, heist, toko, pasar gelap) berbagi satu langkah:
// tombol angka panel, lalu tombol keluar kembali ke permainan.
function stepPanelScreen(game, input, dt) {
  handlePanelKeys(game, input);
  if (input.hit('b', 'B', 'h', 'H', 'e', 'E', 'g', 'G', 'Escape')) game.screen = SCREEN_PLAY;
}

const SCREEN_STEPS = {
  [SCREEN_PLAY]: stepPlayScreen,
  [SCREEN_TITLE]: stepTitleScreen,
  [SCREEN_PAUSE]: stepPauseScreen,
  [SCREEN_BUSINESS]: stepPanelScreen,
  [SCREEN_HEIST]: stepPanelScreen,
  [SCREEN_SHOP]: stepPanelScreen,
  [SCREEN_BLACKMARKET]: stepPanelScreen,
  [SCREEN_OVER]: stepOverScreen,
};

export function stepWorld(game, input, dt) {
  game.time += dt;
  game.grip = gripFactor(game.sky);
  stepSky(game.sky, dt, game.rng);
  stepVisuals(game, input, dt);
  stepMissionFx(game, dt);

  // Batas jam: empire membayar, dan laundry mencuci sepotong uang
  // kotor yang sedang menunggu.
  const hour = Math.floor(game.sky.clock / 60);
  if (hour !== game.lastHour) {
    game.lastHour = hour;
    tickHourIncome(game);
    const washed = tickLaundryWash(game);
    if (washed > 0) game.toast(`Kilau Laundry mencuci $${washed} semalam.`);
  }

  // Flag kedekatan yang dibaca HUD dan tombol E.
  game.nearProperty = nearestProperty(game, 320);
  game.nearMember = nearestMember(game, 320);
  game.nearDealer = nearestDealer(game, 320);
  game.nearShop = Math.hypot(game.player.x - SHOP_POINT.x, game.player.y - SHOP_POINT.y) < SHOP_POINT.radius;
  game.nearSafehouse = Math.hypot(game.player.x - SAFEHOUSE_POINT.x, game.player.y - SAFEHOUSE_POINT.y) < SAFEHOUSE_POINT.radius;

  const run = SCREEN_STEPS[game.screen];
  if (run) run(game, input, dt);
  stepSessionStats(game, dt);
}

export function renderGame(game, ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  drawWorld(game, ctx, W, H);
  drawWorldFx(game, ctx, W, H);
  drawMissionBeacon(game, ctx, W, H);
  drawLightOverlay(game, ctx, W, H);
  if (game.screen !== SCREEN_TITLE) {
    drawHud(game, ctx, W, H);
    drawObjectiveBanner(game, ctx, W, H);
    drawCompassStrip(game, ctx, W, H);
  }
  drawPanel(game, ctx, W, H);
}

// ------------------------------------------------------------------
// Titik masuk browser: loop rAF dengan akumulator fixed-step.
// ------------------------------------------------------------------

// Mode screenshot: susun satu scene, jalankan, gambar satu frame.
function runShotMode(game, ctx, canvas, shot) {
  import('./shots.js').then(({ stageShot, setStepWorld }) => {
    setStepWorld(stepWorld);
    stageShot(shot, game);
    renderGame(game, ctx, canvas.width, canvas.height);
    window.__shotReady = true;
  });
}

function runFrameLoop(game, input, ctx, canvas) {
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= STEP) {
      stepWorld(game, input, STEP);
      acc -= STEP;
    }
    input.endStep();
    renderGame(game, ctx, canvas.width, canvas.height);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

export function startBrowserGame(canvas) {
  const ctx = canvas.getContext('2d');
  const game = createGame(7);
  // Kait debug baca-saja untuk uji headless (tanpa ini, tes otomatis
  // hanya bisa melihat kanvas, bukan state misi/statistik).
  window.__game = game;
  game.hasSave = (() => {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  })();
  loadSave(game);
  // Terapkan lagi jam/cuaca dari simpanan, tapi mulai dari layar judul.
  game.screen = SCREEN_TITLE;
  const input = createControls();
  input.attach(canvas);
  canvas.addEventListener('mousedown', () => game.sound.ensure());
  window.addEventListener('keydown', () => game.sound.ensure(), { once: true });

  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    runShotMode(game, ctx, canvas, shot);
    return game;
  }
  runFrameLoop(game, input, ctx, canvas);
  return game;
}
