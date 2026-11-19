// Cerita Empire of the Storm: enam pekerjaan yang mengantar Kai dari
// sopir kabur perampokan bank menjadi orang yang memiliki setengah Port
// Aurelia — plus kerja sampingan yang membayar tagihan di antara
// pekerjaan (ongkos taksi, antar paket, dan balapan jalanan malam yang
// digelar Neon Mile setelah gelap).
//
// Ditulis ulang round 4b: tiap misi kini satu definisi data di STORY —
// titik mulai, objektif awal, dan kait onStart — dan stepStory hanya
// mencari handler misi di tabel MISSION_STEPS. Pola yang berulang di
// antar-misi (gagal karena waktu habis, kabur ke safehouse, menahan
// tombol di dekat titik) dipindah ke helper kecil di bawah, supaya
// tiap fungsi step hanya berisi alur khas misinya sendiri.

import { PAYOUT } from './tuning.js';
import { addWanted } from './law.js';
import { createCar } from './vehicles.js';
import { completeHeist, heistReady, heistMissing } from './crew.js';
import { nearestProperty } from './empire.js';
import { isNight } from './sky.js';
import { pick, range } from './rng.js';
import { AVENUES, STREETS, nearestRoadPoint } from './world.js';

// Titik kabur yang sama untuk semua misi: loteng safehouse.
const SAFEHOUSE = { x: 420, y: 2920 };
// Jumlah misi yang dihitung banner dan status tamat (arc punya 6
// entri, tapi banner menghitung 5 — quirk yang dipertahankan).
const BANNER_TOTAL = 5;

// Definisi misi: id, judul, brief, titik mulai, objektif awal, dan
// kait yang jalan sekali saat misi dimulai (hanya vault yang pakai:
// badai menutupi kota selama misi terakhir).
export const STORY = [
  { id: 'brick', title: 'Batu Pertama', brief: 'Beli bengkel Roda Gila dan mulai kerajaanmu.',
    start: { tx: 690, ty: 2650, objective: 'Pergi ke Roda Gila Garage dan beli (B)' } },
  { id: 'wheel', title: 'Wheelwoman', brief: 'Temui Lena Voss dan buktikan kamu bisa mengimbanginya.',
    start: { tx: 3120, ty: 2900, objective: 'Temui Lena Voss di selatan Neon Mile' } },
  { id: 'paper', title: 'Jejak Kertas', brief: 'Curi cetak biru Permata Row dari kantor pusat.',
    start: { tx: 2450, ty: 620, objective: 'Masuk ke kantor pusat dan ambil cetak biru (E)' } },
  { id: 'jewel', title: 'Permata Row', brief: 'Heist pertama: bobol toko perhiasan dan kabur.',
    start: { tx: 2900, ty: 950, objective: 'Pergi ke Permata Row dan mulai heist (E)' } },
  { id: 'convoy', title: 'Konvoi Besi', brief: 'Hentikan truk lapis baja di rute pelabuhan.',
    start: { tx: 420, ty: 2050, objective: 'Cegat truk lapis baja di jalan pelabuhan' } },
  { id: 'vault', title: 'Grand Vault', brief: 'Brankas kasino Grand Aurelia. Badai menutupi semuanya.',
    start: { tx: 3650, ty: 1150, objective: 'Masuk ke Grand Aurelia dan bobol brankas (E)' },
    onStart: (game) => { game.sky.weather = 'storm'; game.sky.weatherHoursLeft = 3; } },
];

export function createStory() {
  return {
    index: 0, // pekerjaan cerita berikutnya; 6 berarti arc selesai
    active: null,
    gig: null,
    dialog: null,
  };
}

// Antrean dialog: tiap baris tampil 5 detik, lalu ganti baris berikut.
export function say(game, lines) {
  game.story.dialog = { lines, i: 0, until: game.time + 5 };
}

export function dialogLine(game) {
  const d = game.story.dialog;
  if (!d) return null;
  if (game.time <= d.until) return d.lines[d.i];
  d.i += 1;
  d.until = game.time + 5;
  if (d.i >= d.lines.length) {
    game.story.dialog = null;
    return null;
  }
  return d.lines[d.i];
}

// Mulai satu misi: simpan sebagai aktif dan ucapkan judul + briefnya.
function begin(game, mission) {
  game.story.active = mission;
  say(game, [`${mission.title}`, mission.brief]);
  game.sound.blip();
}

export function startStoryMission(game, index) {
  const def = STORY[index];
  if (!def) return;
  if (def.onStart) def.onStart(game);
  const s = def.start;
  begin(game, { id: def.id, title: def.title, brief: def.brief, step: 0, tx: s.tx, ty: s.ty, objective: s.objective });
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

// Apakah pemain cukup dekat dengan satu titik (radius default 130).
function near(game, x, y, r = 130) {
  return Math.hypot(game.player.x - x, game.player.y - y) < r;
}

// Checkpoint balapan: titik jalan acak di sekitar pemain.
function raceCheckpoints(game, rng, n, spread) {
  const pts = [];
  const cx = game.player.x;
  const cy = game.player.y;
  for (let i = 0; i < n; i += 1) {
    const px = cx + range(rng, -spread, spread);
    const py = cy + range(rng, -spread, spread);
    pts.push(nearestRoadPoint(px, py));
  }
  return pts;
}

// ---- Helper pola misi yang berulang. ----

// Gagalkan misi yang sedang aktif dengan satu pesan.
function failMission(game, message) {
  game.story.active = null;
  game.toast(message);
}

// Arahkan target misi ke safehouse dengan objektif kabur.
function fleeToSafehouse(m, objective) {
  m.tx = SAFEHOUSE.x;
  m.ty = SAFEHOUSE.y;
  m.objective = objective;
}

// Timer misi: kurangi, dan bila habis, gagalkan misi. Mengembalikan
// true bila waktu sudah habis (pemanggil berhenti di situ).
function tickMissionTimer(game, m, dt) {
  m.timer -= dt;
  if (m.timer > 0) return false;
  failMission(game, m.failText || 'Waktu habis.');
  return true;
}

// Syarat kru: semua anggota yang disebut harus sudah direkrut.
// Mengembalikan true bila lengkap; bila tidak, beri tahu pemain.
function needCrew(game, wanted, message) {
  for (const member of wanted) {
    if (!game.crew.members[member].hired) {
      game.toast(message);
      return false;
    }
  }
  return true;
}

// Pindah target misi ke checkpoint balapan berikutnya, atau selesaikan
// bila sudah yang terakhir. Mengembalikan true bila balapan selesai.
function advanceCheckpoint(game, m, reward, doneText) {
  m.pointI += 1;
  game.sound.coin();
  if (m.pointI >= m.points.length) {
    game.money += reward;
    finishStoryMission(game, doneText);
    return true;
  }
  const next = m.points[m.pointI];
  m.tx = next.x;
  m.ty = next.y;
  return false;
}

// ---- Mesin misi: satu fungsi per pekerjaan, dipanggil dari stepStory. ----

function stepBrick(game) {
  const prop = nearestProperty(game, 320);
  if (prop && prop.id === 'garage' && prop.owned) {
    game.money += 500;
    finishStoryMission(game, '+$500 modal awal.');
  }
}

function stepWheel(game, dt, m) {
  if (m.step === 0) {
    if (!near(game, 3120, 2900, 150)) return;
    m.step = 1;
    m.points = raceCheckpoints(game, game.rng, 3, 900);
    m.pointI = 0;
    m.timer = 75;
    m.failText = 'Balapan gagal — Lena pergi. Tekan F untuk mencoba lagi.';
    m.tx = m.points[0].x;
    m.ty = m.points[0].y;
    m.objective = 'Balapan: lewati 3 checkpoint sebelum waktu habis!';
    say(game, ['Lena: "Ikuti aku kalau bisa, Kai."', 'Lena: "Tiga checkpoint. Jangan menabrak terlalu banyak."']);
    game.crew.members.lena.hired = true;
    game.toast('Lena Voss bergabung dengan kru!');
    return;
  }
  if (tickMissionTimer(game, m, dt)) return;
  const pt = m.points[m.pointI];
  if (!near(game, pt.x, pt.y, 90)) return;
  const finished = advanceCheckpoint(game, m, 700, '+$700. Lena resmi jadi pembalapmu.');
  if (!finished) m.objective = `Checkpoint ${m.pointI + 1}/3 — ${Math.ceil(m.timer)} dtk tersisa`;
}

function stepPaper(game, m, input) {
  if (m.step === 0) {
    m.objective = 'Ambil cetak biru di kantor pusat (E)';
    if (!near(game, 2450, 620, 140) || !input.hit('e', 'E')) return;
    m.step = 1;
    fleeToSafehouse(m, 'Kabur ke safehouse — polisi sudah tahu!');
    addWanted(game, 2, 'Mencuri cetak biru');
    say(game, ['Alarm berbunyi!', 'Bawa cetak birunya ke loteng. Jangan tertangkap.']);
    return;
  }
  if (!near(game, SAFEHOUSE.x, SAFEHOUSE.y, 150)) return;
  game.crew.heists.jewel.prepDone = true;
  game.money += 800;
  finishStoryMission(game, '+$800. Prep heist Permata Row selesai.');
}

function stepJewel(game, dt, m, input) {
  const p = game.player;
  if (m.step === 0) {
    m.objective = 'Mulai heist di Permata Row (E)';
    if (!near(game, 2900, 950, 160) || !input.hit('e', 'E')) return;
    const heist = game.crew.heists.jewel;
    if (!heist.prepDone) { game.toast('Butuh cetak biru dulu — selesaikan "Jejak Kertas".'); return; }
    if (!game.crew.members.lena.hired) { game.toast('Butuh Lena sebagai getaway driver.'); return; }
    m.step = 1;
    m.cases = 3;
    m.smashCooldown = 0;
    m.timer = 120;
    m.failText = 'Heist gagal — polisi menutup toko. Coba lagi (F).';
    m.objective = 'Hancurkan 3 etalase (pukul / tembak) lalu kabur!';
    addWanted(game, heist.wanted, 'Heist Permata Row');
    say(game, ['Lena: "Aku jaga mobil. Cepat!"', 'Hancurkan etalasenya, ambil isinya.']);
    return;
  }
  if (m.step === 1) {
    if (tickMissionTimer(game, m, dt)) return;
    // Menghancurkan etalase: pukulan atau peluru di depan toko.
    const smashedByFist = p.punchArc > 0 && near(game, 2900, 950, 190) && m.smashCooldown <= 0;
    if (smashedByFist) {
      m.cases -= 1;
      m.smashCooldown = 0.6;
      game.sound.noise(0.2, 0.4, 3000);
      game.toast(`Etalase hancur! Sisa ${m.cases}.`);
    }
    if (m.smashCooldown > 0) m.smashCooldown -= dt;
    // Peluru yang menembus jendela toko juga dihitung menghancurkan etalase.
    if (game.storeShot) {
      game.storeShot = false;
      m.cases -= 1;
      game.toast(`Etalase hancur! Sisa ${m.cases}.`);
    }
    if (m.cases <= 0) {
      m.step = 2;
      fleeToSafehouse(m, 'Kabur ke safehouse dengan jarahannya!');
      say(game, ['Dapat semua!', 'Ke loteng. Jangan berhenti.']);
    }
    return;
  }
  if (!near(game, SAFEHOUSE.x, SAFEHOUSE.y, 150)) return;
  const heist = game.crew.heists.jewel;
  const net = completeHeist(game, heist);
  finishStoryMission(game, `Heist bersih $${net}.`);
}

// Truk konvoi: dibuat sekali, lalu mengikuti rutenya sampai dihentikan.
function spawnConvoyTruck(game) {
  const truck = createCar(240, 2050, 0, 'truck', '#8e44ad');
  truck.missionTruck = true;
  truck.driver = 'traffic';
  truck.route = [{ x: 4400, y: 2050 }, { x: 4400, y: 2360 }, { x: 240, y: 2360 }, { x: 240, y: 2050 }];
  truck.health = 220;
  truck.speed = 150;
  game.cars.push(truck);
  return truck;
}

function stepConvoy(game, dt, m) {
  if (m.step === 0) {
    if (!m.truck) {
      m.truck = spawnConvoyTruck(game);
      m.tx = m.truck.x; m.ty = m.truck.y;
      m.objective = 'Hentikan truk lapis baja itu (tabrak / tembak)!';
      say(game, ['Truk melintas di jalan pelabuhan.', 'Hentikan dia sebelum mencapai ujung kota.']);
    }
    m.tx = m.truck.x; m.ty = m.truck.y;
    if (m.truck.health > 60) return;
    m.step = 1;
    m.truck.speed = 0;
    m.truck.driver = null;
    m.objective = 'Ambil uangnya dari truk (E, tahan dekat truk)';
    m.grab = 0;
    say(game, ['Truk berhenti!', 'Ambil uangnya sebelum polisi datang.']);
    addWanted(game, 2, 'Merampok konvoi');
    return;
  }
  if (m.step === 1) {
    if (near(game, m.truck.x, m.truck.y, 90)) {
      m.grab += dt;
      m.objective = `Mengambil uang... ${Math.ceil(4 - m.grab)} dtk`;
      if (m.grab >= 4) {
        m.step = 2;
        fleeToSafehouse(m, 'Kabur ke safehouse!');
      }
    } else {
      m.grab = 0;
      m.objective = 'Ambil uangnya dari truk (E, tahan dekat truk)';
    }
    return;
  }
  if (!near(game, SAFEHOUSE.x, SAFEHOUSE.y, 150)) return;
  const heist = game.crew.heists.truck;
  heist.prepDone = true;
  const net = completeHeist(game, heist);
  finishStoryMission(game, `Heist bersih $${net}.`);
}

function stepVault(game, dt, m, input) {
  if (m.step === 0) {
    m.objective = 'Masuk ke Grand Aurelia dan bobol brankas (E)';
    if (!near(game, 3650, 1150, 190) || !input.hit('e', 'E')) return;
    if (!needCrew(game, ['otto', 'bruno'], 'Butuh Otto (hacker) dan Bruno (otot) untuk vault ini.')) return;
    m.step = 1;
    m.crack = 0;
    m.objective = 'Bobol brankas — tahan di dekat brankas!';
    addWanted(game, 4, 'Membobol Grand Aurelia');
    say(game, ['Otto: "Aku matikan kameranya. 12 detik."', 'Bruno: "Aku jaga pintu. Jangan bergerak."']);
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
  if (!near(game, 300, 3050, 170)) return;
  const heist = game.crew.heists.vault;
  const net = completeHeist(game, heist);
  game.wanted = 0;
  finishStoryMission(game, `Heist bersih $${net}. Legenda Port Aurelia.`);
}

const MISSION_STEPS = {
  brick: (game, dt, m, input) => stepBrick(game),
  wheel: stepWheel,
  paper: (game, dt, m, input) => stepPaper(game, m, input),
  jewel: stepJewel,
  convoy: stepConvoy,
  vault: stepVault,
};

export function stepStory(game, dt, input) {
  const m = game.story.active;
  if (!m) return;
  const run = MISSION_STEPS[m.id];
  if (run) run(game, dt, m, input);
}

// ---- Kerja sampingan: pekerjaan berulang, dimulai dengan F saat tidak
// ada misi cerita yang jalan. ----

export function availableGigs(game) {
  const gigs = ['taxi', 'delivery'];
  if (isNight(game.sky)) gigs.push('race');
  return gigs;
}

// Tiap gig: satu builder yang merakit objek gig + dialog pembukanya.
const GIG_BUILDERS = {
  taxi: (game, rng) => {
    const from = nearestRoadPoint(game.player.x + range(rng, -500, 500), game.player.y + range(rng, -500, 500));
    const to = nearestRoadPoint(range(rng, 300, 4300), range(rng, 300, 3100));
    return {
      gig: { kind: 'taxi', step: 0, tx: from.x, ty: from.y, px: to.x, py: to.y, timer: 90, objective: 'Jemput penumpang taksi' },
      lines: ['Penumpang menunggu taksi.', 'Jemput dia, lalu antar ke tujuan.'],
    };
  },
  delivery: (game, rng) => {
    const to = nearestRoadPoint(range(rng, 300, 4300), range(rng, 300, 3100));
    return {
      gig: { kind: 'delivery', step: 0, tx: 2340, ty: 1450, px: to.x, py: to.y, timer: 100, objective: 'Ambil paket di Warung Senja (E)' },
      lines: ['Paket siap di Warung Senja.', 'Ambil dan antar sebelum dingin.'],
    };
  },
  race: (game, rng) => {
    if (game.money < PAYOUT.raceEntry) {
      game.toast(`Balapan malam butuh uang pendaftaran $${PAYOUT.raceEntry}.`);
      return null;
    }
    game.money -= PAYOUT.raceEntry;
    const pts = raceCheckpoints(game, rng, 4, 1100);
    return {
      gig: { kind: 'race', step: 0, points: pts, pointI: 0, tx: pts[0].x, ty: pts[0].y, timer: 100, objective: 'Balapan malam: 4 checkpoint!' },
      lines: ['Balapan malam Neon Mile!', 'Empat checkpoint. Menang dan bawa pulang $900.'],
    };
  },
};

export function startGig(game, kind) {
  const build = GIG_BUILDERS[kind];
  if (!build) return;
  const made = build(game, game.rng);
  if (!made) return;
  game.story.gig = made.gig;
  say(game, made.lines);
}

// Satu gig selesai dibayar: tambah uang, tutup gig, beri tahu pemain.
function payGig(game, amount, message, celebrate) {
  game.money += amount;
  game.story.gig = null;
  game.toast(message);
  if (celebrate) game.sound.mission();
  else game.sound.coin();
}

function stepTaxiGig(game, g, input) {
  if (g.step === 0 && near(game, g.tx, g.ty, 110)) {
    g.step = 1;
    g.tx = g.px; g.ty = g.py;
    g.timer = Math.max(g.timer, 60);
    g.objective = 'Antar penumpang ke tujuan';
    game.sound.blip();
  } else if (g.step === 1 && near(game, g.tx, g.ty, 110)) {
    payGig(game, PAYOUT.taxiFare, `Penumpang puas. +$${PAYOUT.taxiFare}.`, false);
  }
}

function stepDeliveryGig(game, g, input) {
  if (g.step === 0 && near(game, g.tx, g.ty, 130) && input.hit('e', 'E')) {
    g.step = 1;
    g.tx = g.px; g.ty = g.py;
    g.objective = 'Antar paket ke tujuan';
    game.sound.blip();
  } else if (g.step === 1 && near(game, g.tx, g.ty, 110)) {
    payGig(game, PAYOUT.delivery, `Paket terkirim. +$${PAYOUT.delivery}.`, false);
  }
}

function stepRaceGig(game, g, input) {
  const pt = g.points[g.pointI];
  if (!near(game, pt.x, pt.y, 100)) return;
  g.pointI += 1;
  game.sound.coin();
  if (g.pointI < g.points.length) {
    g.tx = g.points[g.pointI].x;
    g.ty = g.points[g.pointI].y;
    g.objective = `Checkpoint ${g.pointI + 1}/4 — ${Math.ceil(g.timer)} dtk`;
    return;
  }
  payGig(game, PAYOUT.raceWin, `Menang balapan malam! +$${PAYOUT.raceWin}.`, true);
}

const GIG_STEPS = { taxi: stepTaxiGig, delivery: stepDeliveryGig, race: stepRaceGig };

export function stepGig(game, dt, input) {
  const g = game.story.gig;
  if (!g) return;
  g.timer -= dt;
  if (g.timer <= 0) {
    game.story.gig = null;
    game.toast('Pekerjaan sampingan gagal — waktu habis.');
    return;
  }
  const run = GIG_STEPS[g.kind];
  if (run) run(game, g, input);
}

// ---- Beat cerita pasar gelap: ekonomi malam ikut bicara. ----

// Perkenalan pertama dengan tiap dealer — tabel dialog per dealer id.
const DEALER_LINES = {
  rook: ['Rook: "Kai. Anak yang kabur dari bank itu."', 'Rook: "Di pelabuhan, barang bergerak kalau malam. Kau bawa uang, aku bawa barang."', 'Rook: "Beli murah, antar jauh, jual mahal. Jangan ditangkap."'],
  zara: ['Zara: "Lena cerita tentangmu. Pembalap yang baik."', 'Zara: "Neon Mile butuh kurir yang tidak banyak tanya. Kau bisa jadi itu."', 'Zara: "Reputasi 25 membawamu ke pintuku. Jaga namamu baik-baik."'],
  silencio: ['Silencio: "..."', 'Silencio: "Kau bertahan sejauh ini. Itu saja sudah bicara banyak."', 'Silencio: "Senjata selundupan hanya untuk yang tidak gemetar."'],
};

// Pertemuan pertama dengan tiap dealer memainkan pertukaran singkat
// dan memberi sedikit reputasi — game mengingat siapa yang sudah
// ditemui, jadi perkenalan hanya terjadi sekali per dealer.
export function dealerFirstMeeting(game, dealer) {
  const bm = game.blackmarket;
  if (!bm || bm.dealerMet[dealer.id]) return false;
  bm.dealerMet[dealer.id] = true;
  say(game, DEALER_LINES[dealer.id] || [dealer.greeting]);
  game.toast(`${dealer.name} mengenalmu sekarang. Reputasi +2.`);
  bm.rep += 2;
  return true;
}

// Baris kabar yang bisa dijatuhkan sistem cerita ke dialog di malam
// hari, supaya pasar gelap terasa hidup bahkan saat pemain sedang
// mengerjakan misi cerita. Tabel ambang: baris pertama yang kondisinya
// benar yang dipakai.
const RUMOUR_LINES = [
  { test: (bm) => bm.heat >= 70, line: 'Kabar jalanan: polisi razia pasar gelap malam ini. Hati-hati.' },
  { test: (bm) => bm.dirtyMoney > 1000, line: 'Kabar jalanan: laundry Kilau ramai — banyak uang kotor menunggu dicuci.' },
  { test: (bm) => bm.rep >= 60, line: 'Kabar jalanan: Silencio menyebut namamu tanpa mengerutkan dahi. Itu langka.' },
  { test: (bm) => bm.rep >= 25, line: 'Kabar jalanan: Zara bilang kau kurir yang bisa dipegang kata-katanya.' },
];

export function blackMarketRumourLine(game) {
  if (!game.blackmarket) return null;
  const bm = game.blackmarket;
  for (const rumour of RUMOUR_LINES) {
    if (rumour.test(bm)) return rumour.line;
  }
  return 'Kabar jalanan: ada yang jual Rempah Hitam di pelabuhan setelah gelap.';
}

// Beat epilog: begitu arc cerita selesai dan pemain punya nama di
// ekonomi malam, Zara menawarkan permainan panjang — pengingat bahwa
// empire punya sisi gelap yang layak dikembangkan.
export function nightEmpireBeat(game) {
  if (!game.blackmarket || game.story.index < 6) return false;
  if (game.blackmarket.rep < 25 || game.blackmarket.nightBeatDone) return false;
  game.blackmarket.nightBeatDone = true;
  say(game, ['Zara: "Enam pekerjaan selesai, Kai. Kota ini sudah setengah milikmu."', 'Zara: "Setengah lainnya milik malam. Teruslah berdagang — Silencio menunggumu."']);
  game.toast('Zara mengakui kerajaan malammu. Pasar gelap terbuka penuh.');
  return true;
}

// Label progres cerita untuk banner: "MISI 2/5 — Permata Row".
export function missionProgressLabel(game) {
  const done = game.story ? (game.story.index || 0) : 0;
  const next = game.story && game.story.active ? game.story.active.title : 'misi berikutnya';
  return `MISI ${Math.min(done + 1, BANNER_TOTAL)}/${BANNER_TOTAL} — ${next}`;
}

// Apakah cerita sudah tamat (semua 5 misi selesai).
export function storyComplete(game) {
  return game.story ? (game.story.index || 0) >= BANNER_TOTAL : false;
}
