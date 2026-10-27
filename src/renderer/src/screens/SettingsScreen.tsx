// F6 — Pengaturan, Setup Wizard kredensial Google, backup, danger zone (PRD F6).
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { BackupInfo } from '@shared/types';
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
  const [wizardOpen, setWizardOpen] = useState(false);
  const [credJson, setCredJson] = useState('');
  const [sheetInput, setSheetInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const refresh = useCallback(async () => {
    const [s, g, b] = await Promise.all([
      window.api.settingsAll(),
      window.api.googleConfigured(),
      window.api.backupInfo(),
    ]);
    setSettings(s);
    setGoogle(g);
    setBackup(b);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveField = async (key: string, value: string): Promise<void> => {
    await window.api.settingsSet(key, value);
    toast.ok('Pengaturan tersimpan.');
    void refresh();
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
          <label className="field">
            <span>Default stok minimum (produk baru)</span>
            <input
              type="number"
              min={0}
              defaultValue={settings.min_stock_default ?? '5'}
              onBlur={(e) =>
                e.target.value !== settings.min_stock_default && void saveField('min_stock_default', e.target.value)
              }
            />
          </label>
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
      </div>

      <div>
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
