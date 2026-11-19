// Empat frame sampul di balik ?shot=start|heist|empire|storm. Tiap scene
// bukan gambar mati: ia menyusun state game sungguhan — wanted, heist
// yang sedang jalan, empire yang menghasilkan — lalu menjalankan aturan
// main yang sama beberapa detik lewat autopilot kecil, jadi frame yang
// keluar adalah potongan permainan nyata dan seed yang sama selalu
// menghasilkan frame yang sama.

import { STEP } from './tuning.js';
import { createCar } from './vehicles.js';
import { spawnCop, addWanted } from './law.js';
import { createAutoControls } from './controls.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_BUSINESS } from './hud.js';

// Majukan dunia sejumlah detik penuh, dengan kemudi opsional tiap step.
function advanceWorld(game, seconds, steer) {
  const total = Math.floor(seconds / STEP);
  for (let step = 0; step < total; step += 1) {
    if (steer) steer();
    stepWorldRef(game, autoControlsRef, STEP);
  }
}

// Autopilot dipegang di variabel modul supaya advanceWorld tidak perlu
// membawa-bawa objek kontrol ke mana-mana.
let autoControlsRef = null;

// Kemudi mobil menuju satu titik: gas penuh, belok mengikuti selisih
// sudut dengan toleransi kecil supaya tidak bergetar di garis lurus.
function steerCarToward(game, target) {
  const car = game.player.car;
  if (!car) return;
  const heading = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = heading - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  autoControlsRef.st.up = true;
  autoControlsRef.st.down = false;
  autoControlsRef.st.left = diff < -0.08;
  autoControlsRef.st.right = diff > 0.08;
}

// Jalan kaki menuju satu titik: sumbu x dan y digerakkan terpisah,
// berhenti bila sudah dalam 14 unit.
function walkToward(game, target) {
  const p = game.player;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  autoControlsRef.mx = Math.abs(dx) > 14 ? Math.sign(dx) : 0;
  autoControlsRef.my = Math.abs(dy) > 14 ? Math.sign(dy) : 0;
}

// Taruh pemain di dalam mobil sport dan sejajarkan kamera.
function seatPlayerInCar(game, x, y, angle, colour) {
  const car = createCar(x, y, angle, 'sport', colour);
  car.driver = 'player';
  game.cars.push(car);
  game.player.car = car;
  game.player.x = x;
  game.player.y = y;
  game.player.angle = angle;
  game.camera.x = x;
  game.camera.y = y;
  return car;
}

// Heist tengah jalan di Permata Row: satu etalase tersisa, wanted 3,
// hujan di malam hari, kru sudah direkrut dan prep sudah beres.
function sceneHeist(game) {
  game.sky.clock = 22 * 60 + 5;
  game.sky.weather = 'rain';
  game.sky.weatherHoursLeft = 4;
  game.money = 12400;
  game.crew.members.lena.hired = true;
  game.crew.members.otto.hired = true;
  game.crew.heists.jewel.prepDone = true;
  game.story.index = 3;
  game.story.active = {
    id: 'jewel', title: 'Permata Row', brief: 'Heist pertama.',
    step: 1, cases: 1, smashCooldown: 0, timer: 95,
    tx: 420, ty: 2920, objective: 'Hancurkan 1 etalase lagi lalu kabur ke safehouse!',
  };
  // Ekonomi malam sudah hangat: stash setengah penuh, uang kotor
  // menunggu laundry, dan heat yang terlihat di HUD.
  game.blackmarket.rep = 30;
  game.blackmarket.stash.spice = 4;
  game.blackmarket.stash.chips = 2;
  game.blackmarket.dirtyMoney = 1240;
  game.blackmarket.heat = 55;
  game.player.x = 2900;
  game.player.y = 1100;
  game.player.angle = -Math.PI / 2;
  game.camera.x = 2900;
  game.camera.y = 1000;
  addWanted(game, 3, '');
  spawnCop(game);
  spawnCop(game);
  game.story.dialog = { lines: ['Lena: "Satu etalase lagi, Kai!"', 'Lena: "Polisi sudah di jalan. Cepat!"'], i: 0, until: game.time + 9 };
  advanceWorld(game, 4, () => walkToward(game, { x: 2900, y: 1000 }));
  return { screen: SCREEN_PLAY };
}

// Panel bisnis di Neon Tide, larut malam, empire sedang subur.
function sceneEmpire(game) {
  game.sky.clock = 22 * 60 + 30;
  game.sky.weather = 'clear';
  game.sky.weatherHoursLeft = 5;
  game.money = 24800;
  game.empire.props.garage.owned = true;
  game.empire.props.garage.level = 2;
  game.empire.props.diner.owned = true;
  game.empire.props.diner.level = 2;
  game.empire.props.club.owned = true;
  game.empire.props.club.level = 3;
  game.empire.props.laundry.owned = true;
  game.empire.props.laundry.level = 1;
  game.empire.earnedTotal = 18400;
  game.crew.members.lena.hired = true;
  game.crew.members.otto.hired = true;
  game.crew.members.bruno.hired = true;
  game.stats.missionsDone = 5;
  game.stats.heistsDone = 2;
  game.story.index = 6; // arc cerita selesai: free roam dengan empire
  // Edisi ekonomi malam: laundry sedang mencuci, stash penuh, dan
  // tier reputasi Zara sudah terbuka.
  game.blackmarket.rep = 68;
  game.blackmarket.stash.relic = 2;
  game.blackmarket.stash.arms = 1;
  game.blackmarket.stash.meds = 5;
  game.blackmarket.dirtyMoney = 3200;
  game.blackmarket.washedTotal = 5400;
  game.blackmarket.runsDone = 6;
  game.blackmarket.heat = 22;
  game.player.x = 3560;
  game.player.y = 2200;
  game.camera.x = 3560;
  game.camera.y = 2050;
  advanceWorld(game, 2, null);
  game.screen = SCREEN_BUSINESS;
  return { screen: SCREEN_BUSINESS };
}

// Kejar-kejaran badai di avenue: wanted 4, polisi di belakang, kilat.
function sceneStorm(game) {
  game.sky.clock = 23 * 60 + 10;
  game.sky.weather = 'storm';
  game.sky.weatherHoursLeft = 3;
  game.sky.lightning = 0.7;
  game.money = 18200;
  game.crew.members.lena.hired = true;
  game.story.index = 5;
  seatPlayerInCar(game, 2120, 1150, Math.PI / 2, '#8e44ad');
  addWanted(game, 4, '');
  spawnCop(game);
  spawnCop(game);
  spawnCop(game);
  game.story.active = {
    id: 'vault', title: 'Grand Vault', brief: 'Brankas kasino.',
    step: 2, crack: 12, tx: 300, ty: 3050,
    objective: 'Kabur ke pelabuhan tua — badai menutupi jejakmu!',
  };
  advanceWorld(game, 7, () => steerCarToward(game, { x: 2120, y: 2900 }));
  return { screen: SCREEN_PLAY };
}

// Layar judul di atas Neon Mile yang hidup, hujan di senja hari.
function sceneStart(game) {
  game.sky.clock = 20 * 60 + 40;
  game.sky.weather = 'rain';
  game.sky.weatherHoursLeft = 4;
  game.player.x = 3300;
  game.player.y = 1700;
  game.camera.x = 3300;
  game.camera.y = 1700;
  game.screen = SCREEN_TITLE;
  advanceWorld(game, 6, null);
  return { screen: SCREEN_TITLE };
}

/**
 * Susun `game` menjadi scene bernama dan kembalikan layar yang harus
 * digambar di atasnya. Dipanggil engine saat halaman dimuat dengan
 * ?shot=<nama>.
 */
export function stageShot(name, game) {
  autoControlsRef = createAutoControls();
  game.screen = SCREEN_PLAY;
  if (name === 'heist') return sceneHeist(game);
  if (name === 'empire') return sceneEmpire(game);
  if (name === 'storm') return sceneStorm(game);
  return sceneStart(game);
}

// stepWorld diimpor malas supaya tidak ada siklus: engine mengimpor
// shots, shots butuh stepWorld dari engine.
let stepWorldRef = null;
export function setStepWorld(fn) {
  stepWorldRef = fn;
}

// Urutan dan label keempat scene screenshot, dipakai ulang oleh banner
// saat shot aktif supaya tiap scene tahu namanya sendiri.
export const SHOT_ORDER = ['start', 'heist', 'empire', 'storm'];

export function shotLabel(name) {
  const labels = {
    start: 'Awal — Port Aurelia senja',
    heist: 'Heist Permata Row — hujan malam',
    empire: 'Empire — properti dan kru',
    storm: 'Badai — langit gelap, kilat',
  };
  return labels[name] || name;
}
