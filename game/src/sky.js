// The sky over Port Aurelia: a full day/night cycle and a weather engine.
// Both change how the game plays, not just how it looks — rain makes the
// roads slick, fog blinds the police, night pays heists better and opens
// the street races. The renderer asks this file what the light is like.

import { WEATHER, WEATHER_HOURS } from './tuning.js';
import { makeRng, pick, range } from './rng.js';

export const WEATHER_KINDS = ['clear', 'rain', 'storm', 'fog'];

export function createSky(clockMinutes, weatherKind) {
  return {
    clock: clockMinutes, // minutes since midnight
    weather: weatherKind || 'clear',
    weatherHoursLeft: range(makeRng(99), WEATHER_HOURS.min, WEATHER_HOURS.max),
    lightning: 0, // 0..1 flash strength, decays each step
    lightningTimer: 4 + Math.random() * 6,
    rainDrops: [],
  };
}

export function isNight(sky) {
  const h = sky.clock / 60;
  return h >= 19 || h < 6;
}

export function daylight(sky) {
  // 0 = deep night, 1 = noon. Dawn and dusk ramp smoothly.
  const h = sky.clock / 60;
  if (h >= 6 && h < 8) return (h - 6) / 2 * 0.7 + 0.15;
  if (h >= 8 && h < 17) return 1;
  if (h >= 17 && h < 19) return 1 - ((h - 17) / 2) * 0.85;
  return 0.12;
}

export function weatherNow(sky) {
  return WEATHER[sky.weather];
}

export function gripFactor(sky) {
  return weatherNow(sky).grip;
}

export function sightFactor(sky) {
  return weatherNow(sky).sight;
}

export function heistBonus(sky) {
  // Night work pays: the crew earns a quarter more after dark.
  return isNight(sky) ? 1.25 : 1;
}

// The black market breathes with the same sky: a storm makes buyers
// nervous and generous, rain hides the handoff, fog hides the runner.
export function smuggleBonus(sky) {
  if (sky.weather === 'storm') return 1.25;
  if (sky.weather === 'rain') return 1.1;
  return 1;
}

export function marketOpen(sky) {
  return isNight(sky);
}

export function heatDecayRate(sky, wanted) {
  let rate = 0.35;
  if (sky.weather === 'fog') rate = 0.8;
  else if (sky.weather === 'rain') rate = 0.6;
  else if (sky.weather === 'storm') rate = 0.7;
  if (wanted === 0) rate *= 1.6;
  return rate;
}

export function clockLabel(sky) {
  const h = Math.floor(sky.clock / 60) % 24;
  const m = Math.floor(sky.clock % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function stepSky(sky, dt, rng) {
  // One game minute passes every real second of play.
  sky.clock = (sky.clock + dt) % (24 * 60);
  sky.weatherHoursLeft -= dt / 3600;
  if (sky.weatherHoursLeft <= 0) {
    const roll = rng();
    const next = roll < 0.45 ? 'clear' : roll < 0.72 ? 'rain' : roll < 0.84 ? 'fog' : 'storm';
    sky.weather = next;
    sky.weatherHoursLeft = range(rng, WEATHER_HOURS.min, WEATHER_HOURS.max);
  }
  if (sky.weather === 'storm') {
    sky.lightningTimer -= dt;
    if (sky.lightningTimer <= 0) {
      sky.lightning = 1;
      sky.lightningTimer = 3 + rng() * 9;
    }
  }
  if (sky.lightning > 0) sky.lightning = Math.max(0, sky.lightning - dt * 2.2);
  // Rain streaks drift down-left across the screen; the renderer draws them.
  if (weatherNow(sky).rain > 0) {
    while (sky.rainDrops.length < 90 * weatherNow(sky).rain) {
      sky.rainDrops.push({ x: rng() * 1400, y: rng() * 800, v: 500 + rng() * 300 });
    }
  } else {
    sky.rainDrops.length = 0;
  }
  for (const d of sky.rainDrops) {
    d.y += d.v * dt;
    d.x -= d.v * 0.25 * dt;
    if (d.y > 820) { d.y = -20; d.x = rng() * 1400; }
  }
}

// Suasana langit dalam satu kata untuk banner dan log: menggabungkan
// fase hari dengan cuaca supaya "SENJA HUJAN" terasa beda dari "SENJA".
export function skyMood(sky) {
  const h = ((sky.clock / 60) % 24 + 24) % 24;
  const phase = h >= 6 && h < 8 ? 'fajar' : h >= 8 && h < 17 ? 'siang' : h >= 17 && h < 19 ? 'senja' : 'malam';
  const weatherWord = sky.weather === 'rain' ? 'hujan' : sky.weather === 'storm' ? 'badai' : sky.weather === 'fog' ? 'kabut' : 'cerah';
  return { phase, weather: weatherWord, label: `${phase} ${weatherWord}`, hour: Math.floor(h) };
}

// Seberapa "terbuka" langit untuk misi malam: 1 saat gelap gulita,
// 0 saat siang terik. Dipakai pasar gelap dan beacon misi.
export function nightDepth(sky) {
  return 1 - daylight(sky);
}
