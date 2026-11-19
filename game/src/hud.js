// The HUD: money, health, wanted stars, the clock and the weather, the
// mission objective, dialogs, toasts, the live minimap, and the panels —
// business, heist board, gun shop, pause and title. Everything is drawn
// on the canvas so the screenshots show the game exactly as played.

import { clockLabel, isNight, weatherNow } from './sky.js';
import { incomePerHour, ownedCount } from './empire.js';
import { heistPayout, heistMissing, crewCut } from './crew.js';
import { STORY } from './story.js';
import { AVENUES, STREETS } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_BUSINESS = 'business';
export const SCREEN_HEIST = 'heist';
export const SCREEN_SHOP = 'shop';
export const SCREEN_OVER = 'over';

function star(cx, cy, r, ctx, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#f1c40f' : 'rgba(255,255,255,0.25)';
  ctx.fill();
  ctx.strokeStyle = '#7f6000';
  ctx.stroke();
}

export function drawHud(game, ctx, W, H) {
  const p = game.player;
  ctx.textBaseline = 'alphabetic';
  // Money + health, top left.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(12, 12, 250, 84);
  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(`$${game.money.toLocaleString('en-US')}`, 22, 42);
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '13px monospace';
  const owned = ownedCount(game.empire);
  ctx.fillText(owned > 0 ? `Bisnis: ${owned} milikmu` : 'Belum ada bisnis (B)', 22, 62);
  // Health bar.
  ctx.fillStyle = '#333';
  ctx.fillRect(22, 70, 150, 12);
  ctx.fillStyle = p.health > 50 ? '#2ecc71' : p.health > 25 ? '#f39c12' : '#e74c3c';
  ctx.fillRect(22, 70, 150 * Math.max(0, p.health / 100), 12);
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '11px monospace';
  ctx.fillText(`NYAWA ${Math.ceil(p.health)}`, 180, 81);
  // Wanted stars row, under the money box.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(12, 102, 250, 34);
  for (let i = 0; i < 5; i += 1) star(36 + i * 30, 119, 11, ctx, i < game.wanted);
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '12px monospace';
  ctx.fillText(game.wanted > 0 ? 'DIBURU POLISI' : 'AMAN', 190, 123);

  // Clock + weather, top right.
  const w = weatherNow(game.sky);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W - 232, 12, 220, 62);
  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 24px monospace';
  ctx.fillText(clockLabel(game.sky), W - 222, 40);
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '13px monospace';
  ctx.fillText(`${isNight(game.sky) ? 'Malam' : 'Siang'} • ${w.label}`, W - 222, 62);

  // Weapon + ammo, under the clock.
  const gun = game.arsenal.guns[game.arsenal.current];
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W - 232, 80, 220, 30);
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '13px monospace';
  ctx.fillText(`${gun.name}  •  ${gun.ammo} peluru`, W - 222, 100);

  // Objective, top centre.
  const obj = currentObjective(game);
  if (obj) {
    ctx.font = 'bold 15px monospace';
    const tw = ctx.measureText(obj).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect((W - tw) / 2 - 14, 12, tw + 28, 30);
    ctx.fillStyle = '#f9e79f';
    ctx.fillText(obj, (W - tw) / 2, 33);
  }

  // Toasts, right side under the weapon box.
  ctx.font = '13px monospace';
  game.toasts.slice(-4).forEach((t, i) => {
    const alpha = Math.max(0, Math.min(1, t.until - game.time));
    ctx.fillStyle = `rgba(0,0,0,${0.6 * alpha})`;
    const tw = ctx.measureText(t.text).width;
    ctx.fillRect(W - tw - 34, 118 + i * 26, tw + 20, 22);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillText(t.text, W - tw - 24, 134 + i * 26);
  });

  // Dialog, bottom centre.
  const line = game.dialogLine ? game.dialogLine() : null;
  if (line) {
    ctx.font = '15px monospace';
    const tw = ctx.measureText(line).width;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect((W - tw) / 2 - 16, H - 118, tw + 32, 32);
    ctx.fillStyle = '#fff';
    ctx.fillText(line, (W - tw) / 2, H - 96);
  }

  // Context hints, bottom left.
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const hints = contextHints(game);
  hints.forEach((h, i) => ctx.fillText(h, 14, H - 14 - (hints.length - 1 - i) * 18));

  drawMinimap(game, ctx, W, H);
}

export function currentObjective(game) {
  if (game.story.active) return `${game.story.active.title}: ${game.story.active.objective}`;
  if (game.story.gig) return `Kerja: ${game.story.gig.objective} (${Math.ceil(game.story.gig.timer)} dtk)`;
  if (game.story.index < STORY.length) return `Tekan F — misi berikutnya: ${STORY[game.story.index].title}`;
  return 'Free roam — kembangkan empire-mu (B: bisnis, H: heist board)';
}

export function contextHints(game) {
  const hints = ['WASD jalan/kemudi • E masuk-keluar mobil • Spasi pukul • Klik tembak'];
  const p = game.player;
  if (!p.car) {
    const nearCar = game.cars.find((c) => !c.driver && Math.hypot(c.x - p.x, c.y - p.y) < 70);
    if (nearCar) hints.push('E — curi mobil ini');
  }
  if (game.nearProperty) hints.push('B — bisnis: beli / upgrade properti ini');
  if (game.nearMember) hints.push('E — rekrut anggota kru ini');
  if (game.nearShop) hints.push('E — toko senjata Ironworks');
  if (game.nearSafehouse) hints.push('H — papan heist • P — jeda & simpan');
  hints.push('F — misi / kerja sampingan • M — suara • P — jeda');
  return hints;
}

export function drawMinimap(game, ctx, W, H) {
  const mw = 210;
  const mh = 156;
  const x0 = W - mw - 12;
  const y0 = H - mh - 12;
  const sx = mw / 4600;
  const sy = mh / 3400;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(x0 - 4, y0 - 4, mw + 8, mh + 8);
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(x0, y0, mw, mh);
  ctx.strokeStyle = '#5d6d7e';
  ctx.lineWidth = 2;
  for (const a of AVENUES) {
    ctx.beginPath(); ctx.moveTo(x0 + a * sx, y0); ctx.lineTo(x0 + a * sx, y0 + mh); ctx.stroke();
  }
  for (const s of STREETS) {
    ctx.beginPath(); ctx.moveTo(x0, y0 + s * sy); ctx.lineTo(x0 + mw, y0 + s * sy); ctx.stroke();
  }
  // Properties.
  for (const prop of Object.values(game.empire.props)) {
    ctx.fillStyle = prop.owned ? '#2ecc71' : '#f1c40f';
    ctx.fillRect(x0 + prop.x * sx - 3, y0 + prop.y * sy - 3, 6, 6);
  }
  // Police blips.
  ctx.fillStyle = '#e74c3c';
  for (const c of game.cars) {
    if (c.driver === 'police') {
      ctx.beginPath(); ctx.arc(x0 + c.x * sx, y0 + c.y * sy, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Objective marker.
  const t = objectiveTarget(game);
  if (t) {
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(x0 + t.x * sx, y0 + t.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const px = x0 + game.player.x * sx;
  const py = y0 + game.player.y * sy;
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
  ctx.strokeRect(x0 - 4, y0 - 4, mw + 8, mh + 8);
}

export function objectiveTarget(game) {
  if (game.story.active) return { x: game.story.active.tx, y: game.story.active.ty };
  if (game.story.gig) return { x: game.story.gig.tx, y: game.story.gig.ty };
  return null;
}

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

export function drawPanel(game, ctx, W, H) {
  if (game.screen === SCREEN_TITLE) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 54px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AURELIA NIGHTS II', W / 2, H / 2 - 90);
    ctx.fillStyle = '#e84393';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('— Empire of the Storm —', W / 2, H / 2 - 52);
    ctx.fillStyle = '#fff';
    ctx.font = '16px monospace';
    ctx.fillText('Port Aurelia setahun setelah perampokan bank. Sekarang kotanya untuk dijual.', W / 2, H / 2 - 8);
    ctx.fillText('Beli bisnis • rekrut kru • rencanakan heist • bertahan di tengah badai.', W / 2, H / 2 + 20);
    ctx.fillStyle = '#2ecc71';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(game.hasSave ? 'ENTER — lanjutkan simpanan   |   N — permainan baru' : 'ENTER / klik — mulai', W / 2, H / 2 + 70);
    ctx.fillStyle = '#95a5a6';
    ctx.font = '13px monospace';
    ctx.fillText('WASD jalan & kemudi • E mobil • Spasi pukul • Klik tembak • B bisnis • H heist • F misi', W / 2, H / 2 + 104);
    ctx.textAlign = 'left';
    return;
  }
  if (game.screen === SCREEN_PAUSE) {
    panel(ctx, W, H, 'JEDA', [
      `Uang: $${game.money.toLocaleString('en-US')}   •   Misi selesai: ${game.stats.missionsDone}/6`,
      `Bisnis dimiliki: ${ownedCount(game.empire)}   •   Heist selesai: ${game.stats.heistsDone}`,
      `Total penghasilan bisnis: $${game.empire.earnedTotal.toLocaleString('en-US')}`,
    ], 'P / Esc — lanjut  •  R — muat simpanan  •  N — permainan baru');
    return;
  }
  if (game.screen === SCREEN_OVER) {
    panel(ctx, W, H, game.busted ? 'BUSTED!' : 'WASTED!', [
      game.busted ? 'Polisi menangkapmu di jalan.' : 'Kai tidak selamat dari Port Aurelia.',
      `Uang yang tersisa: $${game.money.toLocaleString('en-US')}`,
      'Simpanan terakhir tetap aman di loteng.',
    ], 'ENTER — coba lagi dari simpanan');
    return;
  }
  if (game.screen === SCREEN_BUSINESS) {
    const lines = Object.values(game.empire.props).map((pr, i) => {
      const status = pr.owned
        ? `LEVEL ${pr.level} — $${incomePerHour(game, pr)}/jam  ${pr.level < 3 ? `[${i + 1} upgrade $${pr.upgrade[pr.level - 1]}]` : '[MAX]'}`
        : `BELUM DIMILIKI — beli $${pr.price}  [${i + 1}]`;
      return `${pr.name} (${pr.kind}) — ${status}`;
    });
    panel(ctx, W, H, 'EMPIRE — BISNIS PORT AURELIA', lines,
      'Tekan 1-4 untuk beli / upgrade  •  B / Esc — tutup');
    return;
  }
  if (game.screen === SCREEN_HEIST) {
    const lines = Object.values(game.crew.heists).map((hz, i) => {
      const miss = heistMissing(game, hz);
      const pay = heistPayout(game, hz);
      const state = hz.done ? `SELESAI ${hz.times}x` : !miss.prep ? 'BUTUH PREP' : miss.missing.length ? `BUTUH KRU: ${miss.missing.map((id) => game.crew.members[id].name).join(', ')}` : 'SIAP';
      return `${i + 1}. ${hz.name} — ${hz.target} — bersih $${pay.net.toLocaleString('en-US')} — ${state}`;
    });
    lines.push('');
    lines.push(`Kru disewa: ${Object.values(game.crew.members).filter((m) => m.hired).map((m) => `${m.name} (${m.role}, potongan ${Math.round(m.cut * 100)}%)`).join('  •  ') || 'belum ada'}`);
    lines.push(`Total potongan kru: ${Math.round(crewCut(game) * 100)}% dari setiap heist.`);
    panel(ctx, W, H, 'PAPAN HEIST — LOTENG KAI', lines,
      'Heist dijalankan lewat misi cerita (F)  •  H / Esc — tutup');
    return;
  }
  if (game.screen === SCREEN_SHOP) {
    const lines = Object.values(game.arsenal.guns).map((g, i) => {
      const def = { pistol: { price: 0, ammoPrice: 25 }, shotgun: { price: 1200, ammoPrice: 60 }, smg: { price: 2400, ammoPrice: 45 } }[g.id];
      return `${i + 1}. ${g.name} — ${g.owned ? `dimiliki, ${g.ammo} peluru (isi ulang $${def.ammoPrice})` : `beli $${def.price}`}`;
    });
    panel(ctx, W, H, 'IRONWORKS — TOKO SENJATA', lines,
      'Tekan 1-3 untuk beli / isi ulang  •  E / Esc — tutup  •  1/2/3 di jalan untuk ganti senjata');
  }
}
