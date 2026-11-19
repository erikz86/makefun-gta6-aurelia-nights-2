// Cars of Port Aurelia: the player's rides, the traffic's, and the
// police interceptors. Driving is arcade physics — acceleration, braking,
// steering that bites harder the slower you go — with the weather's grip
// factor deciding how much of your steering the road actually honours.

import { CAR } from './tuning.js';
import { clamp, wrapAngle } from './rng.js';
import { collideCircle, clampToWorld, onRoad } from './world.js';

export const CAR_TYPES = {
  sedan: { w: 44, h: 22, colour: '#7f8c8d', top: 330 },
  sport: { w: 46, h: 21, colour: '#e74c3c', top: 560 },
  taxi: { w: 44, h: 22, colour: '#f1c40f', top: 350 },
  truck: { w: 58, h: 26, colour: '#5d6d7e', top: 260 },
  police: { w: 46, h: 22, colour: '#2c3e50', top: 590 },
  van: { w: 50, h: 24, colour: '#16a085', top: 300 },
  smuggler: { w: 50, h: 24, colour: '#1a1a2e', top: 610, hidden: true },
};

// A smuggler's van: matte black, no plates, faster than a police
// interceptor on a straight road and worse in the wet. It spawns
// parked near the docks at night for runners who need a fast getaway.
export function createSmugglerVan(x, y, angle) {
  const van = createCar(x, y, angle, 'smuggler');
  van.nitro = 3; // three short bursts per van, refilled at the garage
  van.nitroCd = 0;
  return van;
}

// One nitro burst: a hard shove past the car's top speed that decays
// over two seconds. Only the smuggler van carries nitro.
export function applyNitro(car, dt) {
  if (!car || car.type !== 'smuggler') return false;
  if ((car.nitro || 0) <= 0 || (car.nitroCd || 0) > 0) return false;
  car.nitro -= 1;
  car.nitroCd = 8;
  car.nitroBoost = 2.2;
  return true;
}

export function stepNitro(car, dt) {
  if (car.nitroCd > 0) car.nitroCd -= dt;
  if (car.nitroBoost > 0) {
    car.nitroBoost = Math.max(0, car.nitroBoost - dt);
    car.speed = Math.min(car.speed + 260 * dt, car.top * 1.35);
  }
}

let nextCarId = 1;

export function createCar(x, y, angle, type, colour) {
  const t = CAR_TYPES[type] || CAR_TYPES.sedan;
  return {
    id: nextCarId += 1,
    x, y, angle,
    speed: 0,
    type,
    w: t.w, h: t.h,
    colour: colour || t.colour,
    top: t.top,
    driver: null, // 'player' | 'traffic' | 'police' | null (parked)
    health: 100,
    hitCd: 0, // seconds until the next crash can hurt again
    route: null, // traffic waypoint list
    routeI: 0,
    wait: 0,
    brakeLight: false,
  };
}

export function stepCar(car, input, dt, grip) {
  if (car.hitCd > 0) car.hitCd -= dt;
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const gas = input.up ? 1 : 0;
  const brake = input.down ? 1 : 0;
  if (gas) car.speed += CAR.accel * grip * dt;
  if (brake) {
    if (car.speed > 5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
  }
  if (!gas && !brake) car.speed -= Math.sign(car.speed) * CAR.drag * 220 * dt;
  const top = car.top * (0.55 + 0.45 * grip);
  car.speed = clamp(car.speed, -CAR.maxReverse, top);
  if (Math.abs(car.speed) < 4 && !gas && !brake) car.speed = 0;
  // Steering fades at a standstill and grips less in the wet.
  const steerAuthority = clamp(Math.abs(car.speed) / 140, 0, 1) * (0.55 + 0.45 * grip);
  car.angle += steer * CAR.turnRate * steerAuthority * Math.sign(car.speed || 1) * dt;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.brakeLight = !!brake;
}

export function stepTrafficCar(game, car, dt) {
  if (!car.route || car.route.length === 0) return;
  const target = car.route[car.routeI % car.route.length];
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const d = Math.hypot(dx, dy);
  if (d < 26) {
    car.routeI += 1;
    return;
  }
  const want = Math.atan2(dy, dx);
  const diff = wrapAngle(want - car.angle);
  const input = {
    up: Math.abs(diff) < 1.1,
    down: false,
    left: diff < -0.06,
    right: diff > 0.06,
  };
  const cruise = car.top * 0.55;
  if (car.speed > cruise) input.up = false;
  stepCar(car, input, dt, game.grip);
  // Keep traffic on the roads: nudge it back when it slides off.
  if (!onRoad(car.x, car.y)) {
    car.speed *= 0.94;
  }
}

export function resolveCarWorld(game, car) {
  const p = clampToWorld(car.x, car.y, 40);
  car.x = p.x;
  car.y = p.y;
  const push = collideCircle(game.city, car.x, car.y, car.w / 2);
  if (push) {
    car.x += push.x;
    car.y += push.y;
    car.speed *= 0.6;
    // A hard crash hurts, but not every frame of the same scrape.
    if (Math.abs(car.speed) > 240 && car.hitCd <= 0) {
      car.health -= 8;
      car.hitCd = 0.5;
    }
  }
}

export function carsOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = (a.w + b.w) / 2 - 6;
  return dx * dx + dy * dy < r * r;
}

// Rasio selip kendaraan 0..1: kecepatan relatif terhadap top speed.
// Dipakai efek visual untuk bekas ban dan asap knalpot.
export function vehicleSlipRatio(car) {
  if (!car) return 0;
  return Math.min(1, Math.abs(car.speed || 0) / Math.max(1, car.top || 220));
}

// Mobil berasap bila health di bawah ambang — visual meniru angka ini.
export function vehicleSmoking(car) {
  return typeof car.health === 'number' && car.health > 0 && car.health < 45;
}
