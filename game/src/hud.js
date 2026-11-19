// HUD: uang, nyawa, bintang wanted, jam dan cuaca, objektif misi,
// dialog, toast, minimap live, dan panel-panel — bisnis, papan heist,
// toko senjata, jeda, dan judul. Semuanya digambar di kanvas supaya
// screenshot menampilkan game persis seperti dimainkan.
//
// Ditulis ulang round 4b: tiap bagian HUD kini satu entri di tabel
// HUD_SECTIONS; objektif, petunjuk konteks, dan panel-panel semuanya
// digerakkan tabel resolver/builder, bukan rantai if. Panel judul juga
// menampilkan ringkasan sesi (jarak, waktu, misi) dari modul stats
// bila tersedia.

import { clockLabel, isNight, weatherNow } from './sky.js';
import { incomePerHour, ownedCount, stashCapacity } from './empire.js';
import { heistPayout, heistMissing, crewCut } from './crew.js';
import { STORY } from './story.js';
import { AVENUES, STREETS } from './world.js';
import { dealerPanelLines, blackMarketObjective, stashWeight, stashCount } from './blackmarket.js';
import { runProgress } from './smuggling.js';
import { marketHeatLevel } from './law.js';
import { drawMinimapOverlay } from './missionfx.js';
import { sessionStatsLines } from './stats.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_BUSINESS = 'business';
export const SCREEN_HEIST = 'heist';
export const SCREEN_SHOP = 'shop';
export const SCREEN_BLACKMARKET = 'blackmarket';
export const SCREEN_OVER = 'over';

// Satu bintang wanted: lima sudut, isi kuning bila menyala.
function star(cx, cy, r, ctx, filled) {
  const points = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  ctx.beginPath();
  points.forEach(([x, y], i) => ctx[i === 0 ? 'moveTo' : 'lineTo'](x, y));
  ctx.closePath();
  ctx.fillStyle = filled ? '#f1c40f' : 'rgba(255,255,255,0.25)';
  ctx.fill();
  ctx.strokeStyle = '#7f6000';
  ctx.stroke();
}

// Kotak uang + nyawa, kiri atas.
function paintMoneyAndHealth(game, ctx) {
  const p = game.player;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(12, 12, 250, 84);
  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(`$${game.money.toLocaleString('en-US')}`, 22, 42);
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '13px monospace';
  const owned = ownedCount(game.empire);
  ctx.fillText(owned > 0 ? `Bisnis: ${owned} milikmu` : 'Belum ada bisnis (B)', 22, 62);
  // Bar nyawa.
  ctx.fillStyle = '#333';
  ctx.fillRect(22, 70, 150, 12);
  const healthColour = p.health > 50 ? '#2ecc71' : p.health > 25 ? '#f39c12' : '#e74c3c';
  ctx.fillStyle = healthColour;
  ctx.fillRect(22, 70, 150 * Math.max(0, p.health / 100), 12);
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '11px monospace';
  ctx.fillText(`NYAWA ${Math.ceil(p.health)}`, 180, 81);
}

// Deret bintang wanted, di bawah kotak uang.
function paintWantedRow(game, ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(12, 102, 250, 34);
  for (let i = 0; i < 5; i += 1) star(36 + i * 30, 119, 11, ctx, i < game.wanted);
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '12px monospace';
  ctx.fillText(game.wanted > 0 ? 'DIBURU POLISI' : 'AMAN', 190, 123);
}

// Jam + cuaca, kanan atas; senjata + amunisi di bawahnya.
function paintClockAndWeapon(game, ctx, W) {
  const w = weatherNow(game.sky);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W - 232, 12, 220, 62);
  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 24px monospace';
  ctx.fillText(clockLabel(game.sky), W - 222, 40);
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '13px monospace';
  ctx.fillText(`${isNight(game.sky) ? 'Malam' : 'Siang'} • ${w.label}`, W - 222, 62);

  const gun = game.arsenal.guns[game.arsenal.current];
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W - 232, 80, 220, 30);
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '13px monospace';
  ctx.fillText(`${gun.name}  •  ${gun.ammo} peluru`, W - 222, 100);
}

// Strip pasar gelap: bar heat, uang kotor, dan kotak run yang hidup.
// Heat adalah wanted level-nya ekonomi malam — ia tinggal di bawah
// bintang supaya pemain membaca keduanya sekilas.
function paintMarketStrip(game, ctx, W) {
  if (!game.blackmarket) return;
  const bm = game.blackmarket;
  const heat = Math.round(bm.heat);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(12, 142, 250, 52);
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '12px monospace';
  ctx.fillText(`HEAT PASAR: ${heat}/100 (${marketHeatLevel(game)})`, 22, 160);
  ctx.fillStyle = '#333';
  ctx.fillRect(22, 166, 150, 10);
  const heatColour = heat >= 70 ? '#e74c3c' : heat >= 40 ? '#f39c12' : '#8e44ad';
  ctx.fillStyle = heatColour;
  ctx.fillRect(22, 166, 150 * Math.max(0, heat / 100), 10);
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '11px monospace';
  ctx.fillText(bm.dirtyMoney > 0 ? `KOTOR $${bm.dirtyMoney}` : 'BERSIH', 180, 175);
  ctx.fillText(`STASH ${stashWeight(bm)}/${stashCapacity(game)} • ${stashCount(bm)} brg`, 22, 190);
  paintRunBox(game, ctx, W);
}

function paintRunBox(game, ctx, W) {
  const run = runProgress(game);
  if (!run) return;
  ctx.fillStyle = 'rgba(26,26,46,0.85)';
  ctx.fillRect(W - 232, 116, 220, 78);
  ctx.fillStyle = '#e84393';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('RUN SELUNDUPAN', W - 222, 134);
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '12px monospace';
  ctx.fillText(run.label, W - 222, 152);
  ctx.fillText(`Checkpoint ${run.checkpoint} • ${run.timer} dtk`, W - 222, 170);
  ctx.fillText(`Bayaran kotor ~$${run.payout}`, W - 222, 188);
}

// Objektif di tengah atas.
function paintObjective(game, ctx, W) {
  const obj = currentObjective(game);
  if (!obj) return;
  ctx.font = 'bold 15px monospace';
  const tw = ctx.measureText(obj).width;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect((W - tw) / 2 - 14, 12, tw + 28, 30);
  ctx.fillStyle = '#f9e79f';
  ctx.fillText(obj, (W - tw) / 2, 33);
}

// Toast di kanan — empat terakhir, memudar menurut sisa waktu.
function paintToasts(game, ctx, W) {
  ctx.font = '13px monospace';
  game.toasts.slice(-4).forEach((t, i) => {
    const alpha = Math.max(0, Math.min(1, t.until - game.time));
    ctx.fillStyle = `rgba(0,0,0,${0.6 * alpha})`;
    const tw = ctx.measureText(t.text).width;
    ctx.fillRect(W - tw - 34, 118 + i * 26, tw + 20, 22);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillText(t.text, W - tw - 24, 134 + i * 26);
  });
}

// Dialog di tengah bawah.
function paintDialog(game, ctx, W, H) {
  const line = game.dialogLine ? game.dialogLine() : null;
  if (!line) return;
  ctx.font = '15px monospace';
  const tw = ctx.measureText(line).width;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect((W - tw) / 2 - 16, H - 118, tw + 32, 32);
  ctx.fillStyle = '#fff';
  ctx.fillText(line, (W - tw) / 2, H - 96);
}

// Petunjuk konteks di kiri bawah.
function paintHints(game, ctx, H) {
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const hints = contextHints(game);
  hints.forEach((h, i) => ctx.fillText(h, 14, H - 14 - (hints.length - 1 - i) * 18));
}

// Objektif di tengah atas, toast di kanan, dialog di tengah bawah,
// dan petunjuk konteks di kiri bawah.
function paintObjectiveToastsDialog(game, ctx, W, H) {
  paintObjective(game, ctx, W);
  paintToasts(game, ctx, W);
  paintDialog(game, ctx, W, H);
  paintHints(game, ctx, H);
}

// Bagian-bagian HUD berurutan — urutan gambar menentukan tumpukan.
const HUD_SECTIONS = [
  { id: 'money', paint: (game, ctx, W, H) => paintMoneyAndHealth(game, ctx) },
  { id: 'wanted', paint: (game, ctx, W, H) => paintWantedRow(game, ctx) },
  { id: 'clock', paint: paintClockAndWeapon },
  { id: 'market', paint: paintMarketStrip },
  { id: 'objective', paint: paintObjectiveToastsDialog },
  { id: 'minimap', paint: (game, ctx, W, H) => drawMinimap(game, ctx, W, H) },
  { id: 'minimap-overlay', paint: (game, ctx, W, H) => drawMinimapOverlay(game, ctx, W, H) },
];

export function drawHud(game, ctx, W, H) {
  ctx.textBaseline = 'alphabetic';
  for (const section of HUD_SECTIONS) section.paint(game, ctx, W, H);
}

// Objektif saat ini — tabel resolver, yang pertama cocok yang dipakai.
const OBJECTIVE_SOURCES = [
  {
    match: (game) => !!(game.blackmarket && game.blackmarket.run),
    build: (game) => {
      const r = game.blackmarket.run;
      return `Run selundupan: ${r.label} — checkpoint ${Math.min(r.pointI + 1, r.points.length)}/${r.points.length} (${Math.ceil(r.timer)} dtk)`;
    },
  },
  {
    match: (game) => !!game.story.active,
    build: (game) => `${game.story.active.title}: ${game.story.active.objective}`,
  },
  {
    match: (game) => !!game.story.gig,
    build: (game) => `Kerja: ${game.story.gig.objective} (${Math.ceil(game.story.gig.timer)} dtk)`,
  },
  {
    match: (game) => game.story.index < STORY.length,
    build: (game) => `Tekan F — misi berikutnya: ${STORY[game.story.index].title}`,
  },
  {
    match: () => true,
    build: () => 'Free roam — kembangkan empire-mu (B: bisnis, H: heist board)',
  },
];

export function currentObjective(game) {
  for (const source of OBJECTIVE_SOURCES) {
    if (source.match(game)) return source.build(game);
  }
  return '';
}

// Petunjuk konteks: satu baris dasar, lalu tiap aturan yang kondisinya
// benar menambah satu baris, lalu baris penutup yang selalu ada.
const HINT_RULES = [
  {
    when: (game) => !game.player.car && game.cars.some((c) => !c.driver && Math.hypot(c.x - game.player.x, c.y - game.player.y) < 70),
    line: 'E — curi mobil ini',
  },
  { when: (game) => !!game.nearProperty, line: 'B — bisnis: beli / upgrade properti ini' },
  { when: (game) => !!game.nearMember, line: 'E — rekrut anggota kru ini' },
  { when: (game) => !!game.nearDealer, line: 'G / E — pasar gelap: dealer di dekatmu (malam hari)' },
  { when: (game) => !!(game.blackmarket && game.blackmarket.run), line: 'X — batalkan run • Shift (di van) — nitro' },
  { when: (game) => game.wanted > 0, line: 'Y — suap polisi: -$400, -1 bintang' },
  { when: (game) => !!(game.blackmarket && game.blackmarket.dirtyMoney > 0), line: 'Uang kotor menunggu — cuci lewat panel dealer (G di dealer)' },
  { when: (game) => !!game.nearShop, line: 'E — toko senjata Ironworks' },
  { when: (game) => !!game.nearSafehouse, line: 'H — papan heist • P — jeda & simpan' },
];

export function contextHints(game) {
  const hints = ['WASD jalan/kemudi • E masuk-keluar mobil • Spasi pukul • Klik tembak'];
  for (const rule of HINT_RULES) {
    if (rule.when(game)) hints.push(rule.line);
  }
  hints.push('F — misi / kerja sampingan • M — suara • P — jeda');
  return hints;
}

// ---- Minimap: dasar, properti, polisi, target, panah pemain. ----

function minimapBox(W, H) {
  const mw = 210;
  const mh = 156;
  return { mw, mh, x0: W - mw - 12, y0: H - mh - 12, sx: mw / 4600, sy: mh / 3400 };
}

function paintMinimapBase(game, ctx, box) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(box.x0 - 4, box.y0 - 4, box.mw + 8, box.mh + 8);
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(box.x0, box.y0, box.mw, box.mh);
  ctx.strokeStyle = '#5d6d7e';
  ctx.lineWidth = 2;
  for (const a of AVENUES) {
    ctx.beginPath(); ctx.moveTo(box.x0 + a * box.sx, box.y0); ctx.lineTo(box.x0 + a * box.sx, box.y0 + box.mh); ctx.stroke();
  }
  for (const s of STREETS) {
    ctx.beginPath(); ctx.moveTo(box.x0, box.y0 + s * box.sy); ctx.lineTo(box.x0 + box.mw, box.y0 + s * box.sy); ctx.stroke();
  }
}

function paintMinimapProps(game, ctx, box) {
  for (const prop of Object.values(game.empire.props)) {
    ctx.fillStyle = prop.owned ? '#2ecc71' : '#f1c40f';
    ctx.fillRect(box.x0 + prop.x * box.sx - 3, box.y0 + prop.y * box.sy - 3, 6, 6);
  }
}

function paintMinimapCops(game, ctx, box) {
  ctx.fillStyle = '#e74c3c';
  for (const c of game.cars) {
    if (c.driver !== 'police') continue;
    ctx.beginPath(); ctx.arc(box.x0 + c.x * box.sx, box.y0 + c.y * box.sy, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function paintMinimapTarget(game, ctx, box) {
  const t = objectiveTarget(game);
  if (!t) return;
  ctx.fillStyle = '#f1c40f';
  ctx.beginPath();
  ctx.arc(box.x0 + t.x * box.sx, box.y0 + t.y * box.sy, 5, 0, Math.PI * 2);
  ctx.fill();
}

function paintMinimapPlayer(game, ctx, box) {
  const px = box.x0 + game.player.x * box.sx;
  const py = box.y0 + game.player.y * box.sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(game.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.strokeRect(box.x0 - 4, box.y0 - 4, box.mw + 8, box.mh + 8);
}

export function drawMinimap(game, ctx, W, H) {
  const box = minimapBox(W, H);
  paintMinimapBase(game, ctx, box);
  paintMinimapProps(game, ctx, box);
  paintMinimapCops(game, ctx, box);
  paintMinimapTarget(game, ctx, box);
  paintMinimapPlayer(game, ctx, box);
}

export function objectiveTarget(game) {
  if (game.blackmarket && game.blackmarket.run) return { x: game.blackmarket.run.tx, y: game.blackmarket.run.ty };
  if (game.story.active) return { x: game.story.active.tx, y: game.story.active.ty };
  if (game.story.gig) return { x: game.story.gig.tx, y: game.story.gig.ty };
  return null;
}

// Panel generik: layar gelap, kotak tengah berbingkai emas, judul,
// baris-baris, dan catatan kaki.
function panel(ctx, W, H, title, lines, footer) {
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, W, H);
  const w = 640;
  const h = 120 + lines.length * 30;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(title, x + 24, y + 40);
  ctx.font = '15px monospace';
  ctx.fillStyle = '#ecf0f1';
  lines.forEach((ln, i) => ctx.fillText(ln, x + 24, y + 78 + i * 30));
  if (footer) {
    ctx.fillStyle = '#95a5a6';
    ctx.font = '13px monospace';
    ctx.fillText(footer, x + 24, y + h - 18);
  }
}

// Baris-baris judul: [warna, font, dy, teks] — digambar berurutan
// dari tengah layar, supaya menambah baris tidak menggeser yang lain.
function titleLines(game) {
  const rows = [
    { colour: '#f1c40f', font: 'bold 54px monospace', dy: -90, text: 'AURELIA NIGHTS II' },
    { colour: '#e84393', font: 'bold 26px monospace', dy: -52, text: '— Empire of the Storm —' },
    { colour: '#fff', font: '16px monospace', dy: -8, text: 'Port Aurelia setahun setelah perampokan bank. Sekarang kotanya untuk dijual.' },
    { colour: '#fff', font: '16px monospace', dy: 20, text: 'Beli bisnis • rekrut kru • rencanakan heist • bertahan di tengah badai.' },
    {
      colour: '#2ecc71', font: 'bold 18px monospace', dy: 70,
      text: game.hasSave ? 'ENTER — lanjutkan simpanan   |   N — permainan baru' : 'ENTER / klik — mulai',
    },
    { colour: '#95a5a6', font: '13px monospace', dy: 104, text: 'WASD jalan & kemudi • E mobil • Spasi pukul • Klik tembak • B bisnis • H heist • F misi • G pasar gelap (malam)' },
  ];
  return rows;
}

function paintTitlePanel(game, ctx, W, H) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  for (const row of titleLines(game)) {
    ctx.fillStyle = row.colour;
    ctx.font = row.font;
    ctx.fillText(row.text, W / 2, H / 2 + row.dy);
  }
  // Ringkasan sesi di bawah judul — jarak, waktu, dan capaian sejauh ini.
  const stats = sessionStatsLines(game);
  if (stats.length > 0) {
    ctx.fillStyle = '#95a5a6';
    ctx.font = '13px monospace';
    stats.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 + 132 + i * 18));
  }
  ctx.textAlign = 'left';
}

// ---- Panel per layar: tiap layar punya builder barisnya sendiri. ----

function pausePanelLines(game) {
  return [
    `Uang: $${game.money.toLocaleString('en-US')}   •   Misi selesai: ${game.stats.missionsDone}/6`,
    `Bisnis dimiliki: ${ownedCount(game.empire)}   •   Heist selesai: ${game.stats.heistsDone}`,
    `Total penghasilan bisnis: $${game.empire.earnedTotal.toLocaleString('en-US')}`,
    game.blackmarket
      ? `Pasar gelap: reputasi ${game.blackmarket.rep} • run selesai ${game.blackmarket.runsDone} • uang kotor $${game.blackmarket.dirtyMoney.toLocaleString('en-US')} • dicuci $${game.blackmarket.washedTotal.toLocaleString('en-US')}`
      : 'Pasar gelap: belum dibuka',
  ];
}

function overPanelLines(game) {
  return [
    game.busted ? 'Polisi menangkapmu di jalan.' : 'Kai tidak selamat dari Port Aurelia.',
    `Uang yang tersisa: $${game.money.toLocaleString('en-US')}`,
    'Simpanan terakhir tetap aman di loteng.',
  ];
}

function businessPanelLines(game) {
  return Object.values(game.empire.props).map((pr, i) => {
    const status = pr.owned
      ? `LEVEL ${pr.level} — $${incomePerHour(game, pr)}/jam  ${pr.level < 3 ? `[${i + 1} upgrade $${pr.upgrade[pr.level - 1]}]` : '[MAX]'}`
      : `BELUM DIMILIKI — beli $${pr.price}  [${i + 1}]`;
    return `${pr.name} (${pr.kind}) — ${status}`;
  });
}

function heistPanelLines(game) {
  const lines = Object.values(game.crew.heists).map((hz, i) => {
    const miss = heistMissing(game, hz);
    const pay = heistPayout(game, hz);
    const state = hz.done ? `SELESAI ${hz.times}x` : !miss.prep ? 'BUTUH PREP' : miss.missing.length ? `BUTUH KRU: ${miss.missing.map((id) => game.crew.members[id].name).join(', ')}` : 'SIAP';
    return `${i + 1}. ${hz.name} — ${hz.target} — bersih $${pay.net.toLocaleString('en-US')} — ${state}`;
  });
  lines.push('');
  lines.push(`Kru disewa: ${Object.values(game.crew.members).filter((m) => m.hired).map((m) => `${m.name} (${m.role}, potongan ${Math.round(m.cut * 100)}%)`).join('  •  ') || 'belum ada'}`);
  lines.push(`Total potongan kru: ${Math.round(crewCut(game) * 100)}% dari setiap heist.`);
  return lines;
}

function shopPanelLines(game) {
  const priceBook = {
    pistol: { price: 0, ammoPrice: 25 },
    shotgun: { price: 1200, ammoPrice: 60 },
    smg: { price: 2400, ammoPrice: 45 },
  };
  return Object.values(game.arsenal.guns).map((g, i) => {
    const def = priceBook[g.id];
    return `${i + 1}. ${g.name} — ${g.owned ? `dimiliki, ${g.ammo} peluru (isi ulang $${def.ammoPrice})` : `beli $${def.price}`}`;
  });
}

const PANEL_BUILDERS = {
  [SCREEN_PAUSE]: {
    title: 'JEDA',
    lines: pausePanelLines,
    footer: 'P / Esc — lanjut  •  R — muat simpanan  •  N — permainan baru',
  },
  [SCREEN_OVER]: {
    title: (game) => (game.busted ? 'BUSTED!' : 'WASTED!'),
    lines: overPanelLines,
    footer: 'ENTER — coba lagi dari simpanan',
  },
  [SCREEN_BUSINESS]: {
    title: 'EMPIRE — BISNIS PORT AURELIA',
    lines: businessPanelLines,
    footer: 'Tekan 1-4 untuk beli / upgrade  •  B / Esc — tutup',
  },
  [SCREEN_HEIST]: {
    title: 'PAPAN HEIST — LOTENG KAI',
    lines: heistPanelLines,
    footer: 'Heist dijalankan lewat misi cerita (F)  •  H / Esc — tutup',
  },
  [SCREEN_SHOP]: {
    title: 'IRONWORKS — TOKO SENJATA',
    lines: shopPanelLines,
    footer: 'Tekan 1-3 untuk beli / isi ulang  •  E / Esc — tutup  •  1/2/3 di jalan untuk ganti senjata',
  },
};

export function drawPanel(game, ctx, W, H) {
  if (game.screen === SCREEN_TITLE) {
    paintTitlePanel(game, ctx, W, H);
    return;
  }
  if (game.screen === SCREEN_BLACKMARKET) {
    const dealer = game.nearDealer;
    if (!dealer) { game.screen = SCREEN_PLAY; return; }
    const lines = dealerPanelLines(game, dealer);
    const n = dealer.stock.length;
    panel(ctx, W, H, 'PASAR GELAP — PORT AURELIA', lines,
      `Tekan 1-${n} beli  •  ${n + 1} jual semua  •  ${n + 2} mulai run  •  ${n + 3} cuci uang  •  J/K/L amunisi selundupan  •  G / Esc — tutup`);
    return;
  }
  const spec = PANEL_BUILDERS[game.screen];
  if (!spec) return;
  const title = typeof spec.title === 'function' ? spec.title(game) : spec.title;
  panel(ctx, W, H, title, spec.lines(game), spec.footer);
}
