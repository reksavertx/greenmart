// F6 — Pengaturan, Setup Wizard kredensial Google, backup, danger zone (PRD F6) + v1.0.1:
// kategori produk, batas alert stok menipis, lebar struk, siklus opname, tema.
// v1.0.2: panel import data dummy/demo.
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { BackupInfo, Category, DummyImportResult } from '@shared/types';
import Modal from '../components/Modal';
import { useToast } from '../lib/toast';

interface GoogleCfg {
  hasCredential: boolean;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  encryptionAvailable: boolean;
}

export default function SettingsScreen(): ReactElement {
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [google, setGoogle] = useState<GoogleCfg | null>(null);
  const [backup, setBackup] = useState<BackupInfo | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCat, setNewCat] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [credJson, setCredJson] = useState('');
  const [sheetInput, setSheetInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [demoConfirm, setDemoConfirm] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [s, g, b, c] = await Promise.all([
      window.api.settingsAll(),
      window.api.googleConfigured(),
      window.api.backupInfo(),
      window.api.categoriesList(),
    ]);
    setSettings(s);
    setGoogle(g);
    setBackup(b);
    setCategories(c);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveField = async (key: string, value: string): Promise<void> => {
    await window.api.settingsSet(key, value);
    toast.ok('Pengaturan tersimpan.');
    void refresh();
  };

  const addCategory = async (): Promise<void> => {
    if (!newCat.trim()) return;
    try {
      await window.api.categoriesCreate(newCat);
      setNewCat('');
      toast.ok('Kategori ditambahkan.');
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menambah kategori.');
    }
  };

  const renameCategory = async (c: Category): Promise<void> => {
    const name = window.prompt(`Ganti nama kategori "${c.name}" menjadi:`, c.name);
    if (name === null || !name.trim() || name === c.name) return;
    try {
      await window.api.categoriesUpdate(c.id, name);
      toast.ok('Kategori diperbarui.');
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengubah kategori.');
    }
  };

  const deleteCategory = async (c: Category): Promise<void> => {
    if (!window.confirm(`Hapus kategori "${c.name}"?`)) return;
    try {
      await window.api.categoriesDelete(c.id);
      toast.ok('Kategori dihapus.');
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus kategori.');
    }
  };

  const testConnection = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await window.api.googleTestConnection({ credentialJson: credJson, spreadsheetInput: sheetInput });
      (res.ok ? toast.ok : toast.error)(res.message);
    } finally {
      setBusy(false);
    }
  };

  const saveCredentials = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await window.api.googleSave({ credentialJson: credJson, spreadsheetInput: sheetInput });
      (res.ok ? toast.ok : toast.error)(res.message);
      if (res.ok) {
        setWizardOpen(false);
        setCredJson('');
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const runDemoImport = async (): Promise<void> => {
    setDemoConfirm(false);
    setDemoBusy(true);
    try {
      const res: DummyImportResult = await window.api.demoImportDummy();
      (res.ok ? toast.ok : toast.warn)(res.message);
      if (res.ok) await refresh();
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="settings-grid">
      <div>
        <div className="panel panel-pad" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Umum</h2>
          <label className="field">
            <span>Nama toko</span>
            <input
              defaultValue={settings.store_name ?? ''}
              onBlur={(e) => e.target.value !== settings.store_name && void saveField('store_name', e.target.value)}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="field">
              <span>Batas alert stok menipis (global)</span>
              <input
                type="number"
                min={0}
                defaultValue={settings.low_stock_alert ?? '5'}
                onBlur={(e) =>
                  e.target.value !== settings.low_stock_alert && void saveField('low_stock_alert', e.target.value)
                }
              />
            </label>
            <label className="field">
              <span>Siklus jaga opname (hari)</span>
              <input
                type="number"
                min={2}
                max={31}
                defaultValue={settings.opname_cycle_days ?? '3'}
                onBlur={(e) =>
                  e.target.value !== settings.opname_cycle_days && void saveField('opname_cycle_days', e.target.value)
                }
              />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="field">
              <span>Lebar kertas struk (mm)</span>
              <select
                value={settings.receipt_width_mm ?? '58'}
                onChange={(e) => void saveField('receipt_width_mm', e.target.value)}
              >
                <option value="58">58 mm (printer thermal kecil)</option>
                <option value="80">80 mm (printer thermal besar)</option>
              </select>
            </label>
            <label className="field">
              <span>Tema tampilan</span>
              <select value={settings.theme ?? 'system'} onChange={(e) => void saveField('theme', e.target.value)}>
                <option value="system">Ikuti sistem</option>
                <option value="light">Terang</option>
                <option value="dark">Gelap</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Interval sinkronisasi otomatis (menit)</span>
            <input
              type="number"
              min={1}
              defaultValue={settings.sync_interval_minutes ?? '10'}
              onBlur={(e) =>
                e.target.value !== settings.sync_interval_minutes &&
                void saveField('sync_interval_minutes', e.target.value)
              }
            />
          </label>
        </div>

        <div className="panel panel-pad" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Kategori Produk</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Kategori dipakai untuk laporan per kategori & grafik dashboard. Kategori yang masih dipakai produk
            tidak bisa dihapus.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              placeholder="Nama kategori baru..."
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addCategory()}
            />
            <button className="btn btn-primary" onClick={() => void addCategory()}>+ Tambah</button>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>Nama</th>
                <th className="num">Produk</th>
                <th style={{ width: 170 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td>
                  <td className="num">{c.product_count ?? 0}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn" onClick={() => void renameCategory(c)}>Ganti Nama</button>
                      <button className="btn btn-danger" onClick={() => void deleteCategory(c)}>Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">Belum ada kategori.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="panel panel-pad" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Data Demo (Presentasi)</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Isi aplikasi dengan data contoh (produk, siswa, absensi, ±2 bulan transaksi dengan
            pola akhir pekan &amp; hari libur nasional). File demo: <span className="mono">greenmart-dummy.json</span>.
          </p>
          <ul className="muted" style={{ fontSize: 13, lineHeight: 1.7, paddingLeft: 18, marginTop: 0 }}>
            <li><b>Data asli tidak dihapus</b> — produk/siswa/transaksi yang sudah ada dilewati.</li>
            <li>Transaksi dummy disimpan sebagai riwayat (stok tidak berkurang) dan ditandai sudah tersinkron agar tidak memenuhi spreadsheet asli.</li>
            <li><b>Backup otomatis dibuat</b> sebelum impor — bisa dipulihkan dari folder backup.</li>
          </ul>
          <button className="btn btn-primary" disabled={demoBusy} onClick={() => setDemoConfirm(true)}>
            {demoBusy ? 'Mengimpor...' : '📂 Impor File Data Demo...'}
          </button>
        </div>
      </div>

      <div>
        <div className="panel panel-pad" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Google Sheets</h2>
          {google && (
            <p>
              Status:{' '}
              {google.hasCredential ? (
                <span className="badge badge-ok">kredensial terpasang</span>
              ) : (
                <span className="badge badge-out">belum dikonfigurasi</span>
              )}{' '}
              {!google.encryptionAvailable && (
                <span className="badge badge-low" title="Linux tanpa keyring — kredensial disimpan base64">
                  enkripsi OS tidak tersedia
                </span>
              )}
            </p>
          )}
          {google?.spreadsheetUrl && (
            <p className="mono muted" style={{ wordBreak: 'break-all' }}>{google.spreadsheetUrl}</p>
          )}
          <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
            🔐 Setup Wizard Kredensial Google
          </button>
          <p className="muted" style={{ marginBottom: 0 }}>
            Kredensial disimpan terenkripsi (safeStorage). Data tetap aman offline — sinkronisasi hanya
            dorong satu arah SQLite → Sheets.
          </p>
        </div>
        <div className="panel panel-pad" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Backup</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Backup otomatis sekali sehari saat aplikasi pertama dijalankan; disimpan 7 salinan terakhir.
          </p>
          <label className="field">
            <span>Folder backup</span>
            <input readOnly value={backup?.dir ?? ''} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => void window.api.backupChooseDir().then(refresh)}>
              Pilih Folder…
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void window.api.backupRunNow().then(refresh).then(() => toast.ok('Backup dibuat.'))}
            >
              Backup Sekarang
            </button>
          </div>
          {backup && backup.files.length > 0 && (
            <table className="data" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>File</th>
                  <th className="num">Ukuran</th>
                </tr>
              </thead>
              <tbody>
                {backup.files.slice(0, 7).map((f) => (
                  <tr key={f.name}>
                    <td className="mono" style={{ fontSize: 12 }}>{f.name}</td>
                    <td className="num">{(f.size / 1024).toFixed(0)} KB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="danger-zone">
          <h2 style={{ color: 'var(--red)', marginTop: 0 }}>Danger Zone</h2>
          <p className="muted">
            Ketik nama toko (<b>{settings.store_name ?? 'GreenMart'}</b>) untuk mengaktifkan tombol reset.
          </p>
          <input placeholder="Ketik nama toko…" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="btn btn-danger"
              disabled={confirmName.trim() !== (settings.store_name ?? '')}
              onClick={() =>
                void window.api
                  .resetData('transactions', confirmName)
                  .then((r) => (r.ok ? toast.ok(r.message) : toast.error(r.message)))
              }
            >
              Hapus Semua Transaksi
            </button>
            <button
              className="btn btn-danger"
              disabled={confirmName.trim() !== (settings.store_name ?? '')}
              onClick={() =>
                void window.api
                  .resetData('products', confirmName)
                  .then((r) => (r.ok ? toast.ok(r.message) : toast.error(r.message)))
              }
            >
              Hapus Semua Produk
            </button>
          </div>
        </div>
      </div>

      {demoConfirm && (
        <Modal
          title="Impor data demo?"
          onClose={() => setDemoConfirm(false)}
          footer={
            <>
              <button className="btn" onClick={() => setDemoConfirm(false)}>Batal</button>
              <button className="btn btn-primary" onClick={() => void runDemoImport()}>
                Pilih File &amp; Impor
              </button>
            </>
          }
        >
          <p>
            Anda akan diminta memilih file <span className="mono">greenmart-dummy.json</span>. Data demo
            akan <b>digabungkan</b> dengan data yang ada:
          </p>
          <ul style={{ lineHeight: 1.8 }}>
            <li>Produk/siswa yang barcode/NISN-nya sudah ada → <b>dilewati</b></li>
            <li>Transaksi dummy → riwayat baru (stok tidak berkurang)</li>
            <li>Backup otomatis dibuat terlebih dahulu</li>
          </ul>
          <p className="muted" style={{ marginBottom: 0 }}>
            Dashboard &amp; laporan akan menampilkan gabungan data asli + demo.
          </p>
        </Modal>
      )}

      {wizardOpen && (
        <Modal
          title="Setup Wizard — Kredensial Google"
          onClose={() => setWizardOpen(false)}
          wide
          footer={
            <>
              <button className="btn" disabled={busy} onClick={() => void testConnection()}>
                Uji Koneksi
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void saveCredentials()}>
                Simpan (Terenkripsi)
              </button>
            </>
          }
        >
          <ol style={{ lineHeight: 1.9 }} className="muted">
            <li>Buat Service Account di Google Cloud & aktifkan <b>Sheets API</b> (panduan lengkap di README).</li>
            <li>Unduh file JSON key.</li>
            <li>
              Bagikan spreadsheet ke email service account sebagai <b>Editor</b>, dan set linksharing
              <b> anyone with link → Viewer</b> agar publik bisa membaca.
            </li>
          </ol>
          <label className="field">
            <span>Isi file JSON service account (paste seluruh isi)</span>
            <textarea
              rows={8}
              placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "..."}'
              value={credJson}
              onChange={(e) => setCredJson(e.target.value)}
            />
          </label>
          <label className="field">
            <span>URL atau ID spreadsheet tujuan</span>
            <input
              placeholder="https://docs.google.com/spreadsheets/d/…/edit"
              value={sheetInput}
              onChange={(e) => setSheetInput(e.target.value)}
            />
          </label>
        </Modal>
      )}
    </div>
  );
}
