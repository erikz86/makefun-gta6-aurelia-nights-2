// The renderer: draws Port Aurelia from the camera, then the weather and
// the night. Daylight, lamps, headlights and lightning are all painted
// here — the sky file only says what the light is.

import { AVENUES, STREETS, ROAD_W, districtAt } from './world.js';
import { daylight, isNight, weatherNow } from './sky.js';
import { objectiveTarget } from './hud.js';

export function drawWorld(game, ctx, W, H) {
  const cam = game.camera;
  const x0 = cam.x - W / 2;
  const y0 = cam.y - H / 2;
  const day = daylight(game.sky);
  const night = isNight(game.sky);
  const w = weatherNow(game.sky);

  // Ground, district by district.
  for (const d of game.cityDistricts) {
    ctx.fillStyle = d.ground;
    ctx.fillRect(d.x0 - x0, d.y0 - y0, d.x1 - d.x0, d.y1 - d.y0);
  }
  // Roads.
  ctx.fillStyle = '#2e3138';
  for (const a of AVENUES) ctx.fillRect(a - ROAD_W / 2 - x0, -y0, ROAD_W, 3400);
  for (const s of STREETS) ctx.fillRect(-x0, s - ROAD_W / 2 - y0, 4600, ROAD_W);
  // Centre dashes.
  ctx.fillStyle = 'rgba(241,196,15,0.5)';
  for (const a of AVENUES) {
    for (let y = 0; y < 3400; y += 90) ctx.fillRect(a - 2 - x0, y - y0, 4, 42);
  }
  for (const s of STREETS) {
    for (let x = 0; x < 4600; x += 90) ctx.fillRect(x - x0, s - 2 - y0, 42, 4);
  }

  // Containers at the docks.
  for (const c of game.city.containers) {
    if (c.x < x0 - 160 || c.x > x0 + W + 160 || c.y < y0 - 160 || c.y > y0 + H + 160) continue;
    ctx.fillStyle = c.colour;
    ctx.fillRect(c.x - x0, c.y - y0, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(c.x - x0, c.y - y0, c.w, c.h);
  }

  // Buildings: wall, roof lifted by floors for a hint of height, windows
  // that light up after dark.
  for (const b of game.city.buildings) {
    if (b.x > x0 + W + 80 || b.x + b.w < x0 - 80 || b.y > y0 + H + 80 || b.y + b.h < y0 - 80) continue;
    const lift = b.floors * 5;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x - x0 + lift, b.y - y0 + lift, b.w, b.h);
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x - x0, b.y - y0, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x - x0 - lift * 0.4, b.y - y0 - lift * 0.4, b.w, b.h);
    if (night && b.lit) {
      ctx.fillStyle = 'rgba(241,196,15,0.85)';
      const cols = Math.max(1, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.floor(b.h / 30));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if ((i * 7 + j * 13 + b.floors) % 3 === 0) {
            ctx.fillRect(b.x - x0 + 10 + i * 34, b.y - y0 + 10 + j * 30, 8, 10);
          }
        }
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(b.x - x0, b.y - y0, b.w, b.h);
  }

  // Landmarks: coloured fronts with their names on them.
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  for (const lm of game.city.landmarks) {
    if (lm.x > x0 + W + 200 || lm.x + lm.w < x0 - 200 || lm.y > y0 + H + 200 || lm.y + lm.h < y0 - 200) continue;
    ctx.fillStyle = lm.colour;
    ctx.fillRect(lm.x - x0, lm.y - y0, lm.w, lm.h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(lm.x - x0, lm.y - y0 + lm.h - 24, lm.w, 24);
    ctx.fillStyle = '#fff';
    ctx.fillText(lm.name, lm.x + lm.w / 2 - x0, lm.y - y0 + lm.h - 8);
  }
  ctx.textAlign = 'left';

  // Trees and lamps.
  for (const t of game.city.trees) {
    if (t.x < x0 - 40 || t.x > x0 + W + 40 || t.y < y0 - 40 || t.y > y0 + H + 40) continue;
    ctx.fillStyle = '#1e8449';
    ctx.beginPath(); ctx.arc(t.x - x0, t.y - y0, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#27ae60';
    ctx.beginPath(); ctx.arc(t.x - x0 - 4, t.y - y0 - 4, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#7f8c8d';
  for (const l of game.city.lamps) {
    if (l.x < x0 - 20 || l.x > x0 + W + 20 || l.y < y0 - 20 || l.y > y0 + H + 20) continue;
    ctx.fillRect(l.x - x0 - 2, l.y - y0 - 2, 4, 4);
    if (night) {
      ctx.fillStyle = 'rgba(241,196,15,0.9)';
      ctx.beginPath(); ctx.arc(l.x - x0, l.y - y0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7f8c8d';
    }
  }

  // Objective / gig marker: a pulsing diamond on the ground.
  const target = objectiveTarget(game);
  if (target) {
    const pulse = 1 + Math.sin(game.time * 4) * 0.15;
    const mx = target.x - x0;
    const my = target.y - y0;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(241,196,15,0.9)';
    ctx.fillRect(-14 * pulse, -14 * pulse, 28 * pulse, 28 * pulse);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-14 * pulse, -14 * pulse, 28 * pulse, 28 * pulse);
    ctx.restore();
  }

  // Crew members waiting to be hired, properties for sale.
  for (const m of Object.values(game.crew.members)) {
    if (m.hired) continue;
    if (m.x < x0 - 40 || m.x > x0 + W + 40 || m.y < y0 - 40 || m.y > y0 + H + 40) continue;
    ctx.fillStyle = m.colour;
    ctx.beginPath(); ctx.arc(m.x - x0, m.y - y0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(m.name, m.x - x0, m.y - y0 - 20);
    ctx.textAlign = 'left';
  }
  for (const pr of Object.values(game.empire.props)) {
    if (pr.x < x0 - 40 || pr.x > x0 + W + 40 || pr.y < y0 - 40 || pr.y > y0 + H + 40) continue;
    ctx.fillStyle = pr.owned ? '#2ecc71' : '#f1c40f';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(pr.owned ? '★' : '$', pr.x - x0, pr.y - y0 - 12);
    ctx.textAlign = 'left';
  }

  // Cars.
  for (const car of game.cars) {
    if (car.x < x0 - 80 || car.x > x0 + W + 80 || car.y < y0 - 80 || car.y > y0 + H + 80) continue;
    drawCar(game, ctx, car, x0, y0, night);
  }

  // Pedestrians.
  for (const ped of game.peds) {
    if (ped.x < x0 - 30 || ped.x > x0 + W + 30 || ped.y < y0 - 30 || ped.y > y0 + H + 30) continue;
    ctx.fillStyle = ped.colour;
    ctx.beginPath(); ctx.arc(ped.x - x0, ped.y - y0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(ped.x - x0 + Math.cos(ped.angle) * 4, ped.y - y0 + Math.sin(ped.angle) * 4, 4, 0, Math.PI * 2); ctx.fill();
  }

  // Bullets.
  ctx.strokeStyle = '#f9e79f';
  ctx.lineWidth = 2;
  for (const b of game.bullets || []) {
    ctx.beginPath();
    ctx.moveTo(b.x - x0, b.y - y0);
    ctx.lineTo(b.x - Math.cos(b.angle) * 14 - x0, b.y - Math.sin(b.angle) * 14 - y0);
    ctx.stroke();
  }

  // The player.
  const p = game.player;
  const px = p.x - x0;
  const py = p.y - y0;
  if (!p.car) {
    ctx.fillStyle = '#3498db';
    ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a5276';
    ctx.beginPath(); ctx.arc(px + Math.cos(p.angle) * 6, py + Math.sin(p.angle) * 6, 6, 0, Math.PI * 2); ctx.fill();
    if (p.punchArc > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(px, py, 26, p.angle - 0.7, p.angle + 0.7);
      ctx.stroke();
    }
  }

  // ---- Light, weather and atmosphere, painted over the world. ----
  drawAtmosphere(game, ctx, W, H, day, night, w);
}

function drawCar(game, ctx, car, x0, y0, night) {
  const cx = car.x - x0;
  const cy = car.y - y0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-car.w / 2 + 3, -car.h / 2 + 3, car.w, car.h);
  ctx.fillStyle = car.colour;
  ctx.fillRect(-car.w / 2, -car.h / 2, car.w, car.h);
  ctx.fillStyle = 'rgba(174,214,241,0.9)';
  ctx.fillRect(-car.w / 2 + 8, -car.h / 2 + 3, 12, car.h - 6);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(car.w / 2 - 12, -car.h / 2 + 3, 6, car.h - 6);
  if (car.type === 'police') {
    const flash = Math.floor(game.time * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#e74c3c' : '#3498db';
    ctx.fillRect(-4, -car.h / 2 - 2, 8, 5);
    ctx.fillStyle = flash ? '#3498db' : '#e74c3c';
    ctx.fillRect(-4, car.h / 2 - 3, 8, 5);
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#111';
    ctx.fillRect(-car.w / 2 + 4, -3, car.w - 8, 6);
  }
  if (car.brakeLight) {
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(-car.w / 2 - 2, -car.h / 2 + 2, 3, 5);
    ctx.fillRect(-car.w / 2 - 2, car.h / 2 - 7, 3, 5);
  }
  if (night) {
    ctx.fillStyle = 'rgba(255,244,180,0.85)';
    ctx.fillRect(car.w / 2, -car.h / 2 + 2, 4, 4);
    ctx.fillRect(car.w / 2, car.h / 2 - 6, 4, 4);
  }
  ctx.restore();
  // Headlight cone at night, drawn unrotated over the world.
  if (night) {
    const hx = car.x + Math.cos(car.angle) * (car.w / 2 + 60) - x0;
    const hy = car.y + Math.sin(car.angle) * (car.w / 2 + 60) - y0;
    const grad = ctx.createRadialGradient(hx, hy, 4, hx, hy, 90);
    grad.addColorStop(0, 'rgba(255,244,180,0.20)');
    grad.addColorStop(1, 'rgba(255,244,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(hx, hy, 90, 0, Math.PI * 2); ctx.fill();
  }
}

function drawAtmosphere(game, ctx, W, H, day, night, w) {
  // Night darkness with a pool of light around the player.
  if (night || day < 0.9) {
    const darkness = Math.max(0, 0.62 * (1 - day));
    if (!game._lightCanvas || game._lightCanvas.width !== W || game._lightCanvas.height !== H) {
      game._lightCanvas = document.createElement('canvas');
      game._lightCanvas.width = W;
      game._lightCanvas.height = H;
    }
    const light = game._lightCanvas;
    const lctx = light.getContext('2d');
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, W, H);
    lctx.fillStyle = `rgba(5,8,28,${darkness})`;
    lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = 'destination-out';
    const p = game.player;
    const cam = game.camera;
    const px = p.x - (cam.x - W / 2);
    const py = p.y - (cam.y - H / 2);
    const grad = lctx.createRadialGradient(px, py, 30, px, py, 300);
    grad.addColorStop(0, 'rgba(0,0,0,0.95)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = grad;
    lctx.beginPath(); lctx.arc(px, py, 300, 0, Math.PI * 2); lctx.fill();
    ctx.drawImage(light, 0, 0);
  }
  // Fog: a drifting grey veil that shrinks what you can see.
  if (game.sky.weather === 'fog') {
    ctx.fillStyle = 'rgba(180,190,200,0.28)';
    ctx.fillRect(0, 0, W, H);
    const p = game.player;
    const cam = game.camera;
    const px = p.x - (cam.x - W / 2);
    const py = p.y - (cam.y - H / 2);
    const grad = ctx.createRadialGradient(px, py, 60, px, py, 340);
    grad.addColorStop(0, 'rgba(180,190,200,0)');
    grad.addColorStop(1, 'rgba(180,190,200,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
  // Rain streaks.
  if (w.rain > 0) {
    ctx.strokeStyle = 'rgba(174,214,241,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of game.sky.rainDrops) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 8, d.y + 22);
    }
    ctx.stroke();
  }
  // Lightning flash.
  if (game.sky.lightning > 0) {
    ctx.fillStyle = `rgba(255,255,240,${game.sky.lightning * 0.3})`;
    ctx.fillRect(0, 0, W, H);
  }
}
