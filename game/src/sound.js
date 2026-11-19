// Synthetic sound for Aurelia Nights II: every effect is built with the
// WebAudio API, no audio files, no network. Rain is looped filtered noise,
// thunder is a low burst, the siren wails two tones, the engine hums.

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
    noise(dur, vol = 0.25, lowpass = 1200) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
    },
    shoot(kind) {
      if (kind === 'shotgun') { this.noise(0.22, 0.5, 900); this.tone(140, 0.12, 'square', 0.2, 60); }
      else if (kind === 'smg') { this.noise(0.08, 0.3, 2400); this.tone(320, 0.06, 'square', 0.12, 180); }
      else { this.noise(0.12, 0.35, 1800); this.tone(220, 0.08, 'square', 0.15, 90); }
    },
    siren() { this.tone(720, 0.45, 'sine', 0.07, 980); },
    thunder() { this.noise(1.6, 0.5, 220); this.tone(55, 1.4, 'sine', 0.25, 32); },
    coin() { this.tone(880, 0.09, 'sine', 0.18); setTimeout(() => this.tone(1318, 0.14, 'sine', 0.18), 90); },
    blip() { this.tone(660, 0.07, 'square', 0.1); },
    mission() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.2), i * 110)); },
    busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.16), i * 160)); },
    setRain(on, heavy) {
      if (!this.ctx || this.muted) return;
      if (on && !this.rainSrc) {
        const len = this.ctx.sampleRate * 2;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
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
        try { this.rainSrc.stop(); } catch { /* already stopped */ }
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
        try { this.engineOsc.stop(); } catch { /* already stopped */ }
        this.engineOsc = null;
        this.engineGain = null;
      } else if (on && this.engineOsc) {
        this.engineOsc.frequency.value = 60 + speed01 * 130;
        this.engineGain.gain.value = 0.02 + speed01 * 0.04;
      }
    },
  };
}
