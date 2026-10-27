// Generator data dummy GreenMart (v1.0.2) — hasil: demo/greenmart-dummy.json
// Realistis seperti kondisi asli:
//   - Sabtu & Minggu LIBUR (koperasi sekolah tutup) → tanpa transaksi/absensi
//   - Hari libur nasional & cuti bersama resmi (SKB 2025/2026) → tanpa transaksi/absensi
//   - Pola jam ramai: pagi 07:00-07:30, jam istirahat 09:30-10:00 & 12:00-13:00, pulang 15:00-16:00
//   - Hari ini hanya transaksi sampai jam sekarang
// Jalankan ulang kapan pun untuk menyegarkan tanggal: node scripts/gen-dummy-data.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SEED = 20261028;
let s = SEED >>> 0;
function rnd() {
  // mulberry32 — deterministic
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const rint = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---------- Hari libur nasional & cuti bersama (SKB) ----------
const HOLIDAYS = {
  // 2025
  '2025-01-01': 'Tahun Baru Masehi', '2025-01-27': 'Tahun Baru Imlek', '2025-01-28': 'Cuti Bersama Imlek',
  '2025-03-29': 'Hari Suci Nyepi', '2025-03-31': 'Idul Fitri 1446 H', '2025-04-01': 'Idul Fitri 1446 H',
  '2025-04-02': 'Cuti Bersama Idul Fitri', '2025-04-03': 'Cuti Bersama Idul Fitri',
  '2025-04-18': 'Wafat Isa Almasih', '2025-05-01': 'Hari Buruh', '2025-05-12': 'Hari Waisak',
  '2025-05-13': 'Cuti Bersama Waisak', '2025-06-01': 'Hari Lahir Pancasila',
  '2025-06-06': 'Idul Adha 1446 H', '2025-06-09': 'Cuti Bersama Idul Adha',
  '2025-06-26': 'Tahun Baru Islam 1447 H', '2025-06-27': 'Cuti Bersama Tahun Baru Islam',
  '2025-08-17': 'Hari Kemerdekaan RI', '2025-09-05': 'Maulid Nabi Muhammad SAW', '2025-12-25': 'Hari Raya Natal',
  // 2026 (SKB resmi)
  '2026-01-01': 'Tahun Baru Masehi', '2026-01-16': 'Isra Mikraj Nabi Muhammad SAW',
  '2026-02-16': 'Cuti Bersama Tahun Baru Imlek', '2026-02-17': 'Tahun Baru Imlek 2577',
  '2026-03-18': 'Cuti Bersama Hari Suci Nyepi', '2026-03-19': 'Hari Suci Nyepi (Tahun Baru Saka)',
  '2026-03-20': 'Cuti Bersama Idul Fitri', '2026-03-21': 'Idul Fitri 1447 H', '2026-03-22': 'Idul Fitri 1447 H',
  '2026-03-23': 'Cuti Bersama Idul Fitri', '2026-03-24': 'Cuti Bersama Idul Fitri',
  '2026-04-03': 'Wafat Isa Almasih', '2026-05-01': 'Hari Buruh Internasional',
  '2026-05-14': 'Kenaikan Isa Almasih', '2026-05-15': 'Cuti Bersama Kenaikan Isa Almasih',
  '2026-05-27': 'Idul Adha 1447 H', '2026-05-28': 'Cuti Bersama Idul Adha', '2026-05-31': 'Hari Raya Waisak',
  '2026-06-01': 'Hari Lahir Pancasila', '2026-06-16': 'Tahun Baru Islam 1448 H',
  '2026-08-17': 'Hari Kemerdekaan RI', '2026-08-25': 'Maulid Nabi Muhammad SAW',
  '2026-12-24': 'Cuti Bersama Hari Raya Natal', '2026-12-25': 'Hari Raya Natal',
};

// ---------- Produk kantin sekolah ----------
const PRODUCTS = [
  { barcode: '8992761110017', name: 'Aqua Botol 600ml', price: 3000, category: 'Minuman', init: 120 },
  { barcode: '8992761110024', name: 'Aqua Gelas 240ml', price: 1000, category: 'Minuman', init: 240 },
  { barcode: '8998009090011', name: 'Teh Pucuk 350ml', price: 4000, category: 'Minuman', init: 96 },
  { barcode: '8993175530011', name: 'Sprite 390ml', price: 5000, category: 'Minuman', init: 60 },
  { barcode: '8992696403016', name: 'Ultra Milk Coklat 250ml', price: 5500, category: 'Minuman', init: 72 },
  { barcode: '8991102000018', name: 'Kopi Kapal Api Special', price: 2000, category: 'Minuman', init: 90 },
  { barcode: '8998866200011', name: 'Chiki Jagung Bakar', price: 2500, category: 'Makanan', init: 100 },
  { barcode: '8992388101010', name: 'Chitato Sapi Panggang', price: 8000, category: 'Makanan', init: 60 },
  { barcode: '8998103200019', name: 'Roti Tawar Kupas', price: 12000, category: 'Makanan', init: 30 },
  { barcode: '8998989101017', name: 'Bolu Kukus Merah', price: 3500, category: 'Makanan', init: 48 },
  { barcode: '8997035640016', name: 'Mi Soto Instan', price: 3500, category: 'Makanan', init: 80 },
  { barcode: '8886008101013', name: 'Wafer Tango', price: 3000, category: 'Makanan', init: 70 },
  { barcode: '101', name: 'Rinso Sachet (kode manual)', price: 1500, category: 'Lainnya', init: 60 },
  { barcode: '102', name: 'Sabun Mandi Sachet', price: 1000, category: 'Lainnya', init: 80 },
  { barcode: '103', name: 'Pulpen Standard AE7', price: 3000, category: 'Alat Tulis', init: 100 },
  { barcode: '104', name: 'Buku Tulis 38 Lbr', price: 4000, category: 'Alat Tulis', init: 120 },
  { barcode: '105', name: 'Pensil 2B Faber', price: 2500, category: 'Alat Tulis', init: 90 },
  { barcode: '106', name: 'Penghapus & Rautan', price: 3000, category: 'Alat Tulis', init: 70 },
];

// ---------- Siswa ----------
const STUDENTS = [
  { class_name: 'XI TKJ 1', nis: '2601', nisn: '0061234501', name: 'AIDA ZULFA KHASNA', gender: 'P' },
  { class_name: 'XI TKJ 1', nis: '2602', nisn: '0061234502', name: 'BAYU SETIAWAN', gender: 'L' },
  { class_name: 'XI TKJ 1', nis: '2603', nisn: '0061234503', name: 'CITRA AYU LESTARI', gender: 'P' },
  { class_name: 'XI TKJ 1', nis: '2604', nisn: '0061234504', name: 'DIMAS PRASETYO', gender: 'L' },
  { class_name: 'XI TKJ 1', nis: '2605', nisn: '0061234505', name: 'EKA PUTRI MAHARANI', gender: 'P' },
  { class_name: 'XI TKJ 2', nis: '2606', nisn: '0061234506', name: 'FIRMAN NUGRAHA', gender: 'L' },
  { class_name: 'XI TKJ 2', nis: '2607', nisn: '0061234507', name: 'GITA RAMADHANI', gender: 'P' },
  { class_name: 'XI TKJ 2', nis: '2608', nisn: '0061234508', name: 'HENDRA KUSUMA', gender: 'L' },
  { class_name: 'XI TKJ 2', nis: '2609', nisn: '0061234509', name: 'INTAN PERMATA SARI', gender: 'P' },
  { class_name: 'XI TKJ 2', nis: '2610', nisn: '0061234510', name: 'JOKO PRASETYO', gender: 'L' },
  { class_name: 'XI BDP 1', nis: '2611', nisn: '0061234511', name: 'KARTIKA DEWI', gender: 'P' },
  { class_name: 'XI BDP 1', nis: '2612', nisn: '0061234512', name: 'LUTFI HAKIM', gender: 'L' },
];

// ---------- Rentang: 75 hari terakhir (agar 17 Agustus & Maulid Nabi ikut) ----------
const DAYS = 75;
const today = new Date();
const start = new Date(today);
start.setDate(start.getDate() - (DAYS - 1));

const soldTotal = new Map(); // barcode -> total terjual selama window
for (const p of PRODUCTS) {
  soldTotal.set(p.barcode, 0);
}

const attendance = [];
const transactions = [];
const seqByDate = new Map();

function addAttendance(date, nisn, time) {
  attendance.push({ nisn, date, time });
}

function addTransaction(date, hour, minute) {
  const t = `${pad(hour)}:${pad(minute)}`;
  const nItems = rnd() < 0.45 ? 1 : rnd() < 0.8 ? 2 : 3;
  const chosen = new Set();
  while (chosen.size < nItems) chosen.add(pick(PRODUCTS));
  const items = [...chosen].map((p) => ({ barcode: p.barcode, qty: rnd() < 0.7 ? 1 : 2 }));
  for (const it of items) {
    soldTotal.set(it.barcode, soldTotal.get(it.barcode) + it.qty);
  }
  transactions.push({ id: crypto.randomUUID(), date, time: t, items });
}

// Jam ramai kantin: datang pagi, istirahat pagi, istirahat siang, pulang sekolah.
const RUSH_HOURS = [7, 7, 9, 9, 10, 12, 12, 12, 13, 13, 15, 15, 16];

for (let i = 0; i < DAYS; i++) {
  const d = new Date(start);
  d.setDate(d.getDate() + i);
  const date = ymd(d);
  const dow = d.getDay(); // 0=Minggu, 6=Sabtu
  const holiday = HOLIDAYS[date];
  if (dow === 0 || dow === 6 || holiday) continue; // LIBUR — tanpa aktivitas

  // Petugas jaga hari itu: 2-3 siswa absen pagi (rotasi deterministik + acak sedikit)
  const dutyCount = rint(2, 3);
  const base = (i * 5) % STUDENTS.length;
  const used = new Set();
  for (let k = 0; k < dutyCount; k++) {
    const s = STUDENTS[(base + k * 4 + rint(0, 1)) % STUDENTS.length];
    if (used.has(s.nisn)) continue;
    used.add(s.nisn);
    addAttendance(date, s.nisn, `06:${pad(rint(40, 59))}`);
  }

  // Jumlah transaksi: 2-6 per hari sekolah
  const nTrx = rint(2, 6);
  for (let k = 0; k < nTrx; k++) {
    let hour = pick(RUSH_HOURS);
    let minute = rint(0, 59);
    if (i === DAYS - 1) {
      // Hari ini: hanya waktu yang sudah lewat
      const nowMin = today.getHours() * 60 + today.getMinutes();
      if (hour * 60 + minute > nowMin) {
        hour = Math.min(7, today.getHours());
        minute = rint(0, Math.max(0, today.getMinutes()));
        if (hour * 60 + minute > nowMin) continue;
      }
    }
    addTransaction(date, hour, minute);
  }
}

// ---------- Opname: 2 sesi selesai (kebetulan hari sekolah) ----------
function shiftToOpenDay(daysAgo) {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  while (d.getDay() === 0 || d.getDay() === 6 || HOLIDAYS[ymd(d)]) d.setDate(d.getDate() - 1);
  return ymd(d);
}

const opnames = [
  { date: shiftToOpenDay(42), phase: 'awal' },
  { date: shiftToOpenDay(13), phase: 'akhir' },
].map(({ date, phase }) => {
  const attendees = attendance.filter((a) => a.date === date).map((a) => STUDENTS.find((s) => s.nisn === a.nisn).name);
  return {
    date,
    phase,
    petugas: attendees.join(', ') || 'Petugas Jaga',
    items: PRODUCTS.map((p) => {
      const finalStock = Math.max(5, p.init - soldTotal.get(p.barcode));
      // Stok sistem saat opname (eksak) = stok akhir + SEMUA penjualan SETELAH momen opname.
      // Opname dilakukan 08:00 → penjualan di hari opname sendiri dihitung hanya bila jam >= 08:00.
      let soldAfterOpname = 0;
      for (const t of transactions) {
        if (t.date > date || (t.date === date && t.time >= '08:00')) {
          for (const it of t.items) {
            if (it.barcode === p.barcode) soldAfterOpname += it.qty;
          }
        }
      }
      const system = finalStock + soldAfterOpname;
      const diff = rnd() < 0.6 ? 0 : rint(-2, 2);
      return { barcode: p.barcode, system, physical: Math.max(0, system + diff) };
    }),
  };
});

// ---------- Produk: stok akhir ----------
const products = PRODUCTS.map((p) => ({
  barcode: p.barcode,
  name: p.name,
  price: p.price,
  stock: Math.max(5, p.init - soldTotal.get(p.barcode)),
  category: p.category,
}));

const holidaysInWindow = Object.entries(HOLIDAYS)
  .filter(([date]) => date >= ymd(start) && date <= ymd(today))
  .map(([date, name]) => ({ date, name }));

const bundle = {
  format: 'greenmart-dummy',
  version: 1,
  generated_at: new Date().toISOString(),
  window: { start: ymd(start), end: ymd(today) },
  holidays: holidaysInWindow,
  categories: ['Makanan', 'Minuman', 'Alat Tulis', 'Lainnya'],
  products,
  students: STUDENTS,
  attendance,
  transactions,
  opnames,
};

const outDir = path.join(__dirname, '..', 'demo');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'greenmart-dummy.json');
fs.writeFileSync(out, JSON.stringify(bundle, null, 2), 'utf8');

const openDays = DAYS - Object.keys(holidaysInWindow).length; // ± (weekend libur juga)
console.log(`Data dummy ditulis: ${out}`);
console.log(`Window      : ${bundle.window.start} s.d. ${bundle.window.end} (${DAYS} hari kalender)`);
console.log(`Libur       : ${holidaysInWindow.length} hari libur/cutu bersama + semua Sabtu/Minggu`);
console.log(`Transaksi   : ${transactions.length}`);
console.log(`Absensi     : ${attendance.length}`);
console.log(`Produk/Siswa: ${products.length}/${STUDENTS.length}`);
