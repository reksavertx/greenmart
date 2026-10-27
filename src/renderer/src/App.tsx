// Shell aplikasi: header, navigasi F1-F4 / F8 (PRD §8), dan layar-layar.
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { AttendanceEntry, Student, SyncStatusInfo } from '@shared/types';
import Header from './components/Header';
import SyncDialog from './components/SyncDialog';
import KasirScreen from './screens/KasirScreen';
import ProductsScreen from './screens/ProductsScreen';
import AttendanceScreen from './screens/AttendanceScreen';
import DashboardScreen from './screens/DashboardScreen';
import SettingsScreen from './screens/SettingsScreen';
import { ToastProvider } from './lib/toast';

type Screen = 'kasir' | 'produk' | 'absensi' | 'dashboard' | 'pengaturan';

const NAV: { key: Screen; label: string; fnKey: string }[] = [
  { key: 'kasir', label: 'Kasir', fnKey: 'F1' },
  { key: 'produk', label: 'Produk', fnKey: 'F2' },
  { key: 'absensi', label: 'Absensi', fnKey: 'F3' },
  { key: 'dashboard', label: 'Dashboard', fnKey: 'F4' },
  { key: 'pengaturan', label: 'Pengaturan', fnKey: '' },
];

function Shell(): ReactElement {
  const [screen, setScreen] = useState<Screen>('kasir');
  const [storeName, setStoreName] = useState('GreenMart');
  const [activeCashier, setActiveCashier] = useState<Student | null>(null);
  const [attendees, setAttendees] = useState<AttendanceEntry[]>([]);
  const [syncInfo, setSyncInfo] = useState<SyncStatusInfo | null>(null);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  const refreshCashier = useCallback(async () => {
    const [c, a] = await Promise.all([window.api.getActiveCashier(), window.api.attendanceToday()]);
    setActiveCashier(c);
    setAttendees(a);
  }, []);

  const refreshStoreName = useCallback(async () => {
    const s = await window.api.settingsAll();
    setStoreName(s.store_name ?? 'GreenMart');
  }, []);

  useEffect(() => {
    void refreshCashier();
    void refreshStoreName();
    void window.api.syncStatus().then(setSyncInfo);
    const offStatus = window.api.onSyncStatus(setSyncInfo);
    const offRunning = window.api.onSyncRunning(setSyncRunning);
    return () => {
      offStatus();
      offRunning();
    };
  }, [refreshCashier, refreshStoreName]);

  useEffect(() => {
    void refreshCashier();
  }, [screen, refreshCashier]);

  // Navigasi keyboard global: F1-F4 layar, F8 sinkronisasi, Esc tutup dialog (PRD §8).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F1') {
        e.preventDefault();
        setScreen('kasir');
      } else if (e.key === 'F2') {
        e.preventDefault();
        setScreen('produk');
      } else if (e.key === 'F3') {
        e.preventDefault();
        setScreen('absensi');
      } else if (e.key === 'F4') {
        e.preventDefault();
        setScreen('dashboard');
      } else if (e.key === 'F8') {
        e.preventDefault();
        setSyncOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pickCashier = useCallback(
    (id: string) => {
      void window.api.setActiveCashier(id || null).then(refreshCashier);
    },
    [refreshCashier],
  );

  return (
    <div className="shell">
      <Header
        storeName={storeName}
        attendees={attendees}
        activeCashier={activeCashier}
        onPickCashier={pickCashier}
        syncInfo={syncInfo}
        syncRunning={syncRunning}
        onOpenSync={() => setSyncOpen(true)}
      />
      <nav className="nav">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={screen === n.key ? 'active' : ''}
            onClick={() => setScreen(n.key)}
          >
            {n.label}
            {n.fnKey && <span className="key-hint">{n.fnKey}</span>}
          </button>
        ))}
      </nav>
      <main className="content">
        {screen === 'kasir' && (
          <KasirScreen activeCashier={activeCashier} onCashierChanged={refreshCashier} />
        )}
        {screen === 'produk' && <ProductsScreen />}
        {screen === 'absensi' && <AttendanceScreen onCashierChanged={refreshCashier} />}
        {screen === 'dashboard' && <DashboardScreen />}
        {screen === 'pengaturan' && <SettingsScreen />}
      </main>
      <footer className="footer-hints">
        <span><kbd>F1</kbd> Kasir</span>
        <span><kbd>F2</kbd> Produk</span>
        <span><kbd>F3</kbd> Absensi</span>
        <span><kbd>F4</kbd> Dashboard</span>
        <span><kbd>F8</kbd> Sinkronisasi</span>
        <span><kbd>↓</kbd>+<kbd>Enter</kbd> Bayar tunai</span>
        <span><kbd>Del</kbd> hapus baris</span>
        <span><kbd>Esc</kbd> tutup dialog</span>
      </footer>
      <SyncDialog open={syncOpen} onClose={() => setSyncOpen(false)} />
    </div>
  );
}

export default function App(): ReactElement {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
