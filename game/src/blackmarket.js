// Pasar gelap Port Aurelia: tiga dealer yang hanya bekerja setelah
// gelap, lima macam barang selundupan, stash yang polisi ingin sekali
// menemukan, dan reputasi yang membuka harga lebih baik makin dalam kau
// masuk. Pasar ini adalah ekonomi malam yang menumpang di atas empire
// legal: beli murah dari satu dealer, antar barangnya lintas kota
// sebelum heat mengejarmu, jual mahal ke dealer berikutnya, lalu cuci
// uang kotornya lewat laundry milikmu. Tidak ada yang legal di sini,
// dan game tidak pernah berpura-pura — tiap transaksi menaikkan heat,
// dan heat memanggil interceptor.
//
// Ditulis ulang round 4b: pengali harga cuaca, laju pendinginan heat,
// dan tarif cuci kini tabel data; syarat berdagang kini daftar cek
// berurutan; dan pembagian uang kotor/bersih (10% bersih di tempat)
// dipusatkan ke satu helper supaya beli dan jual tidak lagi menulis
// rumus yang sama dua kali.

import { isNight, weatherNow } from './sky.js';
import { clamp, pick } from './rng.js';
import { addWanted } from './law.js';
import { stashCapacity } from './empire.js';

// ---- Barang: apa yang bergerak lewat gang setelah gelap. ----
// buy adalah harga yang dipatok dealer padamu, sell adalah yang dibayar
// dealer lain. weight menentukan seberapa banyak yang muat di stash;
// heat adalah seberapa besar perhatian yang ditarik satu unit barang
// saat polisi menggeledah sebuah run.
export const CONTRABAND = {
  spice: { id: 'spice', name: 'Rempah Hitam', buy: 140, sell: 230, weight: 1, heat: 1, blurb: 'Bumbu pelabuhan yang dilarang beredar.' },
  chips: { id: 'chips', name: 'Chip Curian', buy: 320, sell: 520, weight: 2, heat: 2, blurb: 'Chip kasino yang "jatuh" dari truk.' },
  relic: { id: 'relic', name: 'Relik Kuno', buy: 700, sell: 1150, weight: 3, heat: 3, blurb: 'Patung kecil dari kapal karam.' },
  meds: { id: 'meds', name: 'Obat Langka', buy: 260, sell: 430, weight: 1, heat: 1, blurb: 'Obat rumah sakit yang tidak tercatat.' },
  arms: { id: 'arms', name: 'Senjata Selundupan', buy: 900, sell: 1500, weight: 4, heat: 4, blurb: 'Kotak amunisi tanpa nomor seri.' },
};

export const GOODS_ORDER = ['spice', 'chips', 'meds', 'relic', 'arms'];

// ---- Dealer: tempat tetap, watak tetap, harga bergerak. ----
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

// Tier reputasi tertinggi yang sudah dicapai angka rep ini.
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
    heat: 0, // 0..100, mendingin pelan; di 70+ polisi memburu run
    dealsDone: 0,
    runsDone: 0,
    runsFailed: 0,
    goodsSold: 0,
    profitTotal: 0,
    bestRunPayout: 0,
    dealerMet: {},
    run: null, // run selundupan aktif (dimiliki smuggling.js)
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

// ---- Isi stash: bobot, nilai jual, dan jumlah barang. ----
// Satu penjumlahan generik: tiap metrik hanya memilih apa yang
// dijumlah dari tiap barang di stash.
function sumStash(bm, pickValue) {
  let total = 0;
  for (const id of GOODS_ORDER) total += pickValue(bm.stash[id] || 0, CONTRABAND[id]);
  return total;
}

export function stashWeight(bm) {
  return sumStash(bm, (count, good) => count * good.weight);
}

export function stashValue(bm) {
  return sumStash(bm, (count, good) => count * good.sell);
}

export function stashCount(bm) {
  return sumStash(bm, (count) => count);
}

// ---- Harga: reputasi, cuaca, dan jam malam menggerakkannya. ----
// Hujan menyembunyikan transaksi (lebih murah), badai membuat semua
// orang gugup (lebih mahal), dan reputasi bagus adalah diskon tetap.
const BUY_WEATHER_MULT = { rain: 0.94, storm: 1.1, fog: 0.97 };
const SELL_WEATHER_MULT = { storm: 1.12 };
const NIGHT_SELL_BONUS = 1.05;

function applyWeather(price, table, weather) {
  const mult = table[weather];
  return mult === undefined ? price : price * mult;
}

export function buyPrice(game, dealer, goodId) {
  const good = CONTRABAND[goodId];
  if (!good) return 0;
  const tier = repTier(game.blackmarket.rep);
  let price = good.buy * dealer.markup;
  price *= 1 - tier.bonus;
  price = applyWeather(price, BUY_WEATHER_MULT, game.sky.weather);
  return Math.max(20, Math.round(price));
}

export function sellPrice(game, dealer, goodId) {
  const good = CONTRABAND[goodId];
  if (!good) return 0;
  const tier = repTier(game.blackmarket.rep);
  let price = good.sell;
  price *= 1 + tier.bonus;
  price = applyWeather(price, SELL_WEATHER_MULT, game.sky.weather);
  if (isNight(game.sky)) price *= NIGHT_SELL_BONUS;
  return Math.max(20, Math.round(price));
}

// Apakah dealer ini mau berdagang sekarang, dan bila tidak, kenapa.
// Daftar cek berurutan: yang pertama gagal yang menjawab.
const DEAL_CHECKS = [
  { test: (game, dealer) => !dealer, why: () => 'Tidak ada dealer di dekatmu.' },
  {
    test: (game) => !isNight(game.sky),
    why: (game, dealer) => `${dealer.name} hanya berdagang setelah gelap (19:00–06:00).`,
  },
  {
    test: (game, dealer) => game.blackmarket.rep < dealer.repNeeded,
    why: (game, dealer) => `${dealer.name} butuh reputasi ${dealer.repNeeded}. Reputasimu ${game.blackmarket.rep}.`,
  },
  {
    test: (game) => !!game.blackmarket.run,
    why: () => 'Selesaikan dulu run selundupan yang sedang berjalan.',
  },
];

export function canDeal(game, dealer) {
  for (const check of DEAL_CHECKS) {
    if (check.test(game, dealer)) return { ok: false, why: check.why(game, dealer) };
  }
  return { ok: true, why: '' };
}

// ---- Heat dan reputasi: dua mata uang jalanan. ----

export function addHeat(game, amount, reason) {
  const bm = game.blackmarket;
  bm.heat = clamp(bm.heat + amount, 0, 100);
  if (bm.heat >= 70 && game.wanted < 2) addWanted(game, 1, reason || 'Pasar gelap memanas');
  return bm.heat;
}

// Laju pendinginan heat per cuaca — kabut dan hujan menutupi jejak,
// badai mengalihkan perhatian polisi, cerah paling lambat.
const HEAT_COOL_RATES = { clear: 0.35, fog: 0.8, rain: 0.6, storm: 0.7 };

export function decayHeat(game, dt) {
  const bm = game.blackmarket;
  if (bm.heat <= 0) return;
  // Heat mendingin sendiri pelan-pelan, lebih cepat saat kabut dan
  // hujan ketika polisi tidak bisa melihat jauh — dan lebih cepat lagi
  // saat kau diam tidak berulah.
  let rate = HEAT_COOL_RATES[game.sky.weather] ?? 0.35;
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

// ---- Jual-beli. ----

// Penjualan dibayar uang kotor: harus dicuci dulu sebelum aman.
// Sedikit bagian bersih langsung di tempat (uang saku dealer sendiri).
function settleSalePayment(game, total) {
  const bm = game.blackmarket;
  const cleanCut = Math.round(total * 0.1);
  bm.dirtyMoney += total - cleanCut;
  game.money += cleanCut;
  return cleanCut;
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
  const cleanCut = settleSalePayment(game, price);
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
  const cleanCut = settleSalePayment(game, total);
  bm.goodsSold += sold;
  bm.profitTotal += total;
  gainRep(game, 3, '');
  addHeat(game, 6, 'Penjualan besar terlacak');
  game.toast(`Stash ludes: ${sold} barang terjual $${total}. Kotor $${total - cleanCut} menunggu dicuci.`);
  if (game.sound) game.sound.coin();
  return true;
}

// ---- Cuci uang: hanya laundry milikmu yang bisa membersihkan uang
// kotor, dan ia memotong fee. Makin tinggi level laundry, makin kecil
// potongan dan makin besar cap cucian malam. Dipanggil dari panel
// dealer (tombol angka) dan dari tick jam empire.
const WASH_TIERS = [
  { cut: 0.35, cap: 800 },
  { cut: 0.35, cap: 800 },
  { cut: 0.25, cap: 2000 },
  { cut: 0.15, cap: 5000 },
];

export function washRate(game) {
  const laundry = game.empire.props.laundry;
  if (!laundry || !laundry.owned) return null;
  return WASH_TIERS[laundry.level] || WASH_TIERS[1];
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

// ---- Suara jalanan: tips bergilir dan kabar yang mengajari sistem. ----

const DEALER_TIPS = [
  'Rook: "Hujan itu temanmu. Polisi buta saat hujan, harga pun turun."',
  'Zara: "Badai menaikkan harga jual. Berani antar saat petir menyambar?"',
  'Silencio: "Kabut menyembunyikanmu. Heat turun lebih cepat di kabut."',
  'Rook: "Stash cuma muat 40 bobot. Senjata berat — jangan serakah."',
  'Zara: "Reputasi membuka pintu: 25 untukku, 60 untuk Silencio."',
  'Silencio: "Uang kotor harus dicuci di laundry. Jangan belanja pakai uang kotor."',
  'Rook: "Run selundupan dibayar kotor semua. Siapkan rute kabur dulu."',
  'Zara: "Heat di atas 70 dan polisi datang sendiri. Dinginkan dulu."',
];

export function dealerTip(game) {
  const bm = game.blackmarket;
  const tip = DEALER_TIPS[bm.tipIndex % DEALER_TIPS.length];
  bm.tipIndex += 1;
  return tip;
}

const RUMOUR_POOL = [
  'Kabar jalanan: Rook di pelabuhan jual Rempah Hitam murah malam ini.',
  'Kabar jalanan: Zara di Neon Mile cari Relik Kuno — harga jual naik.',
  'Kabar jalanan: Silencio muncul di Downtown. Hanya untuk yang punya nama.',
  'Kabar jalanan: polisi razia pelabuhan — heat naik lebih cepat di sana.',
  'Kabar jalanan: badai malam ini, harga jual selundupan naik.',
];

// Kabar jalanan acak yang bisa ditampilkan HUD di malam hari — flavour
// yang sekaligus mengajari sistem tanpa layar tutorial.
export function streetRumour(game) {
  return pick(game.rng, RUMOUR_POOL);
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

// Baris-baris untuk panel dealer (yang digambar hud.js). Panel
// menampilkan stok dealer dengan harga live, isi stash, dan tombol
// yang bisa ditekan.
export function dealerPanelLines(game, dealer) {
  const bm = game.blackmarket;
  const tier = repTier(bm.rep);
  const stockLines = dealer.stock.map((id, i) => {
    const good = CONTRABAND[id];
    const have = bm.stash[id] || 0;
    return `${i + 1}. BELI ${good.name} — $${buyPrice(game, dealer, id)}  (jual $${sellPrice(game, dealer, id)}, bobot ${good.weight}, heat ${good.heat}) — stash: ${have}`;
  });
  const n = dealer.stock.length;
  return [
    `${dealer.name} — ${dealer.title} (${dealer.district})`,
    dealer.greeting,
    `Reputasi: ${bm.rep} (${tier.name})  •  Heat pasar: ${Math.round(bm.heat)}/100  •  Uang kotor: $${bm.dirtyMoney.toLocaleString('en-US')}`,
    `Stash: ${stashWeight(bm)}/${stashCapacity(game)} bobot, ${stashCount(bm)} barang, nilai jual ~$${stashValue(bm).toLocaleString('en-US')} (garage lv 2+ / Bruno +10)`,
    '',
    ...stockLines,
    `${n + 1}. JUAL SEMUA STASH di sini`,
    `${n + 2}. MULAI RUN SELUNDUPAN (antar stash ke dealer lain, dibayar kotor)`,
    `${n + 3}. CUCI UANG KOTOR di Kilau Laundry (butuh laundry milikmu)`,
    '',
    dealerTip(game),
  ];
}

// Baris objektif untuk HUD saat run atau transaksi menjadi fokus.
export function blackMarketObjective(game) {
  const bm = game.blackmarket;
  if (bm.run) return `Run selundupan: ${bm.run.label} — ${Math.ceil(bm.run.timer)} dtk`;
  const dealer = nearestDealer(game, 500);
  if (dealer && isNight(game.sky)) return `Pasar gelap: ${dealer.name} di ${dealer.district} (G)`;
  if (bm.dirtyMoney > 0) return `Uang kotor $${bm.dirtyMoney} — cuci di Kilau Laundry`;
  return '';
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
