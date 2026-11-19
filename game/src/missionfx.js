// Mission FX — penanda misi dan keterbacaan HUD Port Aurelia.
//
// Masalah yang diperbaiki: pemain sering tidak tahu harus ke mana —
// target misi hanya titik kecil di minimap, teks objektif tenggelam di
// antara toast, dan minimap gelap tanpa label arah. Modul ini menambahkan
// tiga hal yang selalu terlihat: (1) beacon cahaya di dunia + panah tepi
// layar saat target di luar layar, (2) banner objektif dengan progress
// bar dan jarak, (3) kompas strip + bingkai minimap yang lebih jelas.
//
// Ditulis ulang round 4b: sumber target kini berupa tabel resolver —
// missionTarget() mencoba tiap sumber berurutan sampai satu cocok —
// dan tiap gambar (beacon, banner, kompas, minimap) dipecah menjadi
// pelukis-pelukis kecil yang dijalankan lewat registry. Menambah jenis
// target baru berarti menambah satu baris tabel, bukan satu cabang if.
//
// Modul ini sengaja TIDAK mengimpor hud.js (hud mengimpor modul ini):
// target misi dibaca langsung dari state game (story.active, gig,
// blackmarket.run) supaya tidak ada impor melingkar.

import { clockLabel } from './sky.js';

// Warna per jenis target: misi cerita emas, kerja sampingan hijau,
// selundupan ungu, heist merah muda. Konsisten dengan warna panel lain.
export const TARGET_COLOURS = {
  story: '#f1c40f',
  gig: '#2ecc71',
  smuggle: '#9b59b6',
  heist: '#e84393',
  free: '#95a5a6',
};

export const COMPASS_POINTS = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'];

// Jumlah misi cerita — dipakai progres banner dan ringkasan.
const STORY_TOTAL = 5;

export function createMissionFx() {
  return {
    pulse: 0,
    ringPhase: 0,
    bannerFlash: 0,
    bannerText: '',
    lastStoryIndex: 0,
    lastActiveId: null,
    compassSmooth: 0,
    beaconSeen: 0,
    time: 0,
  };
}

// ------------------------------------------------------------------
// Sumber target: tabel resolver berurutan.
//
// Tiap entri punya `match(game)` — benar bila sumber ini yang aktif —
// dan `build(game)` — yang merakit objek target {x, y, kind, label,
// progress, progressText, timer}. Urutan tabel = prioritas: run
// selundupan mengalahkan misi cerita, misi cerita mengalahkan gig,
// dan bila tidak ada yang aktif, jatuh ke free roam.
// ------------------------------------------------------------------

function smuggleTarget(game) {
  const r = game.blackmarket.run;
  const points = r.points || [];
  const done = Math.min(r.pointI + 1, points.length);
  return {
    x: r.tx, y: r.ty, kind: 'smuggle',
    label: `Run selundupan: ${r.label || 'antar barang'}`,
    progress: points.length ? done / points.length : 0,
    progressText: points.length ? `Checkpoint ${done}/${points.length}` : '',
    timer: r.timer,
  };
}

function storyTarget(game) {
  const a = game.story.active;
  const done = Math.min((game.story.index || 0) + 1, STORY_TOTAL);
  return {
    x: a.tx, y: a.ty, kind: 'story',
    label: `${a.title || 'Misi'}: ${a.objective || ''}`,
    progress: missionStoryProgress(game),
    progressText: `Misi ${done}/${STORY_TOTAL}`,
    timer: null,
  };
}

function gigTarget(game) {
  const g = game.story.gig;
  const left = g.timer ? Math.max(0, Math.min(1, g.timer / 120)) : 0;
  return {
    x: g.tx, y: g.ty, kind: 'gig',
    label: `Kerja: ${g.objective || ''}`,
    progress: left,
    progressText: g.timer ? `${Math.ceil(g.timer)} dtk` : '',
    timer: g.timer,
  };
}

function freeTarget(game) {
  const moreStory = game.story && game.story.index < STORY_TOTAL;
  return {
    x: null, y: null, kind: 'free',
    label: moreStory ? 'Tekan F — misi berikutnya' : 'Free roam — kembangkan empire-mu',
    progress: 0, progressText: '', timer: null,
  };
}

const TARGET_SOURCES = [
  { id: 'smuggle', match: (game) => !!(game.blackmarket && game.blackmarket.run), build: smuggleTarget },
  { id: 'story', match: (game) => !!(game.story && game.story.active), build: storyTarget },
  { id: 'gig', match: (game) => !!(game.story && game.story.gig), build: gigTarget },
  { id: 'free', match: () => true, build: freeTarget },
];

// Target misi saat ini, dibaca dari state yang sama dengan HUD.
// Mengembalikan {x, y, kind, label} atau null saat free roam.
export function missionTarget(game) {
  for (const source of TARGET_SOURCES) {
    if (source.match(game)) return source.build(game);
  }
  return null;
}

// Progres cerita: misi selesai / 5 misi. Dipakai banner dan kompas.
export function missionStoryProgress(game) {
  const done = game.story ? (game.story.index || 0) : 0;
  return Math.max(0, Math.min(1, done / STORY_TOTAL));
}

// Jarak ke target: meter dan label yang enak dibaca ("340 m", "1.2 km").
export function missionDistance(game) {
  const t = missionTarget(game);
  if (!t || t.x === null || t.x === undefined) return null;
  const d = Math.hypot(t.x - game.player.x, t.y - game.player.y);
  const label = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
  return { metres: Math.round(d), label, target: t };
}

export function beaconColour(game) {
  const t = missionTarget(game);
  return TARGET_COLOURS[t ? t.kind : 'free'] || '#f1c40f';
}

// Arah kompas ke target dalam radian, 0 = utara (atas peta).
export function bearingToTarget(game) {
  const t = missionTarget(game);
  if (!t || t.x === null || t.x === undefined) return null;
  return Math.atan2(t.x - game.player.x, -(t.y - game.player.y));
}

// Bungkus selisih sudut ke (-π, π] untuk kompas dan panah.
function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ------------------------------------------------------------------
// Step: denyut animasi + deteksi perubahan misi.
//
// Dua pengamat kecil: satu untuk misi yang selesai (story.index naik),
// satu untuk misi baru yang dimulai (active id berganti). Keduanya
// hanya menyalakan bannerFlash dan bannerText; gambarnya urusan draw.
// ------------------------------------------------------------------

function noticeStoryAdvance(game, fx) {
  const idx = game.story ? (game.story.index || 0) : 0;
  if (idx > fx.lastStoryIndex) {
    fx.lastStoryIndex = idx;
    fx.bannerFlash = 2.4;
    fx.bannerText = idx >= STORY_TOTAL
      ? 'SEMUA MISI CERITA SELESAI!'
      : `MISI ${idx}/${STORY_TOTAL} SELESAI — LANJUTKAN!`;
    // Teks melayang di atas pemain, lewat antrean floats visuals.
    if (game.visuals && game.player && game.visuals.floats) {
      game.visuals.floats.push({
        x: game.player.x, y: game.player.y - 40,
        text: fx.bannerText, colour: '#f1c40f', life: 2.4, maxLife: 2.4,
      });
    }
  }
  if (idx < fx.lastStoryIndex) fx.lastStoryIndex = idx;
}

function noticeNewMission(game, fx) {
  const active = game.story && game.story.active ? game.story.active : null;
  const activeId = active ? (active.id || active.title) : null;
  if (activeId && activeId !== fx.lastActiveId) {
    fx.lastActiveId = activeId;
    fx.bannerFlash = 1.6;
    fx.bannerText = active.title ? `MISI BARU: ${active.title}` : 'MISI BARU DIMULAI';
  }
  if (!activeId) fx.lastActiveId = null;
}

export function stepMissionFx(game, dt) {
  const fx = game.missionFx;
  if (!fx) return;
  fx.time += dt;
  fx.pulse += dt;
  fx.ringPhase = (fx.ringPhase + dt * 1.4) % (Math.PI * 2);
  if (fx.bannerFlash > 0) fx.bannerFlash = Math.max(0, fx.bannerFlash - dt);
  noticeStoryAdvance(game, fx);
  noticeNewMission(game, fx);
}

// ------------------------------------------------------------------
// Beacon dunia: kolom cahaya + cincin berdenyut + penanda melayang.
// Digambar dalam koordinat dunia, setelah drawWorldFx.
//
// Bila target di layar: tiga pelukis BEACON_PARTS jalan berurutan.
// Bila di luar layar: panah tepi layar + jarak, supaya pemain tidak
// pernah buta arah.
// ------------------------------------------------------------------

// Posisi target di layar + denyut saat ini, dipakai semua pelukis beacon.
function beaconFrame(game, ctx, W, H) {
  const fx = game.missionFx;
  const t = missionTarget(game);
  if (!t || t.x === null || t.x === undefined) return null;
  const cam = game.camera || { x: 1430, y: 1370 };
  const x0 = cam.x - W / 2;
  const y0 = cam.y - H / 2;
  const sx = t.x - x0;
  const sy = t.y - y0;
  return {
    target: t,
    colour: TARGET_COLOURS[t.kind] || '#f1c40f',
    pulse: fx ? 0.5 + 0.5 * Math.sin(fx.pulse * 3) : 0.7,
    ringPhase: fx ? fx.ringPhase : 0,
    bob: fx ? Math.sin(fx.pulse * 3) * 7 : 0,
    sx, sy,
    onScreen: sx > -40 && sx < W + 40 && sy > -40 && sy < H + 40,
  };
}

function paintLightColumn(ctx, f) {
  // Kolom cahaya vertikal: gradien dari tanah ke langit.
  const col = ctx.createLinearGradient(0, f.sy - 260, 0, f.sy + 10);
  col.addColorStop(0, 'rgba(255,255,255,0)');
  col.addColorStop(1, f.colour);
  ctx.globalAlpha = 0.22 + 0.14 * f.pulse;
  ctx.fillStyle = col;
  ctx.fillRect(f.sx - 13, f.sy - 260, 26, 270);
  ctx.globalAlpha = 1;
}

function paintGroundRings(ctx, f) {
  // Cincin tanah berdenyut + cincin kedua yang membesar lalu hilang.
  const ringR = 34 + 10 * Math.sin(f.ringPhase);
  ctx.strokeStyle = f.colour;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(f.sx, f.sy, ringR, 0, Math.PI * 2);
  ctx.stroke();
  const phase01 = f.ringPhase / (Math.PI * 2);
  const echoR = 34 + phase01 * 46;
  ctx.globalAlpha = 0.3 * (1 - phase01);
  ctx.beginPath();
  ctx.arc(f.sx, f.sy, echoR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function paintDiamondMarker(ctx, f) {
  // Penanda berlian melayang di atas target.
  const my = f.sy - 58 + f.bob;
  ctx.fillStyle = f.colour;
  ctx.beginPath();
  ctx.moveTo(f.sx, my - 15);
  ctx.lineTo(f.sx + 12, my);
  ctx.lineTo(f.sx, my + 15);
  ctx.lineTo(f.sx - 12, my);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.beginPath();
  ctx.arc(f.sx, my, 4, 0, Math.PI * 2);
  ctx.fill();
}

const BEACON_PARTS = [paintLightColumn, paintGroundRings, paintDiamondMarker];

function paintEdgeArrow(game, ctx, W, H, f) {
  const cx = W / 2;
  const cy = H / 2;
  const dx = f.sx - cx;
  const dy = f.sy - cy;
  const angle = Math.atan2(dy, dx);
  const radius = Math.min(W, H) / 2 - 44;
  const ex = cx + Math.cos(angle) * radius;
  const ey = cy + Math.sin(angle) * radius;
  const dist = missionDistance(game);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(angle);
  ctx.fillStyle = f.colour;
  ctx.globalAlpha = 0.75 + 0.25 * f.pulse;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-10, -13);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-10, 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  const label = dist ? dist.label : '';
  const tw = ctx.measureText(label).width;
  ctx.fillRect(ex - tw / 2 - 7, ey - 42, tw + 14, 20);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, ex, ey - 27);
  ctx.textAlign = 'left';
}

export function drawMissionBeacon(game, ctx, W, H) {
  const f = beaconFrame(game, ctx, W, H);
  if (!f) return;
  if (f.onScreen) {
    for (const part of BEACON_PARTS) part(ctx, f);
  } else {
    paintEdgeArrow(game, ctx, W, H, f);
  }
}

// ------------------------------------------------------------------
// Banner objektif: baris kedua di bawah kotak objektif HUD lama.
// Progress bar + jarak + kilat saat misi berubah. Tidak menutupi kotak
// lama (kotak lama di y 12..42, banner di y 46..72).
//
// Geometri banner dihitung sekali di bannerBox(), lalu tiga pelukis
// (bingkai, progress, teks) mengisinya.
// ------------------------------------------------------------------

function bannerBox(W) {
  const bw = Math.min(560, W - 560);
  return { bw, bx: (W - bw) / 2, by: 46, bh: 26, barW: 110 };
}

function paintBannerFrame(ctx, box, colour, flash) {
  ctx.fillStyle = flash > 0 ? 'rgba(241,196,15,0.92)' : 'rgba(0,0,0,0.62)';
  ctx.fillRect(box.bx, box.by, box.bw, box.bh);
  ctx.strokeStyle = colour;
  ctx.lineWidth = flash > 0 ? 2.5 : 1.5;
  ctx.strokeRect(box.bx, box.by, box.bw, box.bh);
}

function paintBannerProgress(ctx, box, colour, progress) {
  // Progress bar di sisi kiri banner.
  const barW = box.barW;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(box.bx + 8, box.by + 7, barW, 12);
  ctx.fillStyle = colour;
  ctx.fillRect(box.bx + 8, box.by + 7, barW * Math.max(0, Math.min(1, progress || 0)), 12);
}

function paintBannerTexts(game, ctx, W, box, t, dist, flash, fx) {
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = flash > 0 ? '#111' : '#fff';
  const leftText = t.progressText || (t.kind === 'story' ? 'MISI CERITA' : t.kind.toUpperCase());
  ctx.fillText(leftText, box.bx + box.barW + 20, box.by + 18);
  // Jarak di sisi kanan banner.
  if (dist) {
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = flash > 0 ? '#111' : '#f9e79f';
    ctx.fillText(`◈ ${dist.label}`, box.bx + box.bw - 10, box.by + 18);
    ctx.textAlign = 'left';
  }
  // Kilat teks saat misi berubah: baris kecil di bawah banner.
  if (flash > 0.4 && fx && fx.bannerText) {
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(fx.bannerText).width;
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, flash).toFixed(2)})`;
    ctx.fillRect((W - tw) / 2 - 12, box.by + box.bh + 6, tw + 24, 24);
    ctx.fillStyle = '#f1c40f';
    ctx.fillText(fx.bannerText, W / 2, box.by + box.bh + 23);
    ctx.textAlign = 'left';
  }
}

export function drawObjectiveBanner(game, ctx, W, H) {
  const t = missionTarget(game);
  if (!t) return;
  const fx = game.missionFx;
  const colour = TARGET_COLOURS[t.kind] || '#f1c40f';
  const dist = missionDistance(game);
  const flash = fx ? fx.bannerFlash : 0;
  const box = bannerBox(W);
  paintBannerFrame(ctx, box, colour, flash);
  paintBannerProgress(ctx, box, colour, t.progress);
  paintBannerTexts(game, ctx, W, box, t, dist, flash, fx);
}

// ------------------------------------------------------------------
// Kompas strip: pita arah di atas dialog, di tengah bawah layar.
// Menunjukkan mata angin + penanda emas ke arah target misi + jam game.
//
// Mata angin dihitung dari tabel COMPASS_POINTS: tiap entri punya
// sudutnya sendiri (0 = utara). Posisi di strip = selisih sudut
// terhadap arah hadap pemain, dikali skala piksel per radian.
// ------------------------------------------------------------------

function compassMarks() {
  const marks = [];
  for (let i = 0; i < COMPASS_POINTS.length; i += 1) {
    const dirAngle = (i / COMPASS_POINTS.length) * Math.PI * 2 - Math.PI / 2;
    marks.push({ label: COMPASS_POINTS[i], angle: dirAngle, cardinal: i % 2 === 0 });
  }
  return marks;
}

function paintCompassMarks(ctx, box, heading, pxPerRad) {
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  for (const mark of compassMarks()) {
    const d = wrapPi(mark.angle - heading);
    if (Math.abs(d) > Math.PI * 0.6) continue;
    const x = box.sx + box.stripW / 2 + d * pxPerRad;
    if (x > box.sx + box.stripW - 64) continue;
    ctx.fillStyle = mark.cardinal ? '#f1c40f' : 'rgba(255,255,255,0.75)';
    ctx.fillText(mark.label, x, box.sy + 16);
  }
}

function paintTargetTick(game, ctx, box, bearing, heading, pxPerRad, kind) {
  // Penanda target: segitiga emas di posisi bearing target.
  if (bearing === null || bearing === undefined) return;
  const d = wrapPi(bearing - (heading + Math.PI / 2));
  if (Math.abs(d) > Math.PI * 0.6) return;
  const x = box.sx + box.stripW / 2 + d * pxPerRad;
  ctx.fillStyle = TARGET_COLOURS[kind] || '#f1c40f';
  ctx.beginPath();
  ctx.moveTo(x, box.sy + 3);
  ctx.lineTo(x - 6, box.sy + 13);
  ctx.lineTo(x + 6, box.sy + 13);
  ctx.closePath();
  ctx.fill();
}

function paintCompassClock(game, ctx, box) {
  // Jam game di ujung kanan strip supaya pemain sadar pergantian hari.
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(clockLabel(game.sky), box.sx + box.stripW - 6, box.sy + 16);
  ctx.textAlign = 'left';
  // Garis tengah strip: arah hadap pemain saat ini.
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(box.sx + box.stripW / 2, box.sy + 2);
  ctx.lineTo(box.sx + box.stripW / 2, box.sy + 7);
  ctx.stroke();
}

export function drawCompassStrip(game, ctx, W, H) {
  const t = missionTarget(game);
  const bearing = bearingToTarget(game);
  const stripW = Math.min(460, W - 40);
  const box = { sx: (W - stripW) / 2, sy: H - 152, sh: 22, stripW };
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(box.sx, box.sy, stripW, box.sh);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(box.sx, box.sy, stripW, box.sh);
  // Garis tengah = arah hadap pemain; mata angin digeser relatif ke situ.
  const heading = game.player ? game.player.angle : 0;
  const pxPerRad = stripW / (Math.PI * 1.2);
  paintCompassMarks(ctx, box, heading, pxPerRad);
  paintTargetTick(game, ctx, box, bearing, heading, pxPerRad, t ? t.kind : 'free');
  paintCompassClock(game, ctx, box);
}

// ------------------------------------------------------------------
// Overlay minimap: bingkai yang bicara — panah utara, label, denyut
// target, dan bingkai merah saat diburu polisi. Digambar setelah
// drawMinimap dari hud, menimpa tepinya saja.
// ------------------------------------------------------------------

function minimapBox(W, H) {
  const mw = 210;
  const mh = 156;
  return { mw, mh, x0: W - mw - 12, y0: H - mh - 12 };
}

function paintMinimapFrame(game, ctx, box, pulse) {
  // Bingkai merah berdenyut saat wanted > 0 — bahaya langsung terlihat
  // tanpa harus membaca bintang.
  if (game.wanted > 0) {
    ctx.strokeStyle = `rgba(231,76,60,${(0.5 + 0.5 * pulse).toFixed(2)})`;
    ctx.lineWidth = 3;
  } else {
    ctx.strokeStyle = 'rgba(241,196,15,0.85)';
    ctx.lineWidth = 2;
  }
  ctx.strokeRect(box.x0 - 6, box.y0 - 6, box.mw + 12, box.mh + 12);
}

function paintMinimapLabels(ctx, box) {
  // Label + panah utara di atas minimap.
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(box.x0 - 6, box.y0 - 26, 96, 18);
  ctx.fillStyle = '#f1c40f';
  ctx.fillText('▲ U  PETA', box.x0 - 2, box.y0 - 13);
  // Legenda kecil di ATAS minimap (di bawah label PETA): titik-titik
  // yang dipakai — di bawah minimap terpotong tepi layar.
  ctx.font = '11px monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(box.x0 - 6, box.y0 - 48, box.mw + 12, 18);
  const legend = [
    { colour: '#2ecc71', text: '■ milikmu', x: 2 },
    { colour: '#e74c3c', text: '● polisi', x: 78 },
    { colour: '#f1c40f', text: '● target', x: 148 },
  ];
  for (const entry of legend) {
    ctx.fillStyle = entry.colour;
    ctx.fillText(entry.text, box.x0 + entry.x, box.y0 - 35);
  }
}

function paintMinimapPulse(game, ctx, box, pulse) {
  // Denyut target di atas titik minimap lama: cincin yang membesar.
  const t = missionTarget(game);
  if (!t || t.x === null || t.x === undefined) return;
  const sx = box.mw / 4600;
  const sy = box.mh / 3400;
  const tx = box.x0 + t.x * sx;
  const ty = box.y0 + t.y * sy;
  const r = 6 + pulse * 7;
  ctx.strokeStyle = `rgba(241,196,15,${(1 - pulse * 0.55).toFixed(2)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tx, ty, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawMinimapOverlay(game, ctx, W, H) {
  const box = minimapBox(W, H);
  const fx = game.missionFx;
  const pulse = fx ? 0.5 + 0.5 * Math.sin(fx.pulse * 3) : 0.7;
  paintMinimapFrame(game, ctx, box, pulse);
  paintMinimapLabels(ctx, box);
  paintMinimapPulse(game, ctx, box, pulse);
}

// Ringkasan misi satu baris untuk toast / panel: "MISI 2/5 • 340 m".
export function missionSummary(game) {
  const t = missionTarget(game);
  const dist = missionDistance(game);
  const done = game.story ? (game.story.index || 0) : 0;
  const distText = dist ? ` • ${dist.label}` : '';
  return `MISI ${done}/${STORY_TOTAL} — ${t ? t.label : 'free roam'}${distText}`;
}
