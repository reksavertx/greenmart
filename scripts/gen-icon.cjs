// Konversi logo sekolah (webp) menjadi ikon aplikasi — PNG + ICO multi-ukuran.
// Menggunakan ImageMagick (magick/convert) bila tersedia, fallback ffmpeg per-ukuran.
// Sumber: <root>/logo-sekolah.webp → resources/icon.png, resources/icon.ico, resources/icons/*.png
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const src = path.join(root, 'logo-sekolah.webp');
const outDir = path.join(root, 'resources');
const iconsDir = path.join(outDir, 'icons');

if (!fs.existsSync(src)) {
  console.log('logo-sekolah.webp tidak ditemukan — ikon existing dipertahankan.');
  process.exit(0);
}

fs.mkdirSync(iconsDir, { recursive: true });

function findMagick() {
  for (const bin of ['magick', 'convert']) {
    try {
      execFileSync(bin, ['-version'], { stdio: 'ignore' });
      return bin;
    } catch {
      /* lanjut */
    }
  }
  return null;
}

const magick = findMagick();
const SIZES = [16, 32, 48, 64, 128, 256, 512];

if (magick) {
  // PNG per ukuran (latar transparan dipertahankan)
  for (const size of SIZES) {
    const target = path.join(iconsDir, `${size}x${size}.png`);
    execFileSync(magick, [src, '-resize', `${size}x${size}`, '-background', 'none', target], {
      stdio: 'ignore',
    });
  }
  fs.copyFileSync(path.join(iconsDir, '512x512.png'), path.join(outDir, 'icon.png'));
  // ICO multi-ukuran untuk installer Windows
  execFileSync(
    magick,
    [
      src,
      '-background', 'none',
      '-define', 'icon:auto-resize=256,128,64,48,32,16',
      path.join(outDir, 'icon.ico'),
    ],
    { stdio: 'ignore' },
  );
  console.log('Ikon dikonversi dari logo-sekolah.webp via', magick);
} else {
  try {
    // Fallback ffmpeg (tanpa dukungan ICO multi-ukuran; ICO 256 saja)
    for (const size of SIZES) {
      const target = path.join(iconsDir, `${size}x${size}.png`);
      execFileSync('ffmpeg', ['-y', '-i', src, '-vf', `scale=${size}:${size}`, target], { stdio: 'ignore' });
    }
    fs.copyFileSync(path.join(iconsDir, '512x512.png'), path.join(outDir, 'icon.png'));
    console.log('Ikon dikonversi via ffmpeg (icon.ico dipertahankan dari build sebelumnya).');
  } catch (e) {
    console.error('Tidak ada magick/convert/ffmpeg — ikon existing dipertahankan.', e.message);
    process.exit(0);
  }
}
console.log('Selesai: resources/icon.png, resources/icon.ico, resources/icons/*.png');
