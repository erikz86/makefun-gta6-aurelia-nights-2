// The story of Empire of the Storm: six jobs that take Kai from the bank
// job's getaway driver to the man who owns half of Port Aurelia — plus the
// side gigs that pay the bills between jobs (taxi fares, deliveries, and
// the night street races the Neon Mile runs after dark).

import { PAYOUT } from './tuning.js';
import { addWanted } from './law.js';
import { createCar } from './vehicles.js';
import { completeHeist, heistReady, heistMissing } from './crew.js';
import { nearestProperty } from './empire.js';
import { isNight } from './sky.js';
import { pick, range } from './rng.js';
import { AVENUES, STREETS, nearestRoadPoint } from './world.js';

export const STORY = [
  { id: 'brick', title: 'Batu Pertama', brief: 'Beli bengkel Roda Gila dan mulai kerajaanmu.' },
  { id: 'wheel', title: 'Wheelwoman', brief: 'Temui Lena Voss dan buktikan kamu bisa mengimbanginya.' },
  { id: 'paper', title: 'Jejak Kertas', brief: 'Curi cetak biru Permata Row dari kantor pusat.' },
  { id: 'jewel', title: 'Permata Row', brief: 'Heist pertama: bobol toko perhiasan dan kabur.' },
  { id: 'convoy', title: 'Konvoi Besi', brief: 'Hentikan truk lapis baja di rute pelabuhan.' },
  { id: 'vault', title: 'Grand Vault', brief: 'Brankas kasino Grand Aurelia. Badai menutupi semuanya.' },
];

export function createStory() {
  return {
    index: 0, // next story job; 6 means the arc is finished
    active: null,
    gig: null,
    dialog: null,
  };
}

export function say(game, lines) {
  game.story.dialog = { lines, i: 0, until: game.time + 5 };
}

export function dialogLine(game) {
  const d = game.story.dialog;
  if (!d) return null;
  if (game.time > d.until) {
    d.i += 1;
    d.until = game.time + 5;
    if (d.i >= d.lines.length) { game.story.dialog = null; return null; }
  }
  return d.lines[d.i];
}

function begin(game, mission) {
  game.story.active = mission;
  say(game, [`${mission.title}`, mission.brief]);
  game.sound.blip();
}

export function startStoryMission(game, index) {
  const def = STORY[index];
  const p = game.player;
  if (index === 0) {
    begin(game, { id: 'brick', title: def.title, brief: def.brief, step: 0, tx: 690, ty: 2650, objective: 'Pergi ke Roda Gila Garage dan beli (B)' });
  } else if (index === 1) {
    begin(game, { id: 'wheel', title: def.title, brief: def.brief, step: 0, tx: 3120, ty: 2900, objective: 'Temui Lena Voss di selatan Neon Mile' });
  } else if (index === 2) {
    begin(game, { id: 'paper', title: def.title, brief: def.brief, step: 0, tx: 2450, ty: 620, objective: 'Masuk ke kantor pusat dan ambil cetak biru (E)' });
  } else if (index === 3) {
    begin(game, { id: 'jewel', title: def.title, brief: def.brief, step: 0, tx: 2900, ty: 950, objective: 'Pergi ke Permata Row dan mulai heist (E)' });
  } else if (index === 4) {
    begin(game, { id: 'convoy', title: def.title, brief: def.brief, step: 0, tx: 420, ty: 2050, objective: 'Cegat truk lapis baja di jalan pelabuhan' });
  } else if (index === 5) {
    game.sky.weather = 'storm';
    game.sky.weatherHoursLeft = 3;
    begin(game, { id: 'vault', title: def.title, brief: def.brief, step: 0, tx: 3650, ty: 1150, objective: 'Masuk ke Grand Aurelia dan bobol brankas (E)' });
  }
}

export function finishStoryMission(game, rewardText) {
  const m = game.story.active;
  game.story.active = null;
  game.story.index += 1;
  game.stats.missionsDone += 1;
  game.sound.mission();
  game.toast(`Misi selesai: ${m.title}. ${rewardText || ''}`);
  if (game.story.index < STORY.length) {
    say(game, ['Misi berikutnya tersedia.', 'Tekan F untuk memulai pekerjaan berikutnya.']);
  } else {
    say(game, ['Empire selesai.', 'Port Aurelia milikmu sekarang. Terus kembangkan bisnismu dan ulangi heist-nya.']);
  }
}

function near(game, x, y, r = 130) {
  return Math.hypot(game.player.x - x, game.player.y - y) < r;
}

function raceCheckpoints(game, rng, n, spread) {
  const pts = [];
  const cx = game.player.x;
  const cy = game.player.y;
  for (let i = 0; i < n; i += 1) {
    const pt = nearestRoadPoint(cx + range(rng, -spread, spread), cy + range(rng, -spread, spread));
    pts.push(pt);
  }
  return pts;
}

export function stepStory(game, dt, input) {
  const m = game.story.active;
  if (!m) return;
  const p = game.player;

  if (m.id === 'brick') {
    const prop = nearestProperty(game, 320);
    if (prop && prop.id === 'garage' && prop.owned) {
      game.money += 500;
      finishStoryMission(game, '+$500 modal awal.');
    }
    return;
  }

  if (m.id === 'wheel') {
    if (m.step === 0) {
      if (near(game, 3120, 2900, 150)) {
        m.step = 1;
        m.points = raceCheckpoints(game, game.rng, 3, 900);
        m.pointI = 0;
        m.timer = 75;
        m.tx = m.points[0].x;
        m.ty = m.points[0].y;
        m.objective = 'Balapan: lewati 3 checkpoint sebelum waktu habis!';
        say(game, ['Lena: "Ikuti aku kalau bisa, Kai."', 'Lena: "Tiga checkpoint. Jangan menabrak terlalu banyak."']);
        game.crew.members.lena.hired = true;
        game.toast('Lena Voss bergabung dengan kru!');
      }
      return;
    }
    m.timer -= dt;
    if (m.timer <= 0) {
      game.story.active = null;
      game.toast('Balapan gagal — Lena pergi. Tekan F untuk mencoba lagi.');
      return;
    }
    const pt = m.points[m.pointI];
    if (near(game, pt.x, pt.y, 90)) {
      m.pointI += 1;
      game.sound.coin();
      if (m.pointI >= m.points.length) {
        game.money += 700;
        finishStoryMission(game, '+$700. Lena resmi jadi pembalapmu.');
      } else {
        m.tx = m.points[m.pointI].x;
        m.ty = m.points[m.pointI].y;
        m.objective = `Checkpoint ${m.pointI + 1}/3 — ${Math.ceil(m.timer)} dtk tersisa`;
      }
    }
    return;
  }

  if (m.id === 'paper') {
    if (m.step === 0) {
      m.objective = 'Ambil cetak biru di kantor pusat (E)';
      if (near(game, 2450, 620, 140) && input.hit('e', 'E')) {
        m.step = 1;
        m.tx = 420; m.ty = 2920;
        m.objective = 'Kabur ke safehouse — polisi sudah tahu!';
        addWanted(game, 2, 'Mencuri cetak biru');
        say(game, ['Alarm berbunyi!', 'Bawa cetak birunya ke loteng. Jangan tertangkap.']);
      }
      return;
    }
    if (near(game, 420, 2920, 150)) {
      game.crew.heists.jewel.prepDone = true;
      game.money += 800;
      finishStoryMission(game, '+$800. Prep heist Permata Row selesai.');
    }
    return;
  }

  if (m.id === 'jewel') {
    if (m.step === 0) {
      m.objective = 'Mulai heist di Permata Row (E)';
      if (near(game, 2900, 950, 160) && input.hit('e', 'E')) {
        const heist = game.crew.heists.jewel;
        if (!heist.prepDone) { game.toast('Butuh cetak biru dulu — selesaikan "Jejak Kertas".'); return; }
        if (!game.crew.members.lena.hired) { game.toast('Butuh Lena sebagai getaway driver.'); return; }
        m.step = 1;
        m.cases = 3;
        m.smashCooldown = 0;
        m.timer = 120;
        m.objective = 'Hancurkan 3 etalase (pukul / tembak) lalu kabur!';
        addWanted(game, heist.wanted, 'Heist Permata Row');
        say(game, ['Lena: "Aku jaga mobil. Cepat!"', 'Hancurkan etalasenya, ambil isinya.']);
      }
      return;
    }
    if (m.step === 1) {
      m.timer -= dt;
      if (m.timer <= 0) {
        game.story.active = null;
        game.toast('Heist gagal — polisi menutup toko. Coba lagi (F).');
        return;
      }
      // Smashing a case: a punch or a bullet near the store front.
      if (p.punchArc > 0 && near(game, 2900, 950, 190) && m.smashCooldown <= 0) {
        m.cases -= 1;
        m.smashCooldown = 0.6;
        game.sound.noise(0.2, 0.4, 3000);
        game.toast(`Etalase hancur! Sisa ${m.cases}.`);
      }
      if (m.smashCooldown > 0) m.smashCooldown -= dt;
      // A bullet through the shop window counts as a smashed case too.
      if (game.storeShot) {
        game.storeShot = false;
        m.cases -= 1;
        game.toast(`Etalase hancur! Sisa ${m.cases}.`);
      }
      if (m.cases <= 0) {
        m.step = 2;
        m.tx = 420; m.ty = 2920;
        m.objective = 'Kabur ke safehouse dengan jarahannya!';
        say(game, ['Dapat semua!', 'Ke loteng. Jangan berhenti.']);
      }
      return;
    }
    if (near(game, 420, 2920, 150)) {
      const heist = game.crew.heists.jewel;
      const net = completeHeist(game, heist);
      finishStoryMission(game, `Heist bersih $${net}.`);
    }
    return;
  }

  if (m.id === 'convoy') {
    if (m.step === 0) {
      if (!m.truck) {
        const truck = createCar(240, 2050, 0, 'truck', '#8e44ad');
        truck.missionTruck = true;
        truck.driver = 'traffic';
        truck.route = [{ x: 4400, y: 2050 }, { x: 4400, y: 2360 }, { x: 240, y: 2360 }, { x: 240, y: 2050 }];
        truck.health = 220;
        truck.speed = 150;
        game.cars.push(truck);
        m.truck = truck;
        m.tx = truck.x; m.ty = truck.y;
        m.objective = 'Hentikan truk lapis baja itu (tabrak / tembak)!';
        say(game, ['Truk melintas di jalan pelabuhan.', 'Hentikan dia sebelum mencapai ujung kota.']);
      }
      m.tx = m.truck.x; m.ty = m.truck.y;
      if (m.truck.health <= 60) {
        m.step = 1;
        m.truck.speed = 0;
        m.truck.driver = null;
        m.objective = 'Ambil uangnya dari truk (E, tahan dekat truk)';
        m.grab = 0;
        say(game, ['Truk berhenti!', 'Ambil uangnya sebelum polisi datang.']);
        addWanted(game, 2, 'Merampok konvoi');
      }
      return;
    }
    if (m.step === 1) {
      if (near(game, m.truck.x, m.truck.y, 90)) {
        m.grab += dt;
        m.objective = `Mengambil uang... ${Math.ceil(4 - m.grab)} dtk`;
        if (m.grab >= 4) {
          m.step = 2;
          m.tx = 420; m.ty = 2920;
          m.objective = 'Kabur ke safehouse!';
        }
      } else {
        m.grab = 0;
        m.objective = 'Ambil uangnya dari truk (E, tahan dekat truk)';
      }
      return;
    }
    if (near(game, 420, 2920, 150)) {
      const heist = game.crew.heists.truck;
      heist.prepDone = true;
      const net = completeHeist(game, heist);
      finishStoryMission(game, `Heist bersih $${net}.`);
    }
    return;
  }

  if (m.id === 'vault') {
    if (m.step === 0) {
      m.objective = 'Masuk ke Grand Aurelia dan bobol brankas (E)';
      if (near(game, 3650, 1150, 190) && input.hit('e', 'E')) {
        if (!game.crew.members.otto.hired || !game.crew.members.bruno.hired) {
          game.toast('Butuh Otto (hacker) dan Bruno (otot) untuk vault ini.');
          return;
        }
        m.step = 1;
        m.crack = 0;
        m.objective = 'Bobol brankas — tahan di dekat brankas!';
        addWanted(game, 4, 'Membobol Grand Aurelia');
        say(game, ['Otto: "Aku matikan kameranya. 12 detik."', 'Bruno: "Aku jaga pintu. Jangan bergerak."']);
      }
      return;
    }
    if (m.step === 1) {
      if (near(game, 3650, 1150, 150)) {
        m.crack += dt;
        m.objective = `Membobol brankas... ${Math.ceil(12 - m.crack)} dtk`;
        if (m.crack >= 12) {
          m.step = 2;
          m.tx = 300; m.ty = 3050;
          m.objective = 'Kabur ke pelabuhan tua — badai menutupi jejakmu!';
          say(game, ['Brankas terbuka!', 'Ke pelabuhan. Badai menutupi semuanya.']);
        }
      } else {
        m.objective = 'Kembali ke brankas — proses bobol terhenti!';
      }
      return;
    }
    if (near(game, 300, 3050, 170)) {
      const heist = game.crew.heists.vault;
      const net = completeHeist(game, heist);
      game.wanted = 0;
      finishStoryMission(game, `Heist bersih $${net}. Legenda Port Aurelia.`);
    }
  }
}

// ---- Side gigs: repeatable work, started with F when no story job runs. ----

export function availableGigs(game) {
  const gigs = ['taxi', 'delivery'];
  if (isNight(game.sky)) gigs.push('race');
  return gigs;
}

export function startGig(game, kind) {
  const rng = game.rng;
  if (kind === 'taxi') {
    const from = nearestRoadPoint(game.player.x + range(rng, -500, 500), game.player.y + range(rng, -500, 500));
    const to = nearestRoadPoint(range(rng, 300, 4300), range(rng, 300, 3100));
    game.story.gig = { kind, step: 0, tx: from.x, ty: from.y, px: to.x, py: to.y, timer: 90, objective: 'Jemput penumpang taksi' };
    say(game, ['Penumpang menunggu taksi.', 'Jemput dia, lalu antar ke tujuan.']);
  } else if (kind === 'delivery') {
    const to = nearestRoadPoint(range(rng, 300, 4300), range(rng, 300, 3100));
    game.story.gig = { kind, step: 0, tx: 2340, ty: 1450, px: to.x, py: to.y, timer: 100, objective: 'Ambil paket di Warung Senja (E)' };
    say(game, ['Paket siap di Warung Senja.', 'Ambil dan antar sebelum dingin.']);
  } else if (kind === 'race') {
    if (game.money < PAYOUT.raceEntry) { game.toast(`Balapan malam butuh uang pendaftaran $${PAYOUT.raceEntry}.`); return; }
    game.money -= PAYOUT.raceEntry;
    const pts = raceCheckpoints(game, rng, 4, 1100);
    game.story.gig = { kind, step: 0, points: pts, pointI: 0, tx: pts[0].x, ty: pts[0].y, timer: 100, objective: 'Balapan malam: 4 checkpoint!' };
    say(game, ['Balapan malam Neon Mile!', 'Empat checkpoint. Menang dan bawa pulang $900.']);
  }
}

export function stepGig(game, dt, input) {
  const g = game.story.gig;
  if (!g) return;
  g.timer -= dt;
  if (g.timer <= 0) {
    game.story.gig = null;
    game.toast('Pekerjaan sampingan gagal — waktu habis.');
    return;
  }
  if (g.kind === 'taxi') {
    if (g.step === 0 && near(game, g.tx, g.ty, 110)) {
      g.step = 1;
      g.tx = g.px; g.ty = g.py;
      g.timer = Math.max(g.timer, 60);
      g.objective = 'Antar penumpang ke tujuan';
      game.sound.blip();
    } else if (g.step === 1 && near(game, g.tx, g.ty, 110)) {
      game.money += PAYOUT.taxiFare;
      game.story.gig = null;
      game.toast(`Penumpang puas. +$${PAYOUT.taxiFare}.`);
      game.sound.coin();
    }
    return;
  }
  if (g.kind === 'delivery') {
    if (g.step === 0 && near(game, g.tx, g.ty, 130) && input.hit('e', 'E')) {
      g.step = 1;
      g.tx = g.px; g.ty = g.py;
      g.objective = 'Antar paket ke tujuan';
      game.sound.blip();
    } else if (g.step === 1 && near(game, g.tx, g.ty, 110)) {
      game.money += PAYOUT.delivery;
      game.story.gig = null;
      game.toast(`Paket terkirim. +$${PAYOUT.delivery}.`);
      game.sound.coin();
    }
    return;
  }
  if (g.kind === 'race') {
    const pt = g.points[g.pointI];
    if (near(game, pt.x, pt.y, 100)) {
      g.pointI += 1;
      game.sound.coin();
      if (g.pointI >= g.points.length) {
        game.money += PAYOUT.raceWin;
        game.story.gig = null;
        game.toast(`Menang balapan malam! +$${PAYOUT.raceWin}.`);
        game.sound.mission();
      } else {
        g.tx = g.points[g.pointI].x;
        g.ty = g.points[g.pointI].y;
        g.objective = `Checkpoint ${g.pointI + 1}/4 — ${Math.ceil(g.timer)} dtk`;
      }
    }
  }
}
