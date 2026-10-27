// Penjadwal sinkronisasi otomatis (PRD §7.4.3 poin 8):
// (a) saat aplikasi start, (b) interval berkala (default 10 menit, dapat diatur),
// (c) saat kembali online, (d) manual — semua lewat SyncManager.run().
import { BrowserWindow, net } from 'electron';
import type { DB } from '../db/database';
import { getSyncStatusInfo } from '../db/repositories/syncLog';
import { getSetting } from '../db/repositories/settings';
import { runSync, type SyncResult } from './sheetsSync';

export class SyncManager {
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly db: DB,
    private readonly getWindow: () => BrowserWindow | null,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  private send(channel: string, payload: unknown): void {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  private notifyStatus(): void {
    this.send('sync:status', getSyncStatusInfo(this.db, this.running));
  }

  private setRunning(running: boolean): void {
    this.running = running;
    this.send('sync:running', running);
  }

  async run(manual: boolean): Promise<SyncResult> {
    if (this.running) {
      return { ok: false, configError: false, message: 'Sinkronisasi sedang berjalan.', counts: { transactions: 0, details: 0, summaries: 0, productsAdded: 0, productsUpdated: 0, rekapRows: 0, opnameRows: 0 } };
    }
    this.setRunning(true);
    try {
      const res = await runSync({ db: this.db, manual });
      this.notifyStatus();
      return res;
    } finally {
      this.setRunning(false);
      this.notifyStatus();
    }
  }

  private pendingWork(): boolean {
    const info = getSyncStatusInfo(this.db, this.running);
    return info.transactions.pending + info.transactions.failed + info.daily.pending + info.daily.failed > 0;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    const intervalMin = Math.max(1, Number(getSetting(this.db, 'sync_interval_minutes', '10')) || 10);
    const last = getSetting(this.db, 'last_sync_at', '');
    const lastMs = last ? Date.parse(last) : NaN;
    const elapsed = Number.isNaN(lastMs) ? Infinity : Date.now() - lastMs;
    if (!this.pendingWork() && elapsed < intervalMin * 60_000) return;
    if (!net.isOnline()) return;
    await this.run(false);
  }

  startAuto(): void {
    if (this.timer) return;
    // (a) coba saat start — beri jeda agar window siap dulu
    this.startTimer = setTimeout(() => {
      void this.run(false);
    }, 5_000);
    // (b) interval berkala + (c) event online dicek tiap tick
    this.timer = setInterval(() => {
      void this.tick();
    }, 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.startTimer) clearTimeout(this.startTimer);
    this.timer = null;
    this.startTimer = null;
  }
}
