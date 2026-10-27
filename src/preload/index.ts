// Preload — jembatan IPC aman (contextIsolation + sandbox).
import { contextBridge, ipcRenderer } from 'electron';
import type { KasirApi, SyncStatusInfo } from '@shared/types';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: KasirApi = {
  // Produk
  productsList: (q) => ipcRenderer.invoke('products:list', q),
  productCreate: (input) => ipcRenderer.invoke('products:create', input),
  productUpdate: (id, input) => ipcRenderer.invoke('products:update', id, input),
  productDelete: (id, mode) => ipcRenderer.invoke('products:delete', id, mode),
  productHasSales: (id) => ipcRenderer.invoke('products:hasSales', id),
  productByBarcode: (barcode) => ipcRenderer.invoke('products:byBarcode', barcode),
  printLabels: (html, labelCount) => ipcRenderer.invoke('labels:print', html, labelCount),

  // Siswa & absensi
  pickCsvFile: () => ipcRenderer.invoke('students:pickCsv'),
  importPreviewCsv: (content) => ipcRenderer.invoke('students:importPreview', content),
  importCommitStudents: (rows) => ipcRenderer.invoke('students:importCommit', rows),
  studentFindByNisn: (nisn) => ipcRenderer.invoke('students:findByNisn', nisn),
  attendanceRecord: (studentId) => ipcRenderer.invoke('attendance:record', studentId),
  attendanceToday: () => ipcRenderer.invoke('attendance:today'),
  attendanceByDate: (date) => ipcRenderer.invoke('attendance:byDate', date),
  setActiveCashier: (studentId) => ipcRenderer.invoke('attendance:setActiveCashier', studentId),
  getActiveCashier: () => ipcRenderer.invoke('attendance:getActiveCashier'),

  // Transaksi
  createTransaction: (items) => ipcRenderer.invoke('transactions:create', items),

  // Dashboard
  dashboardCards: () => ipcRenderer.invoke('dashboard:cards'),
  dashboardTrend: (days) => ipcRenderer.invoke('dashboard:trend', days),
  dashboardTop: (days, by) => ipcRenderer.invoke('dashboard:top', days, by),
  dashboardHourly: (days) => ipcRenderer.invoke('dashboard:hourly', days),

  // Pengaturan
  settingsAll: () => ipcRenderer.invoke('settings:all'),
  settingsSet: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // Sinkronisasi
  syncNow: () => ipcRenderer.invoke('sync:now'),
  syncStatus: () => ipcRenderer.invoke('sync:status'),
  syncRetryFailed: () => ipcRenderer.invoke('sync:retryFailed'),
  syncOpenSheet: () => ipcRenderer.invoke('sync:openSheet'),
  googleTestConnection: (payload) => ipcRenderer.invoke('google:test', payload),
  googleSave: (payload) => ipcRenderer.invoke('google:save', payload),
  googleConfigured: () => ipcRenderer.invoke('google:configured'),

  // Backup & danger zone
  backupInfo: () => ipcRenderer.invoke('backup:info'),
  backupChooseDir: () => ipcRenderer.invoke('backup:chooseDir'),
  backupRunNow: () => ipcRenderer.invoke('backup:runNow'),
  resetData: (scope, confirmName) => ipcRenderer.invoke('system:resetData', scope, confirmName),

  // Events
  onSyncStatus: (cb: (info: SyncStatusInfo) => void) => subscribe<SyncStatusInfo>('sync:status', cb),
  onSyncRunning: (cb: (running: boolean) => void) => subscribe<boolean>('sync:running', cb),
};

contextBridge.exposeInMainWorld('api', api);
