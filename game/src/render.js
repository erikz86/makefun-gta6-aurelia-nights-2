// Renderer: menggambar Port Aurelia dari kamera, lalu cuaca dan
// malam. Siang, lampu, sorot depan, dan kilat semuanya dilukis di sini
// — file sky hanya mengatakan cahayanya seperti apa.
//
// Ditulis ulang round 4b: drawWorld kini menjalankan WORLD_LAYERS —
// daftar pelukis berurutan — dan tiap pelukis besar dipecah lagi
// (gedung/jendela, pohon/lampu, mobil/pejalan/peluru/pemain, dealer/
// rute/van, atmosfer). Menambah lapisan berarti menambah satu entri
// tabel, dan tiap pelukis hanya tahu soal objeknya sendiri.

import { AVENUES, STREETS, ROAD_W, districtAt } from './world.js';
import { daylight, isNight, weatherNow } from './sky.js';
import { objectiveTarget } from './hud.js';
import { DEALERS } from './blackmarket.js';
import { DROPOFFS } from './smuggling.js';

// Apakah sebuah kotak masih terlihat dari kamera (dengan margin).
function inView(x, y, w, h, x0, y0, W, H, margin) {
  return x + w >= x0 - margin && x <= x0 + W + margin && y + h >= y0 - margin && y <= y0 + H + margin;
}

// Tanah per distrik, lalu jalan dan garis tengahnya.
function paintDistrictGround(game, ctx, x0, y0) {
  for (const d of game.cityDistricts) {
    ctx.fillStyle = d.ground;
    ctx.fillRect(d.x0 - x0, d.y0 - y0, d.x1 - d.x0, d.y1 - d.y0);
  }
}

function paintRoadBodies(ctx, x0, y0) {
  ctx.fillStyle = '#2e3138';
  for (const a of AVENUES) ctx.fillRect(a - ROAD_W / 2 - x0, -y0, ROAD_W, 3400);
  for (const s of STREETS) ctx.fillRect(-x0, s - ROAD_W / 2 - y0, 4600, ROAD_W);
}

// Garis tengah putus-putus.
function paintRoadDashes(ctx, x0, y0) {
  ctx.fillStyle = 'rgba(241,196,15,0.5)';
  for (const a of AVENUES) {
    for (let y = 0; y < 3400; y += 90) ctx.fillRect(a - 2 - x0, y - y0, 4, 42);
  }
  for (const s of STREETS) {
    for (let x = 0; x < 4600; x += 90) ctx.fillRect(x - x0, s - 2 - y0, 42, 4);
  }
}

function paintGroundAndRoads(game, ctx, x0, y0) {
  paintDistrictGround(game, ctx, x0, y0);
  paintRoadBodies(ctx, x0, y0);
  paintRoadDashes(ctx, x0, y0);
}

function paintContainers(game, ctx, x0, y0, W, H) {
  for (const c of game.city.containers) {
    if (!inView(c.x, c.y, 1, 1, x0, y0, W, H, 160)) continue;
    ctx.fillStyle = c.colour;
    ctx.fillRect(c.x - x0, c.y - y0, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(c.x - x0, c.y - y0, c.w, c.h);
  }
}

// Jendela yang menyala setelah gelap: pola tetap per gedung.
function paintLitWindows(ctx, b, x0, y0) {
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

// Gedung: dinding, atap yang terangkat sesuai lantai untuk kesan
// tinggi, jendela yang menyala setelah gelap.
function paintBuildings(game, ctx, x0, y0, W, H, night) {
  for (const b of game.city.buildings) {
    if (!inView(b.x, b.y, b.w, b.h, x0, y0, W, H, 80)) continue;
    const lift = b.floors * 5;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x - x0 + lift, b.y - y0 + lift, b.w, b.h);
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x - x0, b.y - y0, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x - x0 - lift * 0.4, b.y - y0 - lift * 0.4, b.w, b.h);
    if (night && b.lit) paintLitWindows(ctx, b, x0, y0);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(b.x - x0, b.y - y0, b.w, b.h);
  }
}

// Landmark: fasad berwarna dengan namanya tertulis di atasnya.
function paintLandmarks(game, ctx, x0, y0, W, H) {
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  for (const lm of game.city.landmarks) {
    if (!inView(lm.x, lm.y, lm.w, lm.h, x0, y0, W, H, 200)) continue;
    ctx.fillStyle = lm.colour;
    ctx.fillRect(lm.x - x0, lm.y - y0, lm.w, lm.h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(lm.x - x0, lm.y - y0 + lm.h - 24, lm.w, 24);
    ctx.fillStyle = '#fff';
    ctx.fillText(lm.name, lm.x + lm.w / 2 - x0, lm.y - y0 + lm.h - 8);
  }
  ctx.textAlign = 'left';
}

function paintTrees(game, ctx, x0, y0, W, H) {
  for (const t of game.city.trees) {
    if (!inView(t.x, t.y, 1, 1, x0, y0, W, H, 40)) continue;
    ctx.fillStyle = '#1e8449';
    ctx.beginPath(); ctx.arc(t.x - x0, t.y - y0, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#27ae60';
    ctx.beginPath(); ctx.arc(t.x - x0 - 4, t.y - y0 - 4, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
}

// Pohon dan lampu jalan (lampu menyala kuning di malam hari).
function paintLamps(game, ctx, x0, y0, W, H, night) {
  ctx.fillStyle = '#7f8c8d';
  for (const l of game.city.lamps) {
    if (!inView(l.x, l.y, 1, 1, x0, y0, W, H, 20)) continue;
    ctx.fillRect(l.x - x0 - 2, l.y - y0 - 2, 4, 4);
    if (night) {
      ctx.fillStyle = 'rgba(241,196,15,0.9)';
      ctx.beginPath(); ctx.arc(l.x - x0, l.y - y0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7f8c8d';
    }
  }
}

function paintTreesAndLamps(game, ctx, x0, y0, W, H, night) {
  paintTrees(game, ctx, x0, y0, W, H);
  paintLamps(game, ctx, x0, y0, W, H, night);
}

// Penanda objektif / gig: berlian berdenyut di tanah.
function paintObjectiveMarker(game, ctx, x0, y0) {
  const target = objectiveTarget(game);
  if (!target) return;
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

function paintCrewMarkers(game, ctx, x0, y0, W, H) {
  for (const m of Object.values(game.crew.members)) {
    if (m.hired) continue;
    if (!inView(m.x, m.y, 1, 1, x0, y0, W, H, 40)) continue;
    ctx.fillStyle = m.colour;
    ctx.beginPath(); ctx.arc(m.x - x0, m.y - y0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(m.name, m.x - x0, m.y - y0 - 20);
    ctx.textAlign = 'left';
  }
}

function paintPropertyMarkers(game, ctx, x0, y0, W, H) {
  for (const pr of Object.values(game.empire.props)) {
    if (!inView(pr.x, pr.y, 1, 1, x0, y0, W, H, 40)) continue;
    ctx.fillStyle = pr.owned ? '#2ecc71' : '#f1c40f';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(pr.owned ? '★' : '$', pr.x - x0, pr.y - y0 - 12);
    ctx.textAlign = 'left';
  }
}

// Anggota kru yang menunggu direkrut, dan properti yang dijual.
function paintCrewAndProperties(game, ctx, x0, y0, W, H) {
  paintCrewMarkers(game, ctx, x0, y0, W, H);
  paintPropertyMarkers(game, ctx, x0, y0, W, H);
}

function paintCars(game, ctx, x0, y0, W, H, night) {
  for (const car of game.cars) {
    if (!inView(car.x, car.y, 1, 1, x0, y0, W, H, 80)) continue;
    drawCar(game, ctx, car, x0, y0, night);
  }
}

function paintPeds(game, ctx, x0, y0, W, H) {
  for (const ped of game.peds) {
    if (!inView(ped.x, ped.y, 1, 1, x0, y0, W, H, 30)) continue;
    ctx.fillStyle = ped.colour;
    ctx.beginPath(); ctx.arc(ped.x - x0, ped.y - y0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(ped.x - x0 + Math.cos(ped.angle) * 4, ped.y - y0 + Math.sin(ped.angle) * 4, 4, 0, Math.PI * 2); ctx.fill();
  }
}

function paintBullets(game, ctx, x0, y0) {
  ctx.strokeStyle = '#f9e79f';
  ctx.lineWidth = 2;
  for (const b of game.bullets || []) {
    ctx.beginPath();
    ctx.moveTo(b.x - x0, b.y - y0);
    ctx.lineTo(b.x - Math.cos(b.angle) * 14 - x0, b.y - Math.sin(b.angle) * 14 - y0);
    ctx.stroke();
  }
}

function paintPlayer(game, ctx, x0, y0) {
  const p = game.player;
  if (p.car) return;
  const px = p.x - x0;
  const py = p.y - y0;
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

// Mobil, pejalan kaki, peluru, dan pemain.
function paintActors(game, ctx, x0, y0, W, H, night) {
  paintCars(game, ctx, x0, y0, W, H, night);
  paintPeds(game, ctx, x0, y0, W, H);
  paintBullets(game, ctx, x0, y0);
  paintPlayer(game, ctx, x0, y0);
}

// Lapisan dunia berurutan — urutan gambar menentukan apa yang
// menutupi apa (tanah dulu, aktor terakhir).
const WORLD_LAYERS = [
  { id: 'ground', paint: (game, ctx, x0, y0, W, H, night) => paintGroundAndRoads(game, ctx, x0, y0) },
  { id: 'containers', paint: paintContainers },
  { id: 'buildings', paint: paintBuildings },
  { id: 'landmarks', paint: paintLandmarks },
  { id: 'trees-lamps', paint: paintTreesAndLamps },
  { id: 'objective', paint: (game, ctx, x0, y0, W, H, night) => paintObjectiveMarker(game, ctx, x0, y0) },
  { id: 'crew-props', paint: paintCrewAndProperties },
  { id: 'actors', paint: paintActors },
];

export function drawWorld(game, ctx, W, H) {
  const cam = game.camera;
  const x0 = cam.x - W / 2;
  const y0 = cam.y - H / 2;
  const day = daylight(game.sky);
  const night = isNight(game.sky);
  const w = weatherNow(game.sky);

  for (const layer of WORLD_LAYERS) layer.paint(game, ctx, x0, y0, W, H, night);

  // ---- Pasar gelap di jalan: dealer, checkpoint run, drop-off. ----
  drawBlackMarket(game, ctx, x0, y0, W, H, night);

  // ---- Cahaya, cuaca, dan atmosfer, dilukis di atas dunia. ----
  drawAtmosphere(game, ctx, W, H, day, night, w);
}

// Detail mobil per tipe: tiap entri menggambar satu ciri di atas
// badan mobil yang sudah dirotasi (koordinat lokal mobil).
function paintPoliceLights(game, ctx, car) {
  const flash = Math.floor(game.time * 6) % 2 === 0;
  ctx.fillStyle = flash ? '#e74c3c' : '#3498db';
  ctx.fillRect(-4, -car.h / 2 - 2, 8, 5);
  ctx.fillStyle = flash ? '#3498db' : '#e74c3c';
  ctx.fillRect(-4, car.h / 2 - 3, 8, 5);
}

function paintTaxiStripe(ctx, car) {
  ctx.fillStyle = '#111';
  ctx.fillRect(-car.w / 2 + 4, -3, car.w - 8, 6);
}

function paintBrakeLights(ctx, car) {
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(-car.w / 2 - 2, -car.h / 2 + 2, 3, 5);
  ctx.fillRect(-car.w / 2 - 2, car.h / 2 - 7, 3, 5);
}

function paintHeadlightDots(ctx, car) {
  ctx.fillStyle = 'rgba(255,244,180,0.85)';
  ctx.fillRect(car.w / 2, -car.h / 2 + 2, 4, 4);
  ctx.fillRect(car.w / 2, car.h / 2 - 6, 4, 4);
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
  if (car.type === 'police') paintPoliceLights(game, ctx, car);
  if (car.type === 'taxi') paintTaxiStripe(ctx, car);
  if (car.brakeLight) paintBrakeLights(ctx, car);
  if (night) paintHeadlightDots(ctx, car);
  ctx.restore();
  // Kerucut sorot depan di malam hari, digambar tanpa rotasi di atas dunia.
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

// ---- Atmosfer: kegelapan, kabut, hujan, kilat — tiap lapisan satu
// fungsi, dijalankan berurutan oleh drawAtmosphere. ----

function atmosphereDarkness(game, ctx, W, H, day, night) {
  // Kegelapan malam dengan kolam cahaya di sekitar pemain.
  if (!night && day >= 0.9) return;
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

function atmosphereFog(game, ctx, W, H) {
  // Kabut: tabir abu-abu yang melayang dan mengecilkan pandangan.
  if (game.sky.weather !== 'fog') return;
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

function atmosphereRain(game, ctx, W, H, w) {
  // Garis hujan.
  if (w.rain <= 0) return;
  ctx.strokeStyle = 'rgba(174,214,241,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const d of game.sky.rainDrops) {
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - 8, d.y + 22);
  }
  ctx.stroke();
}

function atmosphereLightning(game, ctx, W, H) {
  // Kilatan petir.
  if (game.sky.lightning <= 0) return;
  ctx.fillStyle = `rgba(255,255,240,${game.sky.lightning * 0.3})`;
  ctx.fillRect(0, 0, W, H);
}

const ATMOSPHERE_LAYERS = [
  { id: 'darkness', paint: (game, ctx, W, H, day, night, w) => atmosphereDarkness(game, ctx, W, H, day, night) },
  { id: 'fog', paint: (game, ctx, W, H, day, night, w) => atmosphereFog(game, ctx, W, H) },
  { id: 'rain', paint: (game, ctx, W, H, day, night, w) => atmosphereRain(game, ctx, W, H, w) },
  { id: 'lightning', paint: (game, ctx, W, H, day, night, w) => atmosphereLightning(game, ctx, W, H) },
];

function drawAtmosphere(game, ctx, W, H, day, night, w) {
  for (const layer of ATMOSPHERE_LAYERS) layer.paint(game, ctx, W, H, day, night, w);
}

// ---- Pasar gelap di jalan: dealer, checkpoint run, drop-off. ----
// Dealer berdiri di sudutnya setelah gelap: sosok bercincin ungu
// dengan papan nama, meredup jadi hantu abu-abu di siang hari (mereka
// tidak ada saat itu — panel menolak transaksi siang, begitu pula
// gambarnya). Selama run, checkpoint digambar sebagai berlian ungu
// bernomor dan drop-off sebagai cincin besar berdenyut, supaya rute
// terbaca sekilas bahkan di tengah badai.

function paintDealers(game, ctx, x0, y0, W, H, night, pulse) {
  const bm = game.blackmarket;
  for (const dealer of DEALERS) {
    if (!inView(dealer.x, dealer.y, 1, 1, x0, y0, W, H, 60)) continue;
    const locked = bm.rep < dealer.repNeeded;
    const sx = dealer.x - x0;
    const sy = dealer.y - y0;
    ctx.fillStyle = night ? dealer.colour : 'rgba(120,120,120,0.55)';
    ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = night ? '#e84393' : 'rgba(200,200,200,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, 20 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(locked ? `${dealer.name} (rep ${dealer.repNeeded})` : dealer.name, sx, sy - 28);
    ctx.fillText(night ? 'PASAR GELAP' : 'tutup — datang malam', sx, sy + 34);
    ctx.textAlign = 'left';
  }
}

function paintRunRoute(game, ctx, x0, y0, W, H, pulse) {
  const run = game.blackmarket.run;
  if (!run) return;
  run.points.forEach((pt, i) => {
    if (!inView(pt.x, pt.y, 1, 1, x0, y0, W, H, 80)) return;
    const done = i < run.pointI;
    const next = i === run.pointI;
    ctx.save();
    ctx.translate(pt.x - x0, pt.y - y0);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = done ? 'rgba(46,204,113,0.85)' : next ? 'rgba(142,68,173,0.95)' : 'rgba(142,68,173,0.45)';
    const s = (next ? 30 : 22) * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    if (next) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`CHECKPOINT ${i + 1}/${run.points.length}`, pt.x - x0, pt.y - y0 - 26);
      ctx.textAlign = 'left';
    }
  });
  if (run.pointI >= run.points.length) {
    const drop = DROPOFFS[run.destDealer];
    ctx.strokeStyle = 'rgba(231,76,60,0.95)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(drop.x - x0, drop.y - y0, 52 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`DROP-OFF: ${run.dropName}`, drop.x - x0, drop.y - y0 - 62);
    ctx.textAlign = 'left';
  }
}

function paintSmugglerVans(game, ctx, x0, y0, W, H) {
  // Van selundupan terbaca beda dari traffic parkir: garis tepi ungu
  // tipis supaya pelari bisa mengenalinya di malam hari.
  for (const car of game.cars) {
    if (car.type !== 'smuggler' || car.driver) continue;
    if (!inView(car.x, car.y, 1, 1, x0, y0, W, H, 80)) continue;
    ctx.strokeStyle = 'rgba(142,68,173,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(car.x - x0 - 28, car.y - y0 - 16, 56, 32);
    ctx.fillStyle = '#e84393';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('VAN SELUNDUPAN', car.x - x0, car.y - y0 - 22);
    ctx.textAlign = 'left';
  }
}

function drawBlackMarket(game, ctx, x0, y0, W, H, night) {
  const bm = game.blackmarket;
  if (!bm) return;
  const pulse = 1 + Math.sin(game.time * 4) * 0.18;
  paintDealers(game, ctx, x0, y0, W, H, night, pulse);
  paintRunRoute(game, ctx, x0, y0, W, H, pulse);
  paintSmugglerVans(game, ctx, x0, y0, W, H);
}

// Cakram cahaya radial untuk efek dunia: dipakai strobo polisi, lampu
// jalan, dan kilat ledakan supaya tidak ada yang menggambar gradien
// mentah berulang kali.
export function glowDisc(ctx, x, y, r, inner, outer) {
  const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Garis cahaya pendek (sorot lampu / laser bidik) dengan alpha pudar.
export function lightStreak(ctx, x1, y1, x2, y2, colour, width) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width || 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
