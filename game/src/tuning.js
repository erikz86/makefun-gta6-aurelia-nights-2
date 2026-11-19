// Aurelia Nights II: Empire of the Storm — tuning and balance.
// Every number the game runs on lives here so the other files stay about
// behaviour, not magic constants. The city is Port Aurelia a year after the
// first game's bank job: bigger, wetter, and for sale.

export const STEP = 1 / 60;
export const WORLD_W = 4600;
export const WORLD_H = 3400;

export const START_MONEY = 850;
export const START_CLOCK_MINUTES = 20 * 60 + 40; // 20:40, dusk falling

// Driving: base values, multiplied by the weather grip factor in sky.js.
export const CAR = {
  accel: 420,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 170,
  turnRate: 2.7,
  drag: 0.55,
  grip: 1.0,
};
export const ON_FOOT = { speed: 235, sprint: 330 };

export const WEATHER = {
  clear: { label: 'Cerah', grip: 1.0, sight: 1.0, pedRate: 1.0, traffic: 1.0, rain: 0 },
  rain: { label: 'Hujan', grip: 0.62, sight: 0.78, pedRate: 0.55, traffic: 0.85, rain: 1 },
  storm: { label: 'Badai', grip: 0.5, sight: 0.6, pedRate: 0.35, traffic: 0.7, rain: 2 },
  fog: { label: 'Kabut', grip: 0.85, sight: 0.45, pedRate: 0.7, traffic: 0.8, rain: 0 },
};
// How long one weather state lasts, in game hours, before it may roll again.
export const WEATHER_HOURS = { min: 2.5, max: 6 };

// Wanted / police.
export const WANTED = {
  max: 5,
  decaySeconds: 26, // quiet seconds before one star fades
  bustSeconds: 2.4, // cop standing next to you on foot
  copSpeed: 480,
  copRamDamage: 9,
};

// Money.
export const PAYOUT = {
  taxiFare: 120,
  delivery: 180,
  raceWin: 900,
  raceEntry: 200,
  bribe: 400,
  smuggleBaseMult: 1.35,
  smuggleStormBonus: 0.25,
  smuggleFastBonus: 0.15,
};

// Pasar gelap: angka-angka ekonomi malam yang dipakai blackmarket.js
// dan smuggling.js. Stash 40 bobot memaksa pilihan — senjata berat
// menguntungkan tapi memakan tempat yang bisa diisi tiga rempah.
export const BLACKMARKET = {
  stashCapacity: 40,
  repForZara: 25,
  repForSilencio: 60,
  heatDeal: 1,
  heatRunFail: 10,
  heatDanger: 70,
  heatHunt: 85,
  washCut: { 1: 0.35, 2: 0.25, 3: 0.15 },
  washCap: { 1: 800, 2: 2000, 3: 5000 },
  runMinSeconds: 55,
  runMaxSeconds: 150,
  checkpointRadiusFoot: 100,
  checkpointRadiusCar: 130,
  dropoffRadius: 150,
};

export const WEAPONS = {
  pistol: { name: 'Pistol', price: 0, ammoPrice: 25, damage: 34, rate: 0.34, spread: 0.05, pellets: 1, range: 560, owned: true, ammo: 48 },
  shotgun: { name: 'Shotgun', price: 1200, ammoPrice: 60, damage: 17, rate: 0.85, spread: 0.34, pellets: 6, range: 340, owned: false, ammo: 0 },
  smg: { name: 'SMG', price: 2400, ammoPrice: 45, damage: 15, rate: 0.09, spread: 0.12, pellets: 1, range: 480, owned: false, ammo: 0 },
};

// Properties of the empire: price, base income per game hour at level 1,
// upgrade costs. Income ticks every game hour and lands in the till.
export const PROPERTIES = [
  { id: 'garage', name: 'Roda Gila Garage', kind: 'Bengkel', price: 1500, income: 90, upgrade: [900, 1800], x: 690, y: 2650, colour: '#e67e22' },
  { id: 'diner', name: 'Warung Senja', kind: 'Rumah makan', price: 3200, income: 160, upgrade: [1600, 3200], x: 2340, y: 1450, colour: '#f1c40f' },
  { id: 'club', name: 'Neon Tide', kind: 'Kelab malam', price: 8000, income: 420, upgrade: [4200, 8400], x: 3560, y: 2050, colour: '#e84393' },
  { id: 'laundry', name: 'Kilau Laundry', kind: 'Laundromat', price: 2200, income: 110, upgrade: [1100, 2200], x: 1240, y: 620, colour: '#00cec9' },
];

// The crew: who they are, what they cost to hire, their cut of every heist.
export const CREW = [
  { id: 'lena', name: 'Lena Voss', role: 'Pembalap', skill: 4, hire: 600, cut: 0.12, x: 3120, y: 2900, colour: '#fd79a8' },
  { id: 'otto', name: 'Otto Kran', role: 'Hacker', skill: 3, hire: 900, cut: 0.15, x: 1850, y: 480, colour: '#74b9ff' },
  { id: 'bruno', name: 'Bruno Halden', role: 'Otot', skill: 5, hire: 1200, cut: 0.18, x: 950, y: 1150, colour: '#fdcb6e' },
];

// Heists: base payout, wanted spike on execution, crew needed.
export const HEISTS = [
  { id: 'jewel', name: 'Permata Row', target: 'Toko perhiasan Permata Row', payout: 6000, wanted: 3, need: ['lena'], x: 2900, y: 950 },
  { id: 'truck', name: 'Konvoi Besi', target: 'Truk lapis baja rute pelabuhan', payout: 9500, wanted: 3, need: ['lena', 'bruno'], x: 420, y: 2050 },
  { id: 'vault', name: 'Grand Vault', target: 'Brankas kasino Grand Aurelia', payout: 16000, wanted: 4, need: ['lena', 'otto', 'bruno'], x: 3650, y: 1150 },
];

export const DISTRICTS = [
  { id: 'docks', name: 'Pelabuhan Tua', x0: 0, y0: 2100, x1: 1500, y1: 3400, ground: '#3d4a3a', road: '#2e3138', accent: '#e67e22' },
  { id: 'strip', name: 'Neon Mile', x0: 3000, y0: 1500, x1: 4600, y1: 2600, ground: '#2c2438', road: '#33313d', accent: '#e84393' },
  { id: 'hills', name: 'Bukit Villa', x0: 0, y0: 0, x1: 1500, y1: 1100, ground: '#274435', road: '#2f3542', accent: '#00cec9' },
  { id: 'downtown', name: 'Downtown', x0: 2400, y0: 0, x1: 4600, y1: 1500, ground: '#323a4a', road: '#2b2f3a', accent: '#74b9ff' },
  { id: 'plaza', name: 'Plaza Aurelia', x0: 1500, y0: 1100, x1: 3000, y1: 2100, ground: '#3a3f35', road: '#31353d', accent: '#f1c40f' },
];
