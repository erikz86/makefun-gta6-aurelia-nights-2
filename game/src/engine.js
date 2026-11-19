// The engine: the game state, the fixed-step loop, and every interaction
// — stealing cars, talking to the crew, buying businesses, opening the
// heist board, saving. The screenshot scenes drive stepWorld directly
// with a fake input, so what they show is the real game.

import { STEP, WORLD_W, WORLD_H, START_MONEY, START_CLOCK_MINUTES, ON_FOOT, WEAPONS } from './tuning.js';
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
import { drawHud, drawPanel, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSE, SCREEN_BUSINESS, SCREEN_HEIST, SCREEN_SHOP, SCREEN_BLACKMARKET, SCREEN_OVER } from './hud.js';
import { DISTRICTS } from './tuning.js';

const SAVE_KEY = 'aurelia2-save-v1';

export function createGame(seed = 7) {
  const rng = makeRng(seed);
  const city = buildCity(seed);
  const game = {
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
    player: { x: 1430, y: 1370, angle: Math.PI / 2, health: 100, car: null, punchCooldown: 0, punchArc: 0 },
    cars: [],
    peds: [],
    bullets: [],
    toasts: [],
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
    nearProperty: null,
    nearMember: null,
    nearShop: false,
    nearSafehouse: false,
    storeShot: false,
    _lightCanvas: null,
  };
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

// ---- Save / load (localStorage; the loteng keeps your empire safe). ----

export function saveGame(game) {
  try {
    const data = {
      money: game.money,
      missionIndex: game.story.index,
      player: { x: game.player.x, y: game.player.y },
      clock: game.sky.clock,
      weather: game.sky.weather,
      empire: Object.fromEntries(Object.entries(game.empire.props).map(([k, p]) => [k, { owned: p.owned, level: p.level }])),
      crew: Object.fromEntries(Object.entries(game.crew.members).map(([k, m]) => [k, m.hired])),
      heists: Object.fromEntries(Object.entries(game.crew.heists).map(([k, h]) => [k, { prepDone: h.prepDone, done: h.done, times: h.times }])),
      guns: Object.fromEntries(Object.entries(game.arsenal.guns).map(([k, g]) => [k, { owned: g.owned, ammo: g.ammo }])),
      stats: game.stats,
      blackmarket: {
        stash: game.blackmarket.stash,
        dirtyMoney: game.blackmarket.dirtyMoney,
        washedTotal: game.blackmarket.washedTotal,
        rep: game.blackmarket.rep,
        heat: game.blackmarket.heat,
        dealsDone: game.blackmarket.dealsDone,
        runsDone: game.blackmarket.runsDone,
        runsFailed: game.blackmarket.runsFailed,
        goodsSold: game.blackmarket.goodsSold,
        profitTotal: game.blackmarket.profitTotal,
        bestRunPayout: game.blackmarket.bestRunPayout,
        dealerMet: game.blackmarket.dealerMet,
      },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    game.hasSave = true;
  } catch { /* storage unavailable (private mode, grader) */ }
}

export function loadSave(game) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    game.money = d.money;
    game.story.index = d.missionIndex;
    game.player.x = d.player.x;
    game.player.y = d.player.y;
    game.sky.clock = d.clock;
    game.sky.weather = d.weather;
    for (const [k, v] of Object.entries(d.empire || {})) {
      if (game.empire.props[k]) { game.empire.props[k].owned = v.owned; game.empire.props[k].level = v.level; }
    }
    for (const [k, v] of Object.entries(d.crew || {})) {
      if (game.crew.members[k]) game.crew.members[k].hired = v;
    }
    for (const [k, v] of Object.entries(d.heists || {})) {
      if (game.crew.heists[k]) Object.assign(game.crew.heists[k], v);
    }
    for (const [k, v] of Object.entries(d.guns || {})) {
      if (game.arsenal.guns[k]) Object.assign(game.arsenal.guns[k], v);
    }
    Object.assign(game.stats, d.stats || {});
    if (d.blackmarket) {
      const bm = game.blackmarket;
      Object.assign(bm.stash, d.blackmarket.stash || {});
      bm.dirtyMoney = d.blackmarket.dirtyMoney || 0;
      bm.washedTotal = d.blackmarket.washedTotal || 0;
      bm.rep = d.blackmarket.rep || 0;
      bm.heat = d.blackmarket.heat || 0;
      bm.dealsDone = d.blackmarket.dealsDone || 0;
      bm.runsDone = d.blackmarket.runsDone || 0;
      bm.runsFailed = d.blackmarket.runsFailed || 0;
      bm.goodsSold = d.blackmarket.goodsSold || 0;
      bm.profitTotal = d.blackmarket.profitTotal || 0;
      bm.bestRunPayout = d.blackmarket.bestRunPayout || 0;
      bm.dealerMet = d.blackmarket.dealerMet || {};
      bm.run = null;
    }
    game.hasSave = true;
    return true;
  } catch { return false; }
}

// ---- Interactions ----

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

function interactE(game) {
  const p = game.player;
  if (p.car) {
    // Step out of the car.
    const car = p.car;
    car.driver = null;
    p.car = null;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    p.angle = car.angle;
    game.sound.engine(false, 0);
    return;
  }
  const member = nearestMember(game, 320);
  if (member) {
    hireMember(game, member.id);
    return;
  }
  // A dealer corner at night: E opens the black-market panel. The
  // panel itself (G) is the quiet way in; E is the obvious one.
  if (game.nearDealer) {
    const dealer = game.nearDealer;
    game.screen = SCREEN_BLACKMARKET;
    dealerFirstMeeting(game, dealer);
    if (game.sound) game.sound.whisper();
    return;
  }
  if (game.nearShop) {
    game.screen = SCREEN_SHOP;
    return;
  }
  const car = nearestStealableCar(game);
  if (car) {
    car.driver = 'player';
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    game.stats.carsStolen += 1;
    addWanted(game, 1, 'Mencuri mobil');
    game.sound.engine(true, 0);
  }
}

function handlePanelKeys(game, input) {
  if (game.screen === SCREEN_BLACKMARKET) {
    const dealer = game.nearDealer;
    if (!dealer) { game.screen = SCREEN_PLAY; return; }
    // Number keys buy from the dealer's stock, in stock order; the
    // keys after the stock sell everything, start a run, or wash money.
    dealer.stock.forEach((goodId, i) => {
      if (input.hit(String(i + 1))) buyGood(game, dealer, goodId, 1);
    });
    const n = dealer.stock.length;
    if (input.hit(String(n + 1))) sellAllStash(game, dealer);
    if (input.hit(String(n + 2))) {
      if (startSmuggleRun(game, dealer)) game.screen = SCREEN_PLAY;
    }
    if (input.hit(String(n + 3))) launderMoney(game);
    // Smuggled ammo, bought straight from the panel by letter key.
    if (input.hit('j', 'J')) buySmuggledAmmo(game, 'pistol', 1);
    if (input.hit('k', 'K')) buySmuggledAmmo(game, 'shotgun', 1);
    if (input.hit('l', 'L')) buySmuggledAmmo(game, 'smg', 1);
    return;
  }
  if (game.screen === SCREEN_BUSINESS) {
    const ids = Object.keys(game.empire.props);
    for (let i = 0; i < ids.length; i += 1) {
      if (input.hit(String(i + 1))) {
        const prop = game.empire.props[ids[i]];
        const near = Math.hypot(prop.x - game.player.x, prop.y - game.player.y) < 340;
        if (!near) { game.toast(`Datangi ${prop.name} dulu untuk mengurusnya.`); continue; }
        if (!prop.owned) buyProperty(game, prop.id);
        else upgradeProperty(game, prop.id);
      }
    }
    return;
  }
  if (game.screen === SCREEN_SHOP) {
    const ids = Object.keys(game.arsenal.guns);
    for (let i = 0; i < ids.length; i += 1) {
      if (input.hit(String(i + 1))) {
        const gun = game.arsenal.guns[ids[i]];
        const def = WEAPONS[ids[i]];
        if (!gun.owned) {
          if (game.money < def.price) { game.toast(`Uang tidak cukup: ${def.name} $${def.price}.`); continue; }
          game.money -= def.price;
          gun.owned = true;
          gun.ammo += 24;
          game.toast(`${def.name} dibeli! Tekan ${i + 1} di jalan untuk memakainya.`);
          game.sound.coin();
        } else {
          if (game.money < def.ammoPrice) { game.toast('Uang tidak cukup untuk amunisi.'); continue; }
          game.money -= def.ammoPrice;
          gun.ammo += ids[i] === 'shotgun' ? 12 : 48;
          game.toast(`${def.name} diisi ulang.`);
          game.sound.coin();
        }
      }
    }
  }
}

// ---- The fixed step: everything that happens in 1/60s of game time. ----

export function stepWorld(game, input, dt) {
  game.time += dt;
  game.grip = gripFactor(game.sky);
  stepSky(game.sky, dt, game.rng);

  // Hour boundary: the empire pays, and the laundry washes a slice
  // of whatever dirty money is waiting.
  const hour = Math.floor(game.sky.clock / 60);
  if (hour !== game.lastHour) {
    game.lastHour = hour;
    tickHourIncome(game);
    const washed = tickLaundryWash(game);
    if (washed > 0) game.toast(`Kilau Laundry mencuci $${washed} semalam.`);
  }

  // Proximity flags the HUD and the E key read.
  game.nearProperty = nearestProperty(game, 320);
  game.nearMember = nearestMember(game, 320);
  game.nearDealer = nearestDealer(game, 320);
  game.nearShop = Math.hypot(game.player.x - 1560, game.player.y - 2360) < 170;
  game.nearSafehouse = Math.hypot(game.player.x - 420, game.player.y - 2920) < 220;

  if (game.screen === SCREEN_PLAY) {
    const p = game.player;
    // Global keys.
    if (input.hit('p', 'P', 'Escape')) { game.screen = SCREEN_PAUSE; saveGame(game); }
    if (input.hit('m', 'M')) { game.sound.muted = !game.sound.muted; game.toast(game.sound.muted ? 'Suara mati.' : 'Suara hidup.'); }
    if (input.hit('b', 'B')) game.screen = SCREEN_BUSINESS;
    if (input.hit('h', 'H') && game.nearSafehouse) game.screen = SCREEN_HEIST;
    // Black market: G opens the dealer panel at a dealer corner;
    // Y bribes one wanted star away with clean money; X cancels a run.
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

    // Movement.
    if (p.car) {
      const carInput = {
        up: input.down('w', 'ArrowUp'),
        down: input.down('s', 'ArrowDown'),
        left: input.down('a', 'ArrowLeft'),
        right: input.down('d', 'ArrowRight'),
      };
      stepCar(p.car, carInput, dt, game.grip);
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
    } else {
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
        // Face the cursor when standing still and aiming.
        if (!mx && !my) p.angle = Math.atan2(game.camera.y + input.mouse.y - 360 - p.y, game.camera.x + input.mouse.x - 640 - p.x);
      }
    }

    // Car-vs-car bumps.
    for (let i = 0; i < game.cars.length; i += 1) {
      for (let j = i + 1; j < game.cars.length; j += 1) {
        const a = game.cars[i];
        const b = game.cars[j];
        if (carsOverlap(a, b)) {
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
      }
    }
    // Wrecks disappear (mission trucks stay put until their job is done).
    game.cars = game.cars.filter((c) => c.health > 0 || c.driver === 'player' || c.missionTruck);

    // Traffic, peds, cops, bullets, story.
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
    // The night economy ticks alongside the story: runs advance,
    // market heat cools, and hot heat calls patrols on its own.
    stepSmuggleRun(game, dt, input);
    decayHeat(game, dt);
    stepMarketHeat(game, dt);
    nightEmpireBeat(game);

    // Thunder cracks when the lightning flashes.
    if (game.sky.lightning > 0.95 && game.sound.ctx) game.sound.thunder();
    // Rain sound follows the weather.
    const w = weatherNow(game.sky);
    game.sound.setRain(w.rain > 0, w.rain === 2);

    // Camera follows the player, smoothly.
    game.camera.x = lerp(game.camera.x, p.x, 1 - Math.pow(0.001, dt));
    game.camera.y = lerp(game.camera.y, p.y, 1 - Math.pow(0.001, dt));

    // Toasts expire.
    game.toasts = game.toasts.filter((t) => t.until > game.time);

    if (game.busted || game.wasted || p.health <= 0) {
      if (p.health <= 0) game.wasted = true;
      abortRunOnArrest(game);
      game.screen = SCREEN_OVER;
      game.sound.busted();
      game.sound.engine(false, 0);
      const loss = Math.min(400, Math.floor(game.money * 0.15));
      game.money -= loss;
      saveGame(game);
    }
  } else if (game.screen === SCREEN_TITLE) {
    // The city lives behind the title: traffic rolls, people walk.
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
      try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      game.screen = SCREEN_PLAY;
    }
  } else if (game.screen === SCREEN_PAUSE) {
    if (input.hit('p', 'P', 'Escape')) game.screen = SCREEN_PLAY;
    if (input.hit('r', 'R')) { loadSave(game); game.screen = SCREEN_PLAY; game.toast('Simpanan dimuat.'); }
    if (input.hit('n', 'N')) {
      try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      const fresh = createGame(game.seed);
      Object.assign(game, fresh);
      game.screen = SCREEN_PLAY;
    }
  } else if (game.screen === SCREEN_BUSINESS || game.screen === SCREEN_HEIST || game.screen === SCREEN_SHOP || game.screen === SCREEN_BLACKMARKET) {
    handlePanelKeys(game, input);
    if (input.hit('b', 'B', 'h', 'H', 'e', 'E', 'g', 'G', 'Escape')) game.screen = SCREEN_PLAY;
  } else if (game.screen === SCREEN_OVER) {
    if (input.hit('Enter')) {
      loadSave(game);
      game.player.health = 100;
      game.player.x = 420;
      game.player.y = 2920;
      game.player.car = null;
      game.wanted = 0;
      game.busted = false;
      game.wasted = false;
      game.screen = SCREEN_PLAY;
    }
  }
}

export function renderGame(game, ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  drawWorld(game, ctx, W, H);
  if (game.screen !== SCREEN_TITLE) drawHud(game, ctx, W, H);
  drawPanel(game, ctx, W, H);
}

// ---- Browser entry point: rAF loop with a fixed-step accumulator. ----

export function startBrowserGame(canvas) {
  const ctx = canvas.getContext('2d');
  const game = createGame(7);
  game.hasSave = (() => {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  })();
  loadSave(game);
  // Re-apply the save's clock/weather but start at the title screen.
  game.screen = SCREEN_TITLE;
  const input = createControls();
  input.attach(canvas);
  canvas.addEventListener('mousedown', () => game.sound.ensure());
  window.addEventListener('keydown', () => game.sound.ensure(), { once: true });

  // Screenshot mode: stage a scene, run it, render one frame, stop.
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    import('./shots.js').then(({ stageShot, setStepWorld }) => {
      setStepWorld(stepWorld);
      stageShot(shot, game);
      renderGame(game, ctx, canvas.width, canvas.height);
      window.__shotReady = true;
    });
    return game;
  }

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
  return game;
}
