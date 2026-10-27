// Nada beep via Web Audio API — tanpa file audio (offline penuh).
let ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, delaySec: number, durSec: number, type: OscillatorType = 'sine', vol = 0.12): void {
  try {
    const c = ac();
    const t0 = c.currentTime + delaySec;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.02);
  } catch {
    // audio gagal — jangan ganggu alur kasir
  }
}

/** Scan sukses: dua nada naik. */
export function beepOk(): void {
  tone(880, 0, 0.07);
  tone(1318.5, 0.08, 0.09);
}

/** Transaksi tersimpan: nada kasir. */
export function beepCash(): void {
  tone(1046.5, 0, 0.09);
  tone(1568, 0.1, 0.14);
}

/** Peringatan (stok habis / tidak cukup). */
export function beepWarn(): void {
  tone(440, 0, 0.16, 'square', 0.08);
}

/** Error / barcode tak terdaftar: nada rendah. */
export function beepError(): void {
  tone(220, 0, 0.22, 'sawtooth', 0.1);
  tone(175, 0.1, 0.2, 'sawtooth', 0.1);
}
