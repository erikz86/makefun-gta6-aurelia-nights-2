# Aurelia Nights II — Empire of the Storm

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)

Entry kedua untuk bounty [Make GTA 6 (gta6-01)](https://make.fun/bounty/gta6-01) di make.fun — sekuel yang dibangun dari nol dengan sistem baru yang substansial, bukan salinan entry pertama.

**Aurelia Nights II** adalah game open-world crime 2D top-down yang berjalan penuh offline di browser desktop, tanpa build step dan tanpa request network. Setahun setelah perampokan Bank Aurelia, **Kai "Kancil"** kembali — kali ini bukan untuk satu pekerjaan, tapi untuk memiliki kotanya.

Kota, nama, karakter, kendaraan, cerita, art dan suara semuanya orisinal — tidak ada apa pun dari seri game komersial mana pun.

## Yang baru di sekuel ini

- **Siklus siang-malam & cuaca** — jam kota berjalan 24 jam; hujan membuat jalan licin (grip turun), badai memangkas jarak pandang polisi dan menyambar petir, kabut menyembunyikanmu dari kejaran. Malam membayar heist 25% lebih mahal dan membuka balapan jalanan.
- **Empire properti** — beli 4 bisnis (Bengkel Roda Gila, Warung Senja, Kelab Neon Tide, Kilau Laundry), upgrade sampai level 3, dan terima penghasilan tiap jam game. Kelab malam menghasilkan dua kali lipat setelah gelap.
- **Kru & heist terencana** — rekrut Lena Voss (pembalap), Otto Kran (hacker), dan Bruno Halden (otot). Tiga heist di papan loteng: Permata Row, Konvoi Besi, dan Grand Vault — masing-masing dengan prep, eksekusi bertahap, dan potongan kru.
- **Distrik baru** — Pelabuhan Tua dengan lapangan kontainer, Neon Mile, Bukit Villa, dan Downtown; peta lebih besar dari game pertama.
- **Senjata baru** — Shotgun dan SMG di toko Ironworks, selain pistol.
- **Kerja sampingan** — taksi, antar paket, dan balapan malam.
- **Pasar Gelap (night economy)** — tiga dealer yang hanya berdagang setelah gelap: Rook di Pelabuhan Tua (rep 0), Madame Zara di Neon Mile (rep 25), El Silencio di Downtown (rep 60). Lima barang selundupan (Rempah Hitam, Chip Curian, Obat Langka, Relik Kuno, Senjata Selundupan) dengan harga yang bergerak mengikuti reputasi, cuaca (hujan lebih murah, badai lebih mahal), dan jam malam.
  - **Stash & heat**: barang menumpuk di stash (40 bobot; +10 dari garage level 2+, +10 dari Bruno). Setiap transaksi menaikkan heat pasar (0–100); heat ≥70 memanggil patroli sendiri, ≥85 saat run memanggil interceptor. Heat mendingin lebih cepat saat kabut/hujan dan saat wanted 0; Otto mempercepat pendinginan 25%.
  - **Run selundupan (G di dealer → mulai run)**: antar isi stash ke dealer lain lintas kota melewati 3 checkpoint sebelum timer habis. Bayaran 1,35x nilai stash sebagai uang kotor (+25% saat badai, +15% bila selesai cepat, +10% bila Lena direkrut). Nyaris ketangkap polisi = +reputasi. Gagal (waktu habis / busted / wasted) = run hangus, barang tetap di stash.
  - **Cuci uang**: uang kotor hanya bisa dipakai setelah dicuci di Kilau Laundry milikmu (potongan 35%/25%/15% di level 1/2/3, cap $800/$2.000/$5.000; laundry juga mencuci seperempat cap setiap jam otomatis). Jual di dealer membayar 10% bersih di tempat, sisanya kotor.
  - **Lainnya**: van selundupan hitam (top 610, nitro 3x via Shift) parkir di pelabuhan; amunisi selundupan dari panel dealer (J/K/L); suap polisi Y = -$400, -1 bintang; lookout dealer berdiri di tiap sudut dealer saat malam.
  - Cara main cepat: malam hari → datangi Rook di pelabuhan (520, 2420) → tekan G/E → beli Rempah (1) → tekan 5 untuk mulai run → ikuti berlian ungu di peta → drop-off merah → cuci uang di laundry.
- **6 misi cerita baru** — dari membeli bengkel pertama sampai membobol brankas kasino di tengah badai.

## Yang tetap ada

- **Kota terbuka** — jalan kaki & mengemudi, kamera mengikuti pemain.
- **Curi mobil** — mobil parkir dan lalu lintas bisa dibajak (dan polisi akan memperhatikan).
- **Traffic & pejalan kaki** — mobil AI mengikuti grid jalan; pejalan kaki kabur saat ada tembakan; jumlahnya mengikuti cuaca dan jam.
- **Wanted level 0–5 bintang** — mobil polisi mengejar dengan sirene; tertangkap berarti **BUSTED**, nyawa habis berarti **WASTED**.
- **Combat** — pukul (`Spasi`) dan tembak (klik mouse untuk membidik).
- **HUD lengkap** — uang, nyawa, amunisi, bintang wanted, jam kota + cuaca, teks objektif misi, dialog, dan **minimap** live.
- **Suara sintetis** — mesin mobil, sirene, tembakan, hujan, dan guntur dibuat dengan WebAudio; tanpa file audio eksternal.
- **Start screen, pause, game over, dan save** — progres tersimpan otomatis di `localStorage`.

## Cara main

| Kontrol | Aksi |
| --- | --- |
| `W A S D` / panah | Jalan / gas, rem & belok saat mengemudi |
| `E` | Masuk / keluar mobil, rekrut kru, interaksi |
| `Spasi` | Pukul (saat jalan kaki) |
| Klik mouse | Tembak ke arah kursor |
| `1 / 2 / 3` | Ganti senjata |
| `B` | Panel bisnis (beli / upgrade properti) |
| `H` (di safehouse) | Papan heist |
| `F` | Mulai misi berikutnya / ambil kerja sampingan |
| `P` / `Esc` | Jeda (otomatis simpan) |
| `M` | Suara hidup/mati |
| `N` (di title) | Permainan baru |
| `R` (saat jeda) | Muat save terakhir |
| `Enter` / klik | Mulai / main lagi |

## Cara jalanin lokal

```bash
node serve.ts
# buka http://localhost:8080
```

Tidak ada dependensi dan tidak ada build step: `game/index.html` + ES modules di `game/src/` saja. Screenshot deterministik bisa diambil dengan `?shot=start|heist|empire|storm&seed=7`.

## Struktur source

```
game/
  index.html          # halaman game
  src/
    tuning.js         # semua angka balance: harga, penghasilan, cuaca
    rng.js            # RNG seeded (kota & traffic deterministik)
    world.js          # generasi kota 5 distrik + tabrakan
    sky.js            # siklus siang-malam & cuaca
    controls.js       # keyboard + mouse (+ autopilot screenshot)
    sound.js          # suara sintetis WebAudio (hujan, guntur, sirene)
    vehicles.js       # fisika mobil + grip cuaca
    traffic.js        # traffic AI & pejalan kaki
    law.js            # wanted level & polisi
    combat.js         # senjata & tembakan
    empire.js         # properti, bisnis & penghasilan per jam
    crew.js           # kru & heist (potongan, payout)
    story.js          # 6 misi cerita + kerja sampingan
    hud.js            # HUD, minimap & semua panel
    render.js         # gambar dunia, cahaya malam, hujan & kabut
    shots.js          # 4 scene screenshot deterministik
    engine.js         # state game, loop & semua interaksi
```
