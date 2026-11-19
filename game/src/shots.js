// The four screenshot scenes behind ?shot=start|heist|empire|storm. Each one
// sets up a real game state — a wanted level, a heist in progress, an
// empire that pays — then plays the real rules forward for a fixed number
// of steps, steered by a small autopilot, so the frame is what a short
// game really looks like and the same seed always gives the same frame.

import { STEP } from './tuning.js';
import { createCar } from './vehicles.js';
import { spawnCop, addWanted } from './law.js';
import { createAutoControls } from './controls.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_BUSINESS } from './hud.js';

function runSteps(game, stepWorld, auto, seconds, steer) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (steer) steer();
    stepWorld(game, auto, STEP);
  }
}

function autopilotDrive(game, auto, target) {
  const car = game.player.car;
  if (!car) return;
  const wantAngle = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  auto.st.up = true;
  auto.st.down = false;
  auto.st.left = diff < -0.08;
  auto.st.right = diff > 0.08;
}

function autopilotWalk(game, auto, target) {
  const p = game.player;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  auto.mx = Math.abs(dx) > 14 ? Math.sign(dx) : 0;
  auto.my = Math.abs(dy) > 14 ? Math.sign(dy) : 0;
}

function putPlayerInCar(game, x, y, angle, colour) {
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

/**
 * Set `game` to the named scene and return the screen to draw over it.
 * Called by the engine when the page loads with ?shot=<name>.
 */
export function stageShot(name, game) {
  const auto = createAutoControls();
  game.screen = SCREEN_PLAY;

  if (name === 'heist') {
    // Mid-heist at Permata Row: one case left, wanted 3, rain at night.
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
    // The night economy is already warm: a half-full stash, dirty
    // money waiting for the laundry, and heat the HUD shows.
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
    runSteps(game, stepWorldRef, auto, 4, () => autopilotWalk(game, auto, { x: 2900, y: 1000 }));
    return { screen: SCREEN_PLAY };
  }

  if (name === 'empire') {
    // The business panel at the Neon Tide, late at night, empire thriving.
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
    game.story.index = 6; // story arc done: free roam with the empire
    // Empire shot, night-economy edition: the laundry washes, the
    // stash is full, and Zara's reputation tier is unlocked.
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
    runSteps(game, stepWorldRef, auto, 2, null);
    game.screen = SCREEN_BUSINESS;
    return { screen: SCREEN_BUSINESS };
  }

  if (name === 'storm') {
    // A storm chase down the avenues: wanted 4, cops behind, lightning.
    game.sky.clock = 23 * 60 + 10;
    game.sky.weather = 'storm';
    game.sky.weatherHoursLeft = 3;
    game.sky.lightning = 0.7;
    game.money = 18200;
    game.crew.members.lena.hired = true;
    game.story.index = 5;
    putPlayerInCar(game, 2120, 1150, Math.PI / 2, '#8e44ad');
    addWanted(game, 4, '');
    spawnCop(game);
    spawnCop(game);
    spawnCop(game);
    game.story.active = {
      id: 'vault', title: 'Grand Vault', brief: 'Brankas kasino.',
      step: 2, crack: 12, tx: 300, ty: 3050,
      objective: 'Kabur ke pelabuhan tua — badai menutupi jejakmu!',
    };
    runSteps(game, stepWorldRef, auto, 7, () => autopilotDrive(game, auto, { x: 2120, y: 2900 }));
    return { screen: SCREEN_PLAY };
  }

  // start: the title screen over a living, rainy Neon Mile at dusk.
  game.sky.clock = 20 * 60 + 40;
  game.sky.weather = 'rain';
  game.sky.weatherHoursLeft = 4;
  game.player.x = 3300;
  game.player.y = 1700;
  game.camera.x = 3300;
  game.camera.y = 1700;
  game.screen = SCREEN_TITLE;
  runSteps(game, stepWorldRef, auto, 6, null);
  return { screen: SCREEN_TITLE };
}

// stepWorld is imported lazily to avoid a cycle: engine imports shots,
// shots needs stepWorld from engine.
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
