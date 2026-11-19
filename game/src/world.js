// Port Aurelia, rebuilt for the sequel: five districts, a road grid the
// traffic actually drives on, buildings you can hide behind, and named
// landmarks the missions and the empire point at. Everything is generated
// from one seed, so the city is the same every time you load it.

import { DISTRICTS, WORLD_W, WORLD_H } from './tuning.js';
import { makeRng, pick, range, intRange, chance } from './rng.js';

// Avenues run north-south, streets east-west. The grid is deliberately
// uneven: the port's roads are wide, the hills' are narrow and crooked.
export const AVENUES = [240, 720, 1180, 1650, 2120, 2620, 3120, 3620, 4080, 4440];
export const STREETS = [220, 560, 940, 1280, 1620, 1980, 2360, 2720, 3060, 3240];
export const ROAD_W = 96;

const ROOFS = ['#5d6d7e', '#7d6608', '#6c3483', '#1a5276', '#7b241c', '#4a235a', '#145a32', '#7e5109'];
const WALLS = ['#a1887f', '#90a4ae', '#bcaaa4', '#8d6e63', '#78909c', '#a1887f', '#9575cd', '#4db6ac'];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[4];
}

function nearestRoadCoord(list, v) {
  let best = list[0];
  for (const c of list) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}

export function nearestRoadPoint(x, y) {
  const ax = nearestRoadCoord(AVENUES, x);
  const ay = nearestRoadCoord(STREETS, y);
  // Snap to whichever road line is closer.
  return Math.abs(ax - x) < Math.abs(ay - y) ? { x: ax, y } : { x, y: ay };
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];
  const containers = [];

  // One building per city block, sometimes two. A block is the rectangle
  // between two avenues and two streets; the building sits inside it with
  // a pavement margin so the player can always walk around it.
  for (let ai = 0; ai < AVENUES.length - 1; ai += 1) {
    for (let si = 0; si < STREETS.length - 1; si += 1) {
      const x0 = AVENUES[ai] + ROAD_W / 2 + 14;
      const x1 = AVENUES[ai + 1] - ROAD_W / 2 - 14;
      const y0 = STREETS[si] + ROAD_W / 2 + 14;
      const y1 = STREETS[si + 1] - ROAD_W / 2 - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const d = districtAt(cx, cy);
      const twin = chance(rng, 0.3) && x1 - x0 > 260;
      const lots = twin ? 2 : 1;
      for (let k = 0; k < lots; k += 1) {
        const w = twin ? (x1 - x0) / 2 - 18 : (x1 - x0) * range(rng, 0.55, 0.85);
        const h = (y1 - y0) * range(rng, 0.5, 0.8);
        const bx = twin ? x0 + 8 + k * ((x1 - x0) / 2) : cx - w / 2;
        const by = cy - h / 2;
        const tall = d.id === 'downtown' ? intRange(rng, 3, 9) : d.id === 'hills' ? 1 : intRange(rng, 1, 4);
        buildings.push({
          x: bx, y: by, w, h,
          floors: tall,
          roof: pick(rng, ROOFS),
          wall: pick(rng, WALLS),
          district: d.id,
          lit: chance(rng, 0.7),
        });
      }
      // Street trees and lamps around the block's corners.
      if (chance(rng, 0.55)) trees.push({ x: x0 + 10, y: y0 + 10, r: range(rng, 14, 22) });
      if (chance(rng, 0.5)) trees.push({ x: x1 - 10, y: y1 - 10, r: range(rng, 14, 22) });
      lamps.push({ x: AVENUES[ai] + ROAD_W / 2 + 6, y: STREETS[si] + ROAD_W / 2 + 6 });
    }
  }

  // The old port's container yard: stacked boxes near the docks, solid.
  for (let i = 0; i < 26; i += 1) {
    containers.push({
      x: 120 + (i % 8) * 130 + range(rng, -12, 12),
      y: 2280 + Math.floor(i / 8) * 150 + range(rng, -10, 10),
      w: 110, h: 52,
      colour: pick(rng, ['#c0392b', '#2980b9', '#27ae60', '#d4ac0d', '#7d3c98']),
    });
  }

  const landmarks = [
    { id: 'safehouse', name: "Loteng Kai", x: 420, y: 2920, w: 150, h: 110, colour: '#f39c12' },
    { id: 'garage', name: 'Roda Gila Garage', x: 690, y: 2650, w: 170, h: 120, colour: '#e67e22' },
    { id: 'diner', name: 'Warung Senja', x: 2340, y: 1450, w: 160, h: 110, colour: '#f1c40f' },
    { id: 'club', name: 'Neon Tide', x: 3560, y: 2050, w: 190, h: 130, colour: '#e84393' },
    { id: 'casino', name: 'Grand Aurelia', x: 3650, y: 1150, w: 260, h: 170, colour: '#9b59b6' },
    { id: 'jewel', name: 'Permata Row', x: 2900, y: 950, w: 150, h: 100, colour: '#1abc9c' },
    { id: 'gunshop', name: 'Ironworks', x: 1560, y: 2360, w: 140, h: 100, colour: '#95a5a6' },
    { id: 'hospital', name: 'RS Aurelia', x: 2150, y: 640, w: 200, h: 130, colour: '#ecf0f1' },
    { id: 'policehq', name: 'Markas Polisi', x: 3320, y: 1450, w: 200, h: 140, colour: '#2c3e50' },
    { id: 'laundry', name: 'Kilau Laundry', x: 1240, y: 620, w: 130, h: 90, colour: '#00cec9' },
    { id: 'bank', name: 'Bank Aurelia', x: 2620, y: 1980, w: 180, h: 120, colour: '#d4ac0d' },
  ];

  return { buildings, trees, lamps, containers, landmarks, seed };
}

// Is a point on a road (drivable / walkable without a wall in the way)?
export function onRoad(x, y) {
  const nearAve = AVENUES.some((a) => Math.abs(x - a) <= ROAD_W / 2 + 6);
  const nearSt = STREETS.some((s) => Math.abs(y - s) <= ROAD_W / 2 + 6);
  return nearAve || nearSt;
}

// Circle vs building/container AABBs. Returns the push-out for a circle at
// (x, y) with radius r, or null when nothing overlaps.
export function collideCircle(city, x, y, r) {
  const solids = city._solids || (city._solids = [...city.buildings, ...city.containers, ...city.landmarks]);
  for (const b of solids) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.001;
      return { x: (dx / d) * (r - d), y: (dy / d) * (r - d) };
    }
  }
  return null;
}

export function clampToWorld(x, y, margin = 30) {
  return {
    x: Math.max(margin, Math.min(WORLD_W - margin, x)),
    y: Math.max(margin, Math.min(WORLD_H - margin, y)),
  };
}
