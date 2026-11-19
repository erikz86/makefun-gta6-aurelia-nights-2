// Statistik sesi: jarak yang ditempuh pemain, durasi sesi, dan capaian
// (misi, heist, run) — ditampilkan sebagai ringkasan di layar judul.
// Modul ini murni pembaca: ia tidak mengubah perilaku game apa pun,
// hanya mencatat posisi pemain tiap frame dan merangkumnya.
//
// Ditulis baru round 4b sebagai modul yang benar-benar baru (bukan
// salinan): engine memanggil createSessionStats saat game dibuat dan
// stepSessionStats tiap frame; hud memanggil sessionStatsLines saat
// menggambar panel judul.

export function createSessionStats() {
  return {
    distance: 0,
    lastX: null,
    lastY: null,
    startedAt: null,
  };
}

// Catat perpindahan pemain sejak frame terakhir. Dipanggil sekali
// tiap frame dari stepWorld — pemain yang diam tidak menambah jarak,
// dan kamera judul yang bergerak tidak dihitung karena posisi pemain
// yang dicatat, bukan posisi kamera.
export function stepSessionStats(game, dt) {
  const s = game.sessionStats;
  if (!s) return;
  if (s.startedAt === null) s.startedAt = game.time;
  const p = game.player;
  if (s.lastX !== null && s.lastY !== null) {
    s.distance += Math.hypot(p.x - s.lastX, p.y - s.lastY);
  }
  s.lastX = p.x;
  s.lastY = p.y;
}

// Baris ringkasan untuk layar judul. Kosong sampai pemain benar-benar
// bergerak atau bermain semenit — supaya judul awal tetap bersih.
export function sessionStatsLines(game) {
  const s = game.sessionStats;
  if (!s || s.startedAt === null) return [];
  const elapsed = Math.max(0, game.time - s.startedAt);
  if (s.distance < 50 && elapsed < 60) return [];
  const km = (s.distance / 1000).toFixed(2);
  const mins = Math.floor(elapsed / 60);
  const lines = [`SESI INI — ${mins} mnt • ${km} km ditempuh`];
  const feats = [];
  if (game.stats.missionsDone) feats.push(`misi ${game.stats.missionsDone}/6`);
  if (game.stats.heistsDone) feats.push(`heist ${game.stats.heistsDone}`);
  if (game.stats.smuggleRuns) feats.push(`run selundupan ${game.stats.smuggleRuns}`);
  if (game.blackmarket && game.blackmarket.runsDone) feats.push(`run selesai ${game.blackmarket.runsDone}`);
  if (feats.length > 0) lines.push(feats.join('  •  '));
  return lines;
}
