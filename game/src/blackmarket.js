// The black market of Port Aurelia: three dealers who only work after
// dark, five kinds of contraband, a stash that the police would love to
// find, and a reputation that opens better prices the deeper you go.
// The market is a night economy layered on top of the legal empire: buy
// low from a dealer, run the goods across town before the heat catches
// you, sell high to the next dealer, then wash the dirty money through
// a laundry you own. Nothing here is legal, and the game never pretends
// otherwise — every deal raises heat, and heat brings interceptors.

import { isNight, weatherNow } from './sky.js';
import { clamp, pick } from './rng.js';
import { addWanted } from './law.js';
import { stashCapacity } from './empire.js';

// ---- The goods: what moves through the alleys after dark. ----
// buy is what a dealer charges you, sell is what another dealer pays.
// weight decides how much fits in the stash; heat is how much attention
// one unit draws when the police search a run.
export const CONTRABAND = {
  spice: { id: 'spice', name: 'Rempah Hitam', buy: 140, sell: 230, weight: 1, heat: 1, blurb: 'Bumbu pelabuhan yang dilarang beredar.' },
  chips: { id: 'chips', name: 'Chip Curian', buy: 320, sell: 520, weight: 2, heat: 2, blurb: 'Chip kasino yang "jatuh" dari truk.' },
  relic: { id: 'relic', name: 'Relik Kuno', buy: 700, sell: 1150, weight: 3, heat: 3, blurb: 'Patung kecil dari kapal karam.' },
  meds: { id: 'meds', name: 'Obat Langka', buy: 260, sell: 430, weight: 1, heat: 1, blurb: 'Obat rumah sakit yang tidak tercatat.' },
  arms: { id: 'arms', name: 'Senjata Selundupan', buy: 900, sell: 1500, weight: 4, heat: 4, blurb: 'Kotak amunisi tanpa nomor seri.' },
};

export const GOODS_ORDER = ['spice', 'chips', 'meds', 'relic', 'arms'];

// ---- The dealers: fixed spots, fixed personalities, moving prices. ----
export const DEALERS = [
  {
    id: 'rook', name: 'Rook', title: 'Makelar Pelabuhan', x: 520, y: 2420,
    colour: '#e67e22', repNeeded: 0, markup: 1.0, district: 'Pelabuhan Tua',
    greeting: 'Rook: "Barang datang dari kapal, Kai. Tanya harga, jangan tanya asal."',
    stock: ['spice', 'chips', 'meds'],
  },
  {
    id: 'zara', name: 'Madame Zara', title: 'Ratu Neon Mile', x: 3350, y: 1860,
    colour: '#e84393', repNeeded: 25, markup: 0.94, district: 'Neon Mile',
    greeting: 'Zara: "Kau sudah punya nama di jalanan. Untukmu, harga teman."',
    stock: ['spice', 'chips', 'relic', 'meds'],
  },
  {
    id: 'silencio', name: 'El Silencio', title: 'Hantu Downtown', x: 3980, y: 720,
    colour: '#8e44ad', repNeeded: 60, markup: 0.86, district: 'Downtown',
    greeting: 'Silencio: "..." (Ia mengangguk. Harga di papan bicara sendiri.)',
    stock: ['chips', 'relic', 'arms', 'meds'],
  },
];

export const STASH_CAPACITY = 40;
export const REP_TIERS = [
  { min: 0, name: 'Anak Baru', bonus: 0 },
  { min: 25, name: 'Kurir Jalanan', bonus: 0.05 },
  { min: 60, name: 'Tangan Kanan', bonus: 0.1 },
  { min: 120, name: 'Raja Gelap', bonus: 0.18 },
];

export function repTier(rep) {
  let tier = REP_TIERS[0];
  for (const t of REP_TIERS) if (rep >= t.min) tier = t;
  return tier;
}

export function createBlackMarket() {
  const stash = {};
  for (const id of GOODS_ORDER) stash[id] = 0;
  return {
    stash,
    dirtyMoney: 0,
    washedTotal: 0,
    rep: 0,
    heat: 0, // 0..100, decays slowly; at 70+ the police hunt runs
    dealsDone: 0,
    runsDone: 0,
    runsFailed: 0,
    goodsSold: 0,
    profitTotal: 0,
    bestRunPayout: 0,
    dealerMet: {},
    run: null, // active smuggle run (owned by smuggling.js)
    lastDealerId: null,
    tipIndex: 0,
  };
}

export function dealerById(id) {
  return DEALERS.find((d) => d.id === id) || null;
}

export function nearestDealer(game, maxDist = 320) {
  let best = null;
  let bestD = maxDist;
  for (const d of DEALERS) {
    const dist = Math.hypot(d.x - game.player.x, d.y - game.player.y);
    if (dist < bestD) { best = d; bestD = dist; }
  }
  return best;
}

export function dealersUnlocked(game) {
  return DEALERS.filter((d) => game.blackmarket.rep >= d.repNeeded);
}

export function stashWeight(bm) {
  let w = 0;
  for (const id of GOODS_ORDER) w += (bm.stash[id] || 0) * CONTRABAND[id].weight;
  return w;
}

export function stashValue(bm) {
  let v = 0;
  for (const id of GOODS_ORDER) v += (bm.stash[id] || 0) * CONTRABAND[id].sell;
  return v;
}

export function stashCount(bm) {
  let n = 0;
  for (const id of GOODS_ORDER) n += bm.stash[id] || 0;
  return n;
}

// A dealer's price moves with reputation, the weather, and the hour:
// rain hides the trade (cheaper), a storm makes everyone nervous
// (dearer), and a good reputation is a standing discount.
export function buyPrice(game, dealer, goodId) {
  const good = CONTRABAND[goodId];
  if (!good) return 0;
  let price = good.buy * dealer.markup;
  const tier = repTier(game.blackmarket.rep);
  price *= 1 - tier.bonus;
  const w = weatherNow(game.sky);
  if (game.sky.weather === 'rain') price *= 0.94;
  if (game.sky.weather === 'storm') price *= 1.1;
  if (game.sky.weather === 'fog') price *= 0.97;
  return Math.max(20, Math.round(price));
}

export function sellPrice(game, dealer, goodId) {
  const good = CONTRABAND[goodId];
  if (!good) return 0;
  let price = good.sell;
  const tier = repTier(game.blackmarket.rep);
  price *= 1 + tier.bonus;
  if (game.sky.weather === 'storm') price *= 1.12;
  if (isNight(game.sky)) price *= 1.05;
  return Math.max(20, Math.round(price));
}

export function canDeal(game, dealer) {
  if (!dealer) return { ok: false, why: 'Tidak ada dealer di dekatmu.' };
  if (!isNight(game.sky)) {
    return { ok: false, why: `${dealer.name} hanya berdagang setelah gelap (19:00–06:00).` };
  }
  if (game.blackmarket.rep < dealer.repNeeded) {
    return { ok: false, why: `${dealer.name} butuh reputasi ${dealer.repNeeded}. Reputasimu ${game.blackmarket.rep}.` };
  }
  if (game.blackmarket.run) {
    return { ok: false, why: 'Selesaikan dulu run selundupan yang sedang berjalan.' };
  }
  return { ok: true, why: '' };
}

export function addHeat(game, amount, reason) {
  const bm = game.blackmarket;
  bm.heat = clamp(bm.heat + amount, 0, 100);
  if (bm.heat >= 70 && game.wanted < 2) addWanted(game, 1, reason || 'Pasar gelap memanas');
  return bm.heat;
}

export function decayHeat(game, dt) {
  const bm = game.blackmarket;
  if (bm.heat <= 0) return;
  // Heat cools slowly on its own, faster in fog and rain when the
  // police cannot see far — and faster still when you stay quiet.
  let rate = 0.35;
  if (game.sky.weather === 'fog') rate = 0.8;
  else if (game.sky.weather === 'rain') rate = 0.6;
  else if (game.sky.weather === 'storm') rate = 0.7;
  if (game.wanted === 0) rate *= 1.6;
  bm.heat = Math.max(0, bm.heat - rate * dt);
}

export function gainRep(game, amount, why) {
  const bm = game.blackmarket;
  const before = repTier(bm.rep);
  bm.rep += amount;
  const after = repTier(bm.rep);
  if (after.min > before.min) {
    game.toast(`Reputasi naik: ${after.name}! Harga pasar gelap membaik.`);
    if (game.sound) game.sound.mission();
  } else if (why) {
    game.toast(`${why} — reputasi +${amount}.`);
  }
  return bm.rep;
}

export function buyGood(game, dealer, goodId, qty = 1) {
  const bm = game.blackmarket;
  const good = CONTRABAND[goodId];
  if (!good || !dealer || !dealer.stock.includes(goodId)) {
    game.toast('Barang itu tidak dijual dealer ini.');
    return false;
  }
  const gate = canDeal(game, dealer);
  if (!gate.ok) { game.toast(gate.why); return false; }
  const price = buyPrice(game, dealer, goodId) * qty;
  if (game.money < price) {
    game.toast(`Uang tidak cukup: ${good.name} x${qty} = $${price}.`);
    return false;
  }
  if (stashWeight(bm) + good.weight * qty > stashCapacity(game)) {
    game.toast(`Stash penuh (${stashWeight(bm)}/${stashCapacity(game)}). Jual dulu, antar run, atau upgrade garage (lv 2+) / rekrut Bruno.`);
    return false;
  }
  game.money -= price;
  bm.stash[goodId] += qty;
  bm.dealsDone += 1;
  bm.lastDealerId = dealer.id;
  bm.dealerMet[dealer.id] = true;
  addHeat(game, good.heat * qty, 'Transaksi gelap ketahuan');
  gainRep(game, 1, '');
  game.toast(`Beli ${good.name} x${qty} — $${price}. Stash: ${stashWeight(bm)}/${stashCapacity(game)}.`);
  if (game.sound) game.sound.deal();
  return true;
}

export function sellGood(game, dealer, goodId, qty = 1) {
  const bm = game.blackmarket;
  const good = CONTRABAND[goodId];
  if (!good || !dealer) return false;
  const gate = canDeal(game, dealer);
  if (!gate.ok) { game.toast(gate.why); return false; }
  const have = bm.stash[goodId] || 0;
  if (have < qty) {
    game.toast(`Kau tidak punya ${good.name} sebanyak itu di stash.`);
    return false;
  }
  const price = sellPrice(game, dealer, goodId) * qty;
  bm.stash[goodId] -= qty;
  bm.goodsSold += qty;
  bm.profitTotal += price;
  // Selling pays dirty money: it must be washed before it is safe.
  // A small cut is clean on the spot (the dealer's own pocket change).
  const cleanCut = Math.round(price * 0.1);
  bm.dirtyMoney += price - cleanCut;
  game.money += cleanCut;
  gainRep(game, 2, '');
  addHeat(game, Math.ceil(good.heat * qty * 0.5), 'Penjualan gelap terlacak');
  game.toast(`Jual ${good.name} x${qty} — $${price} (bersih $${cleanCut}, kotor $${price - cleanCut}).`);
  if (game.sound) game.sound.coin();
  return true;
}

export function sellAllStash(game, dealer) {
  const bm = game.blackmarket;
  let sold = 0;
  let total = 0;
  for (const id of GOODS_ORDER) {
    const have = bm.stash[id] || 0;
    if (have > 0) {
      const price = sellPrice(game, dealer, id) * have;
      total += price;
      sold += have;
      bm.stash[id] = 0;
    }
  }
  if (sold === 0) {
    game.toast('Stash kosong — tidak ada yang dijual.');
    return false;
  }
  const cleanCut = Math.round(total * 0.1);
  bm.dirtyMoney += total - cleanCut;
  game.money += cleanCut;
  bm.goodsSold += sold;
  bm.profitTotal += total;
  gainRep(game, 3, '');
  addHeat(game, 6, 'Penjualan besar terlacak');
  game.toast(`Stash ludes: ${sold} barang terjual $${total}. Kotor $${total - cleanCut} menunggu dicuci.`);
  if (game.sound) game.sound.coin();
  return true;
}

// Washing: only a laundry you own can clean dirty money, and it takes
// a cut. The higher the laundry level, the smaller the cut and the
// bigger the nightly wash cap. Called from the dealer panel (key 6)
// and from the empire hourly tick.
export function washRate(game) {
  const laundry = game.empire.props.laundry;
  if (!laundry || !laundry.owned) return null;
  return { cut: [0, 0.35, 0.25, 0.15][laundry.level] || 0.35, cap: [0, 800, 2000, 5000][laundry.level] || 800 };
}

export function launderMoney(game, amount) {
  const bm = game.blackmarket;
  const rate = washRate(game);
  if (!rate) {
    game.toast('Cuci uang butuh Laundromat Kilau Laundry (beli di B — bisnis).');
    return 0;
  }
  const washable = Math.min(bm.dirtyMoney, rate.cap, amount || rate.cap);
  if (washable <= 0) {
    game.toast('Tidak ada uang kotor untuk dicuci.');
    return 0;
  }
  const fee = Math.round(washable * rate.cut);
  const clean = washable - fee;
  bm.dirtyMoney -= washable;
  bm.washedTotal += clean;
  game.money += clean;
  game.toast(`Cuci $${washable} lewat Kilau Laundry: biaya $${fee}, bersih $${clean}.`);
  if (game.sound) game.sound.coin();
  return clean;
}

export function dealerTip(game) {
  const tips = [
    'Rook: "Hujan itu temanmu. Polisi buta saat hujan, harga pun turun."',
    'Zara: "Badai menaikkan harga jual. Berani antar saat petir menyambar?"',
    'Silencio: "Kabut menyembunyikanmu. Heat turun lebih cepat di kabut."',
    'Rook: "Stash cuma muat 40 bobot. Senjata berat — jangan serakah."',
    'Zara: "Reputasi membuka pintu: 25 untukku, 60 untuk Silencio."',
    'Silencio: "Uang kotor harus dicuci di laundry. Jangan belanja pakai uang kotor."',
    'Rook: "Run selundupan dibayar kotor semua. Siapkan rute kabur dulu."',
    'Zara: "Heat di atas 70 dan polisi datang sendiri. Dinginkan dulu."',
  ];
  const bm = game.blackmarket;
  const tip = tips[bm.tipIndex % tips.length];
  bm.tipIndex += 1;
  return tip;
}

export function blackMarketSummary(game) {
  const bm = game.blackmarket;
  const tier = repTier(bm.rep);
  return {
    rep: bm.rep,
    tier: tier.name,
    heat: Math.round(bm.heat),
    stash: `${stashWeight(bm)}/${STASH_CAPACITY}`,
    stashItems: stashCount(bm),
    stashValue: stashValue(bm),
    dirty: bm.dirtyMoney,
    washed: bm.washedTotal,
    deals: bm.dealsDone,
    runs: bm.runsDone,
    failed: bm.runsFailed,
    sold: bm.goodsSold,
    profit: bm.profitTotal,
    bestRun: bm.bestRunPayout,
  };
}

// Lines for the dealer panel (hud.js draws them). The panel lists the
// dealer's stock with live prices, the stash, and the keys that act.
export function dealerPanelLines(game, dealer) {
  const bm = game.blackmarket;
  const tier = repTier(bm.rep);
  const lines = [];
  lines.push(`${dealer.name} — ${dealer.title} (${dealer.district})`);
  lines.push(dealer.greeting);
  lines.push(`Reputasi: ${bm.rep} (${tier.name})  •  Heat pasar: ${Math.round(bm.heat)}/100  •  Uang kotor: $${bm.dirtyMoney.toLocaleString('en-US')}`);
  lines.push(`Stash: ${stashWeight(bm)}/${stashCapacity(game)} bobot, ${stashCount(bm)} barang, nilai jual ~$${stashValue(bm).toLocaleString('en-US')} (garage lv 2+ / Bruno +10)`);
  lines.push('');
  dealer.stock.forEach((id, i) => {
    const good = CONTRABAND[id];
    const have = bm.stash[id] || 0;
    lines.push(`${i + 1}. BELI ${good.name} — $${buyPrice(game, dealer, id)}  (jual $${sellPrice(game, dealer, id)}, bobot ${good.weight}, heat ${good.heat}) — stash: ${have}`);
  });
  lines.push(`${dealer.stock.length + 1}. JUAL SEMUA STASH di sini`);
  lines.push(`${dealer.stock.length + 2}. MULAI RUN SELUNDUPAN (antar stash ke dealer lain, dibayar kotor)`);
  lines.push(`${dealer.stock.length + 3}. CUCI UANG KOTOR di Kilau Laundry (butuh laundry milikmu)`);
  lines.push('');
  lines.push(dealerTip(game));
  return lines;
}

// Objective line for the HUD while a run or a deal is the focus.
export function blackMarketObjective(game) {
  const bm = game.blackmarket;
  if (bm.run) return `Run selundupan: ${bm.run.label} — ${Math.ceil(bm.run.timer)} dtk`;
  const dealer = nearestDealer(game, 500);
  if (dealer && isNight(game.sky)) return `Pasar gelap: ${dealer.name} di ${dealer.district} (G)`;
  if (bm.dirtyMoney > 0) return `Uang kotor $${bm.dirtyMoney} — cuci di Kilau Laundry`;
  return '';
}

// A random street rumour the HUD can show at night — flavour that also
// teaches the system without a tutorial screen.
export function streetRumour(game) {
  const pool = [
    'Kabar jalanan: Rook di pelabuhan jual Rempah Hitam murah malam ini.',
    'Kabar jalanan: Zara di Neon Mile cari Relik Kuno — harga jual naik.',
    'Kabar jalanan: Silencio muncul di Downtown. Hanya untuk yang punya nama.',
    'Kabar jalanan: polisi razia pelabuhan — heat naik lebih cepat di sana.',
    'Kabar jalanan: badai malam ini, harga jual selundupan naik.',
  ];
  return pick(game.rng, pool);
}

// Warna cahaya dealer di malam hari: ungu saat pasar buka, abu saat
// tutup (siang). Beacon misi memakai warna ini untuk target selundupan.
export function dealerGlowFor(game) {
  return isNight(game.sky) ? '#9b59b6' : '#7f8c8d';
}

// Dealer yang sedang "panas" (heat tinggi) berkedip merah di minimap.
export function dealerHot(game) {
  return game.blackmarket ? (game.blackmarket.heat || 0) > 60 : false;
}
