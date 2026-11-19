// Suara sintetis untuk Aurelia Nights II: tiap efek dibangun dengan
// WebAudio API, tanpa file audio, tanpa network. Hujan adalah noise
// terfilter yang diulang, guntur adalah ledakan rendah, sirene
// melolong dua nada, mesin berdengung.
//
// Ditulis ulang round 4b: semua efek bernama kini satu langkah di
// tabel SFX_STEPS (nada/noise + jeda), arpeggio misi/busted satu
// tabel NOTE_RUNS, dan suara tembak satu tabel SHOOT_SOUNDS. Mesin
// bunyi intinya — tone, noise, later, setRain, engine — tetap sama,
// hanya dirapikan supaya buffer noise dibuat di satu tempat.

// Satu langkah efek: nada {tone:[freq, dur, type, vol, slideTo]} atau
// noise {noise:[dur, vol, lowpass]}, dimainkan langsung atau dijadwal
// `delay` milidetik kemudian.
const SFX_STEPS = {
  // Suara pasar gelap: transaksi adalah dua ketukan rendah dan satu
  // koin, start run adalah rev mesin yang meninggi, checkpoint adalah
  // blip ganda yang cerah, dan run gagal adalah sengatan busted yang
  // dimainkan lebih rendah.
  siren: [{ tone: [720, 0.45, 'sine', 0.07, 980] }],
  thunder: [
    { noise: [1.6, 0.5, 220] },
    { tone: [55, 1.4, 'sine', 0.25, 32] },
  ],
  coin: [
    { tone: [880, 0.09, 'sine', 0.18] },
    { tone: [1318, 0.14, 'sine', 0.18], delay: 90 },
  ],
  deal: [
    { tone: [196, 0.08, 'square', 0.12] },
    { tone: [196, 0.08, 'square', 0.12], delay: 110 },
    { tone: [880, 0.1, 'sine', 0.16], delay: 230 },
  ],
  runStart: [
    { tone: [180, 0.5, 'sawtooth', 0.14, 620] },
    { noise: [0.4, 0.2, 900] },
  ],
  checkpoint: [
    { tone: [1046, 0.08, 'triangle', 0.18] },
    { tone: [1568, 0.12, 'triangle', 0.18], delay: 90 },
  ],
  whisper: [
    { noise: [0.25, 0.1, 3000] },
    { tone: [440, 0.12, 'sine', 0.06, 330] },
  ],
  wash: [
    { tone: [523, 0.12, 'sine', 0.14] },
    { tone: [784, 0.12, 'sine', 0.14], delay: 120 },
    { tone: [1046, 0.16, 'sine', 0.14], delay: 240 },
  ],
  blip: [{ tone: [660, 0.07, 'square', 0.1] }],
};

// Arpeggio: deret nada yang sama bentuknya, dijeda berurutan.
const NOTE_RUNS = {
  mission: { notes: [523, 659, 784, 1046], dur: 0.22, type: 'triangle', vol: 0.2, step: 110 },
  busted: { notes: [392, 330, 262], dur: 0.3, type: 'sawtooth', vol: 0.16, step: 160 },
};

// Tembakan per senjata: semburan noise + nada rendah yang meluncur.
const SHOOT_SOUNDS = {
  shotgun: { noise: [0.22, 0.5, 900], tone: [140, 0.12, 'square', 0.2, 60] },
  smg: { noise: [0.08, 0.3, 2400], tone: [320, 0.06, 'square', 0.12, 180] },
  pistol: { noise: [0.12, 0.35, 1800], tone: [220, 0.08, 'square', 0.15, 90] },
};

// Buffer noise putih sepanjang `dur` detik; `fade` membuat ujungnya
// meluruh supaya tidak terpotong kasar (hujan loop tidak butuh fade).
function makeNoiseBuffer(ctx, dur, fade) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) {
    const amp = fade ? 1 - i / len : 1;
    data[i] = (Math.random() * 2 - 1) * amp;
  }
  return buf;
}

export function createSound() {
  return {
    ctx: null,
    muted: false,
    engineOsc: null,
    engineGain: null,
    rainSrc: null,
    rainGain: null,
    ensure() {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        const g = this.ctx.createGain();
        g.gain.value = 0.35;
        g.connect(this.ctx.destination);
        this.master = g;
      } catch { this.ctx = null; }
    },
    // Satu nada osilator dengan peluruhan: frekuensi boleh meluncur.
    tone(freq, dur, type = 'sine', vol = 0.2, slideTo = 0) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur);
    },
    // Semburan noise putih berfilter lowpass dengan peluruhan.
    noise(dur, vol = 0.25, lowpass = 1200) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(this.ctx, dur, true);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
    },
    // Satu nada yang dijadwalkan belakangan (untuk arpeggio).
    later(freq, dur, type, vol, delayMs) {
      setTimeout(() => this.tone(freq, dur, type, vol), delayMs);
    },
    // Jalankan satu efek bernama dari tabel langkah.
    play(name) {
      const steps = SFX_STEPS[name];
      if (!steps) return;
      for (const step of steps) {
        if (step.tone) {
          const [freq, dur, type, vol, slideTo] = step.tone;
          if (step.delay) this.later(freq, dur, type, vol, step.delay);
          else this.tone(freq, dur, type, vol, slideTo);
        } else if (step.noise) {
          const [dur, vol, lowpass] = step.noise;
          if (step.delay) setTimeout(() => this.noise(dur, vol, lowpass), step.delay);
          else this.noise(dur, vol, lowpass);
        }
      }
    },
    // Jalankan satu arpeggio dari tabel nada.
    playNotes(name) {
      const run = NOTE_RUNS[name];
      if (!run) return;
      run.notes.forEach((f, i) => this.later(f, run.dur, run.type, run.vol, i * run.step));
    },
    shoot(kind) {
      const spec = SHOOT_SOUNDS[kind] || SHOOT_SOUNDS.pistol;
      const [nDur, nVol, nLow] = spec.noise;
      const [tFreq, tDur, tType, tVol, tSlide] = spec.tone;
      this.noise(nDur, nVol, nLow);
      this.tone(tFreq, tDur, tType, tVol, tSlide);
    },
    siren() { this.play('siren'); },
    thunder() { this.play('thunder'); },
    coin() { this.play('coin'); },
    deal() { this.play('deal'); },
    runStart() { this.play('runStart'); },
    checkpoint() { this.play('checkpoint'); },
    whisper() { this.play('whisper'); },
    wash() { this.play('wash'); },
    blip() { this.play('blip'); },
    mission() { this.playNotes('mission'); },
    busted() { this.playNotes('busted'); },
    setRain(on, heavy) {
      if (!this.ctx || this.muted) return;
      if (on && !this.rainSrc) {
        const src = this.ctx.createBufferSource();
        src.buffer = makeNoiseBuffer(this.ctx, 2, false);
        src.loop = true;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1400;
        f.Q.value = 0.4;
        const g = this.ctx.createGain();
        g.gain.value = heavy ? 0.09 : 0.05;
        src.connect(f).connect(g).connect(this.master);
        src.start();
        this.rainSrc = src;
        this.rainGain = g;
      } else if (!on && this.rainSrc) {
        try { this.rainSrc.stop(); } catch { /* sudah berhenti */ }
        this.rainSrc = null;
        this.rainGain = null;
      } else if (on && this.rainGain) {
        this.rainGain.gain.value = heavy ? 0.09 : 0.05;
      }
    },
    engine(on, speed01) {
      if (!this.ctx || this.muted) return;
      if (on && !this.engineOsc) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = 70;
        g.gain.value = 0.03;
        o.connect(g).connect(this.master);
        o.start();
        this.engineOsc = o;
        this.engineGain = g;
      } else if (!on && this.engineOsc) {
        try { this.engineOsc.stop(); } catch { /* sudah berhenti */ }
        this.engineOsc = null;
        this.engineGain = null;
      } else if (on && this.engineOsc) {
        this.engineOsc.frequency.value = 60 + speed01 * 130;
        this.engineGain.gain.value = 0.02 + speed01 * 0.04;
      }
    },
  };
}

// Volume hujan 0..1 dari cuaca: dipakai penyeimbang visual — makin
// deras hujan di layar, makin keras suaranya (bila suara hidup).
const RAIN_VOLUME_BY_WEATHER = { storm: 0.85, rain: 0.5 };

export function rainVolumeFor(sky) {
  if (!sky) return 0;
  return RAIN_VOLUME_BY_WEATHER[sky.weather] || 0;
}

// Apakah suasana malam butuh dengung kota yang lebih pelan.
const NIGHT_START_HOUR = 19;
const NIGHT_END_HOUR = 6;

export function nightAmbienceFor(sky) {
  const h = ((sky.clock / 60) % 24 + 24) % 24;
  const isNightHour = h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
  return isNightHour ? 0.6 : 1;
}
