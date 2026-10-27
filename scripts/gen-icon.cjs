// Generator ikon GreenMart — PNG murni via zlib (tanpa dependensi).
// Menghasilkan: resources/icon.png (512), resources/icon.ico, resources/icons/*.png
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// ---------- PNG encoder ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // scanline filter 0 tiap baris
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function encodeIco(pngBuffers) {
  // ICO dengan ikon PNG ter-embed (Vista+)
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + 16 * count;
  for (const { size, data } of pngBuffers) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[4] = 1;
    e[6] = 32;
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.data)]);
}

// ---------- Desain ikon: kotak hijau rounded + label/barcode putih ----------
// warna
const BG = [21, 122, 74, 255]; // hijau GreenMart
const BG_DARK = [13, 92, 54, 255];
const WHITE = [255, 255, 255, 255];
const TRANSPARENT = [0, 0, 0, 0];

function insideRoundedRect(x, y, size, r) {
  const m = size - r;
  const cx = x < r ? r : x > m ? m : x;
  const cy = y < r ? r : y > m ? m : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r || (x >= r && x <= m) || (y >= r && y <= m);
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, c) => {
    const i = (y * size + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = c[3];
  };
  const s = size;
  const r = Math.round(s * 0.18);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (insideRoundedRect(x, y, s, r)) {
        // gradien diagonal halus
        const t = (x + y) / (2 * s);
        const c = [
          Math.round(BG[0] + (BG_DARK[0] - BG[0]) * t * 0.6),
          Math.round(BG[1] + (BG_DARK[1] - BG[1]) * t * 0.6),
          Math.round(BG[2] + (BG_DARK[2] - BG[2]) * t * 0.6),
          255,
        ];
        set(x, y, c);
      } else set(x, y, TRANSPARENT);
    }
  }
  // "label harga": panel putih rounded di tengah + garis barcode
  const panel = { x0: Math.round(s * 0.2), y0: Math.round(s * 0.24), x1: Math.round(s * 0.8), y1: Math.round(s * 0.76) };
  const pr = Math.round(s * 0.06);
  for (let y = panel.y0; y <= panel.y1; y++) {
    for (let x = panel.x0; x <= panel.x1; x++) {
      if (insideRoundedRect(x - panel.x0, y - panel.y0, panel.x1 - panel.x0, pr)) set(x, y, WHITE);
    }
  }
  // garis barcode (hitam di atas panel putih) + dua strip hijau di atas
  const barTop = Math.round(s * 0.36);
  const barBot = Math.round(s * 0.62);
  const bars = [0.3, 0.34, 0.38, 0.45, 0.5, 0.56, 0.6, 0.66, 0.7];
  const black = [20, 48, 32, 255];
  for (let y = barTop; y <= barBot; y++) {
    for (const b of bars) {
      const x = Math.round(s * b);
      if (x >= panel.x0 + 2 && x <= panel.x1 - 2) {
        set(x, y, black);
        if (x + 1 <= panel.x1 - 2) set(x + 1, y, black);
      }
    }
  }
  // strip "nama produk" hijau di atas & bawah barcode (di panel putih)
  const stripTop = Math.round(s * 0.3);
  for (let y = stripTop; y < barTop - Math.round(s * 0.02); y++) {
    for (let x = Math.round(s * 0.3); x <= Math.round(s * 0.7); x++) set(x, y, BG);
  }
  const stripBot = Math.round(s * 0.68);
  for (let y = barBot + Math.round(s * 0.02); y <= stripBot; y++) {
    for (let x = Math.round(s * 0.3); x <= Math.round(s * 0.58); x++) set(x, y, BG);
  }
  return encodePng(size, size, px);
}

const outDir = path.join(__dirname, '..', 'resources');
fs.mkdirSync(path.join(outDir, 'icons'), { recursive: true });

const sizes = [16, 32, 48, 64, 128, 256, 512];
const pngs = new Map();
for (const size of sizes) pngs.set(size, drawIcon(size));

fs.writeFileSync(path.join(outDir, 'icon.png'), pngs.get(512));
fs.writeFileSync(path.join(outDir, 'icon.ico'), encodeIco([256, 64, 48, 32, 16].map((s) => ({ size: s, data: pngs.get(s) }))));
for (const size of sizes) fs.writeFileSync(path.join(outDir, 'icons', `${size}x${size}.png`), pngs.get(size));
console.log('Ikon dibuat di resources/ (icon.png, icon.ico, icons/*.png)');
