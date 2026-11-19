// Mission FX — penanda misi dan keterbacaan HUD Port Aurelia.
//
// Masalah yang diperbaiki: pemain sering tidak tahu harus ke mana —
// target misi hanya titik kecil di minimap, teks objektif tenggelam di
// antara toast, dan minimap gelap tanpa label arah. Modul ini menambahkan
// tiga hal yang selalu terlihat: (1) beacon cahaya di dunia + panah tepi
// layar saat target di luar layar, (2) banner objektif dengan progress
// bar dan jarak, (3) kompas strip + bingkai minimap yang lebih jelas.
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

// Target misi saat ini, dibaca dari state yang sama dengan HUD.
// Mengembalikan {x, y, kind, label} atau null saat free roam.
export function missionTarget(game) {
  if (game.blackmarket && game.blackmarket.run) {
    const r = game.blackmarket.run;
    return {
      x: r.tx, y: r.ty, kind: 'smuggle',
      label: `Run selundupan: ${r.label || 'antar barang'}`,
      progress: r.points ? Math.min(r.pointI + 1, r.points.length) / r.points.length : 0,
      progressText: r.points ? `Checkpoint ${Math.min(r.pointI + 1, r.points.length)}/${r.points.length}` : '',
      timer: r.timer,
    };
  }
  if (game.story && game.story.active) {
    const a = game.story.active;
    return {
      x: a.tx, y: a.ty, kind: 'story',
      label: `${a.title || 'Misi'}: ${a.objective || ''}`,
      progress: missionStoryProgress(game),
      progressText: `Misi ${Math.min((game.story.index || 0) + 1, 5)}/5`,
      timer: null,
    };
  }
  if (game.story && game.story.gig) {
    const g = game.story.gig;
    return {
      x: g.tx, y: g.ty, kind: 'gig',
      label: `Kerja: ${g.objective || ''}`,
      progress: g.timer ? Math.max(0, Math.min(1, g.timer / 120)) : 0,
      progressText: g.timer ? `${Math.ceil(g.timer)} dtk` : '',
      timer: g.timer,
    };
  }
  if (game.story && game.story.index < 5) {
    return { x: null, y: null, kind: 'free', label: 'Tekan F — misi berikutnya', progress: 0, progressText: '', timer: null };
  }
  return { x: null, y: null, kind: 'free', label: 'Free roam — kembangkan empire-mu', progress: 0, progressText: '', timer: null };
}

// Progres cerita: misi selesai / 5 misi. Dipakai banner dan kompas.
export function missionStoryProgress(game) {
  const done = game.story ? (game.story.index || 0) : 0;
  const total = 5;
  return Math.max(0, Math.min(1, done / total));
}

export function missionDistance(game) {
  const t = missionTarget(game);
  if (!t || t.x === null || t.x === undefined) return null;
  const d = Math.hypot(t.x - game.player.x, t.y - game.player.y);
  return { metres: Math.round(d), label: d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`, target: t };
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

export function stepMissionFx(game, dt) {
  const fx = game.missionFx;
  if (!fx) return;
  fx.time += dt;
  fx.pulse += dt;
  fx.ringPhase = (fx.ringPhase + dt * 1.4) % (Math.PI * 2);
  if (fx.bannerFlash > 0) fx.bannerFlash = Math.max(0, fx.bannerFlash - dt);

  // Misi selesai = story.index naik: kilatkan banner + teks melayang.
  const idx = game.story ? (game.story.index || 0) : 0;
  if (idx > fx.lastStoryIndex) {
    fx.lastStoryIndex = idx;
    fx.bannerFlash = 2.4;
    fx.bannerText = idx >= 5 ? 'SEMUA MISI CERITA SELESAI!' : `MISI ${idx}/5 SELESAI — LANJUTKAN!`;
    if (game.visuals && game.player) {
      const visuals = game.visuals;
      if (visuals.floats) {
        visuals.floats.push({
          x: game.player.x, y: game.player.y - 40,
          text: fx.bannerText, colour: '#f1c40f', life: 2.4, maxLife: 2.4,
        });
      }
    }
  }
  if (idx < fx.lastStoryIndex) fx.lastStoryIndex = idx;

  // Misi baru dimulai: kilatkan banner sekali supaya pemain sadar.
  const activeId = game.story && game.story.active ? (game.story.active.id || game.story.active.title) : null;
  if (activeId && activeId !== fx.lastActiveId) {
    fx.lastActiveId = activeId;
    fx.bannerFlash = 1.6;
    fx.bannerText = game.story.active.title ? `MISI BARU: ${game.story.active.title}` : 'MISI BARU DIMULAI';
  }
  if (!activeId) fx.lastActiveId = null;
}

// ---- Beacon dunia: kolom cahaya + cincin berdenyut + penanda melayang.
// Digambar dalam koordinat dunia, setelah drawWorldFx.

export function drawMissionBeacon(game, ctx, W, H) {
  const fx = game.missionFx;
  const t = missionTarget(game);
  if (!t || t.x === null || t.x === undefined) return;
  const cam = game.camera || { x: 1430, y: 1370 };
  const x0 = cam.x - W / 2;
  const y0 = cam.y - H / 2;
  const sx = t.x - x0;
  const sy = t.y - y0;
  const colour = TARGET_COLOURS[t.kind] || '#f1c40f';
  const pulse = fx ? 0.5 + 0.5 * Math.sin(fx.pulse * 3) : 0.7;
  const onScreen = sx > -40 && sx < W + 40 && sy > -40 && sy < H + 40;

  if (onScreen) {
    // Kolom cahaya vertikal: gradien dari tanah ke langit.
    const col = ctx.createLinearGradient(0, sy - 260, 0, sy + 10);
    col.addColorStop(0, 'rgba(255,255,255,0)');
    col.addColorStop(1, colour);
    ctx.globalAlpha = 0.22 + 0.14 * pulse;
    ctx.fillStyle = col;
    ctx.fillRect(sx - 13, sy - 260, 26, 270);
    ctx.globalAlpha = 1;

    // Cincin tanah berdenyut + cincin kedua yang membesar lalu hilang.
    const ringR = 34 + 10 * Math.sin(fx ? fx.ringPhase : 0);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    const echoR = 34 + ((fx ? fx.ringPhase : 0) / (Math.PI * 2)) * 46;
    ctx.globalAlpha = 0.3 * (1 - ((fx ? fx.ringPhase : 0) / (Math.PI * 2)));
    ctx.beginPath();
    ctx.arc(sx, sy, echoR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Penanda berlian melayang di atas target.
    const bob = Math.sin((fx ? fx.pulse * 3 : 0)) * 7;
    const my = sy - 58 + bob;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(sx, my - 15);
    ctx.lineTo(sx + 12, my);
    ctx.lineTo(sx, my + 15);
    ctx.lineTo(sx - 12, my);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath();
    ctx.arc(sx, my, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Target di luar layar: panah di tepi layar + jarak, supaya pemain
    // tidak pernah buta arah.
    const cx = W / 2;
    const cy = H / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const angle = Math.atan2(dy, dx);
    const ex = cx + Math.cos(angle) * (Math.min(W, H) / 2 - 44);
    const ey = cy + Math.sin(angle) * (Math.min(W, H) / 2 - 44);
    const dist = missionDistance(game);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(angle);
    ctx.fillStyle = colour;
    ctx.globalAlpha = 0.75 + 0.25 * pulse;
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
}

// ---- Banner objektif: baris kedua di bawah kotak objektif HUD lama.
// Progress bar + jarak + kilat saat misi berubah. Tidak menutupi kotak
// lama (kotak lama di y 12..42, banner di y 46..72).

export function drawObjectiveBanner(game, ctx, W, H) {
  const t = missionTarget(game);
  if (!t) return;
  const fx = game.missionFx;
  const colour = TARGET_COLOURS[t.kind] || '#f1c40f';
  const dist = missionDistance(game);
  const flash = fx ? fx.bannerFlash : 0;

  const bw = Math.min(560, W - 560);
  const bx = (W - bw) / 2;
  const by = 46;
  const bh = 26;

  ctx.fillStyle = flash > 0 ? 'rgba(241,196,15,0.92)' : 'rgba(0,0,0,0.62)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = colour;
  ctx.lineWidth = flash > 0 ? 2.5 : 1.5;
  ctx.strokeRect(bx, by, bw, bh);

  // Progress bar di sisi kiri banner.
  const barW = 110;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(bx + 8, by + 7, barW, 12);
  ctx.fillStyle = colour;
  ctx.fillRect(bx + 8, by + 7, barW * Math.max(0, Math.min(1, t.progress || 0)), 12);

  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = flash > 0 ? '#111' : '#fff';
  const leftText = t.progressText || (t.kind === 'story' ? 'MISI CERITA' : t.kind.toUpperCase());
  ctx.fillText(leftText, bx + barW + 20, by + 18);

  // Jarak di sisi kanan banner.
  if (dist) {
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = flash > 0 ? '#111' : '#f9e79f';
    ctx.fillText(`◈ ${dist.label}`, bx + bw - 10, by + 18);
    ctx.textAlign = 'left';
  }

  // Kilat teks saat misi berubah: baris kecil di bawah banner.
  if (flash > 0.4 && fx && fx.bannerText) {
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(fx.bannerText).width;
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, flash).toFixed(2)})`;
    ctx.fillRect((W - tw) / 2 - 12, by + bh + 6, tw + 24, 24);
    ctx.fillStyle = '#f1c40f';
    ctx.fillText(fx.bannerText, W / 2, by + bh + 23);
    ctx.textAlign = 'left';
  }
}

// ---- Kompas strip: pita arah di atas dialog, di tengah bawah layar.
// Menunjukkan mata angin + penanda emas ke arah target misi + jam game.

export function drawCompassStrip(game, ctx, W, H) {
  const t = missionTarget(game);
  const bearing = bearingToTarget(game);
  const stripW = Math.min(460, W - 40);
  const sx = (W - stripW) / 2;
  const sy = H - 152;
  const sh = 22;

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(sx, sy, stripW, sh);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx, sy, stripW, sh);

  // Garis tengah = arah hadap pemain; mata angin digeser relatif ke situ.
  const heading = game.player ? game.player.angle : 0;
  const northAngle = -Math.PI / 2;
  let rel = heading - northAngle;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  const pxPerRad = stripW / (Math.PI * 1.2);

  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i < 8; i += 1) {
    const dirAngle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    let d = dirAngle - heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > Math.PI * 0.6) continue;
    const x = sx + stripW / 2 + d * pxPerRad;
    if (x > sx + stripW - 64) continue;
    const isCardinal = i % 2 === 0;
    ctx.fillStyle = isCardinal ? '#f1c40f' : 'rgba(255,255,255,0.75)';
    ctx.fillText(COMPASS_POINTS[i], x, sy + 16);
  }

  // Penanda target: segitiga emas di posisi bearing target.
  if (bearing !== null && bearing !== undefined) {
    let d = bearing - (heading + Math.PI / 2);
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= Math.PI * 0.6) {
      const x = sx + stripW / 2 + d * pxPerRad;
      ctx.fillStyle = TARGET_COLOURS[t.kind] || '#f1c40f';
      ctx.beginPath();
      ctx.moveTo(x, sy + 3);
      ctx.lineTo(x - 6, sy + 13);
      ctx.lineTo(x + 6, sy + 13);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Jam game di ujung kanan strip supaya pemain sadar pergantian hari.
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(clockLabel(game.sky), sx + stripW - 6, sy + 16);
  ctx.textAlign = 'left';

  // Garis tengah strip: arah hadap pemain saat ini.
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx + stripW / 2, sy + 2);
  ctx.lineTo(sx + stripW / 2, sy + 7);
  ctx.stroke();
}

// ---- Overlay minimap: bingkai yang bicara — panah utara, label, denyut
// target, dan bingkai merah saat diburu polisi. Digambar setelah
// drawMinimap dari hud, menimpa tepinya saja.

export function drawMinimapOverlay(game, ctx, W, H) {
  const mw = 210;
  const mh = 156;
  const x0 = W - mw - 12;
  const y0 = H - mh - 12;
  const fx = game.missionFx;
  const pulse = fx ? 0.5 + 0.5 * Math.sin(fx.pulse * 3) : 0.7;

  // Bingkai merah berdenyut saat wanted > 0 — bahaya langsung terlihat
  // tanpa harus membaca bintang.
  if (game.wanted > 0) {
    ctx.strokeStyle = `rgba(231,76,60,${(0.5 + 0.5 * pulse).toFixed(2)})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(x0 - 6, y0 - 6, mw + 12, mh + 12);
  } else {
    ctx.strokeStyle = 'rgba(241,196,15,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 - 6, y0 - 6, mw + 12, mh + 12);
  }

  // Label + panah utara di atas minimap.
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(x0 - 6, y0 - 26, 96, 18);
  ctx.fillStyle = '#f1c40f';
  ctx.fillText('▲ U  PETA', x0 - 2, y0 - 13);

  // Legenda kecil di ATAS minimap (di bawah label PETA): titik-titik
  // yang dipakai — di bawah minimap terpotong tepi layar.
  ctx.font = '11px monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x0 - 6, y0 - 48, mw + 12, 18);
  ctx.fillStyle = '#2ecc71';
  ctx.fillText('■ milikmu', x0 + 2, y0 - 35);
  ctx.fillStyle = '#e74c3c';
  ctx.fillText('● polisi', x0 + 78, y0 - 35);
  ctx.fillStyle = '#f1c40f';
  ctx.fillText('● target', x0 + 148, y0 - 35);

  // Denyut target di atas titik minimap lama: cincin yang membesar.
  const t = missionTarget(game);
  if (t && t.x !== null && t.x !== undefined) {
    const sx = mw / 4600;
    const sy = mh / 3400;
    const tx = x0 + t.x * sx;
    const ty = y0 + t.y * sy;
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
}

// Ringkasan misi satu baris untuk toast / panel: "MISI 2/5 • 340 m".
export function missionSummary(game) {
  const t = missionTarget(game);
  const dist = missionDistance(game);
  const done = game.story ? (game.story.index || 0) : 0;
  const distText = dist ? ` • ${dist.label}` : '';
  return `MISI ${done}/5 — ${t ? t.label : 'free roam'}${distText}`;
}
