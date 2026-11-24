import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import type {
  DriveAsset,
  GasTestResult,
  IntegrationStatus,
  SupabaseTestResult,
} from '../types/cbt.ts';
import { authFetch } from '../lib/authClient.ts';

interface DriveManagerProps {
  assets: DriveAsset[];
  gasReachable: boolean;
  uploaderName: string;
  onRefresh: () => Promise<void>;
}

export const DriveMediaManager: React.FC<DriveManagerProps> = ({
  assets,
  gasReachable,
  uploaderName,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'spreadsheet'>('all');
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DriveAsset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [syncingAll, setSyncingAll] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const pendingLocalCount = assets.filter(
    (a) => a.source === 'local_madrasah' && a.url.startsWith('/uploads/')
  ).length;

  const uploadSingleFile = async (file: File) => {
    setUploading(true);
    setSyncNotice(null);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await authFetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64Data,
          uploadedBy: uploaderName,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setSyncNotice(
          json.gasSynced
            ? `Berkas "${file.name}" otomatis terunggah ke Google Drive (tanpa login).`
            : `Berkas "${file.name}" tersimpan di Galeri Server Madrasah (otomatis terunggah ke Google Drive saat GAS_DRIVE_WEBAPP_URL aktif).`
        );
      }
      await onRefresh();
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadSingleFile(file);
    e.target.value = '';
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    setSyncNotice(null);
    try {
      const res = await authFetch('/api/drive/sync-all', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSyncNotice(data.error || 'Gagal menyinkronkan ke Google Drive.');
        return;
      }
      setSyncNotice(`${data.syncedCount} berkas berhasil disinkronkan ke Google Drive tanpa login.`);
      await onRefresh();
    } finally {
      setSyncingAll(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await authFetch(`/api/drive/files/${confirmDelete.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      await onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  const copyUrl = (asset: DriveAsset) => {
    navigator.clipboard.writeText(asset.url);
    setCopiedId(asset.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const visibleAssets =
    filter === 'all' ? assets : assets.filter((a) => a.mediaKind === filter);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Manajer Google Drive &amp; Media Soal
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Semua gambar soal otomatis diunggah ke Google Drive tanpa login akun melalui layanan
            server Google Apps Script (
            {gasReachable ? 'WebApp GAS Terhubung' : 'Mode Galeri Lokal · Siap Sinkron GAS'}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {gasReachable && pendingLocalCount > 0 && (
            <button
              type="button"
              disabled={syncingAll}
              onClick={handleSyncAll}
              className="px-3.5 py-2.5 bg-white border border-emerald-700 text-emerald-800 hover:bg-emerald-50 text-xs font-semibold rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              <CloudUpload className="w-4 h-4" />
              <span>
                {syncingAll ? 'Menyinkronkan...' : `Sinkron ${pendingLocalCount} Media ke Drive`}
              </span>
            </button>
          )}
          <label className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0">
            <Upload className="w-4 h-4" />
            <span>{uploading ? 'Mengunggah ke Drive...' : 'Unggah Gambar / Video'}</span>
            <input
              type="file"
              accept="image/*,video/mp4,video/webm"
              className="hidden"
              onChange={handleUpload}
            />
          </label>
        </div>
      </div>

      {syncNotice && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
          {syncNotice}
        </div>
      )}

      {/* Filter Segmented Bar */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
        {(
          [
            { id: 'all', label: 'Semua Berkas' },
            { id: 'image', label: 'Gambar Soal' },
            { id: 'video', label: 'Video Stimulus' },
            { id: 'spreadsheet', label: 'Arsip Nilai CSV' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              filter === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {visibleAssets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <FolderOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-900">Belum ada berkas di kategori ini.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Nama Berkas</th>
                <th className="py-3 px-4">Jenis</th>
                <th className="py-3 px-4 text-right">Ukuran</th>
                <th className="py-3 px-4">Sumber</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visibleAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {asset.mediaKind === 'image' ? (
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-10 h-10 rounded border border-slate-200 object-cover bg-slate-50 shrink-0"
                        />
                      ) : asset.mediaKind === 'video' ? (
                        <Video className="w-4 h-4 text-slate-700 shrink-0" />
                      ) : (
                        <FileSpreadsheet className="w-4 h-4 text-amber-700 shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-slate-900 text-xs">{asset.name}</p>
                        <p className="text-[11px] text-slate-500 font-mono truncate max-w-xs">
                          {asset.url}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">{asset.mimeType}</td>
                  <td className="py-3 px-4 text-right text-xs font-mono tabular-nums text-slate-600">
                    {formatSize(asset.sizeBytes)}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <span>
                        {asset.source === 'google_drive_gas'
                          ? 'Google Drive (GAS · Tanpa Login)'
                          : 'Galeri Server Madrasah'}
                      </span>
                      {asset.driveUrl && (
                        <a
                          href={asset.driveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Drive</span>
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyUrl(asset)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedId === asset.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin URL</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(asset)}
                        aria-label={`Hapus ${asset.name}`}
                        className="p-1.5 text-slate-400 hover:text-red-700 rounded-md cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mandatory Confirmation Dialog for Deleting Drive File */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Hapus Berkas Media?</h3>
            <p className="text-sm text-slate-600 mt-2">
              Apakah Anda yakin ingin menghapus <strong>{confirmDelete.name}</strong> dari daftar
              media dan Google Drive? Soal yang menggunakan URL ini tidak akan dapat menampilkan
              lampiran lagi.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus Berkas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface IntegrationConfigPanelProps {
  status: IntegrationStatus | null;
  supabaseSql: string;
  gasCode: string;
  onStatusChange?: (next: IntegrationStatus) => void;
}

export const IntegrationConfigPanel: React.FC<IntegrationConfigPanelProps> = ({
  status: initialStatus,
  supabaseSql,
  gasCode,
  onStatusChange,
}) => {
  const [status, setStatus] = useState<IntegrationStatus | null>(initialStatus);
  const [activeCodeTab, setActiveCodeTab] = useState<'supabase' | 'gas'>('supabase');
  const [copied, setCopied] = useState(false);

  // GAS editable form state
  const [gasUrlInput, setGasUrlInput] = useState(initialStatus?.gasDriveWebappUrl || '');
  const [gasFolderInput, setGasFolderInput] = useState(initialStatus?.gasFolderId || '');
  const [gasSecretInput, setGasSecretInput] = useState('');
  const [savingGas, setSavingGas] = useState(false);
  const [gasSaveNotice, setGasSaveNotice] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Separate live diagnostic tests
  const [testingSupabase, setTestingSupabase] = useState(false);
  const [supabaseTest, setSupabaseTest] = useState<SupabaseTestResult | null>(null);

  const [testingGas, setTestingGas] = useState(false);
  const [gasTest, setGasTest] = useState<GasTestResult | null>(null);

  useEffect(() => {
    setStatus(initialStatus);
    if (initialStatus) {
      setGasUrlInput(initialStatus.gasDriveWebappUrl || '');
      setGasFolderInput(initialStatus.gasFolderId || '');
    }
  }, [initialStatus]);

  const applyStatus = (next: IntegrationStatus | null) => {
    if (!next) return;
    setStatus(next);
    onStatusChange?.(next);
  };

  const handleTestSupabase = async () => {
    setTestingSupabase(true);
    try {
      const res = await authFetch('/api/integrations/test-supabase', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        if (data.status) applyStatus(data.status);
        if (data.result) setSupabaseTest(data.result);
      } else {
        setSupabaseTest({
          configured: Boolean(status?.supabaseConfigured),
          connected: false,
          tablesReady: false,
          latencyMs: 0,
          projectHost: status?.supabaseProjectHost || null,
          tables: [],
          error: data.error || 'Gagal menghubungi endpoint uji Supabase.',
        });
      }
    } catch {
      setSupabaseTest({
        configured: Boolean(status?.supabaseConfigured),
        connected: false,
        tablesReady: false,
        latencyMs: 0,
        projectHost: status?.supabaseProjectHost || null,
        tables: [],
        error: 'Koneksi ke server terputus saat menguji Supabase.',
      });
    } finally {
      setTestingSupabase(false);
    }
  };

  const handleTestGas = async () => {
    setTestingGas(true);
    try {
      const res = await authFetch('/api/integrations/test-gas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webappUrl: gasUrlInput.trim(),
          secret: gasSecretInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.status) applyStatus(data.status);
        if (data.result) {
          setGasTest(data.result);
          if (data.result.folderId && !gasFolderInput.trim()) {
            setGasFolderInput(data.result.folderId);
          }
        }
      } else {
        setGasTest({
          configured: Boolean(gasUrlInput.trim()),
          reachable: false,
          latencyMs: 0,
          webappUrl: gasUrlInput.trim() || null,
          folderId: gasFolderInput.trim() || null,
          fileCount: null,
          error: data.error || 'Gagal menguji WebApp GAS.',
        });
      }
    } catch {
      setGasTest({
        configured: Boolean(gasUrlInput.trim()),
        reachable: false,
        latencyMs: 0,
        webappUrl: gasUrlInput.trim() || null,
        folderId: gasFolderInput.trim() || null,
        fileCount: null,
        error: 'Koneksi ke server terputus saat menguji GAS.',
      });
    } finally {
      setTestingGas(false);
    }
  };

  const handleSaveGasConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGas(true);
    setGasSaveNotice(null);
    try {
      const res = await authFetch('/api/integrations/gas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webappUrl: gasUrlInput.trim(),
          folderId: gasFolderInput.trim(),
          secret: gasSecretInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGasSaveNotice({
          type: 'error',
          text: data.error || 'Gagal menyimpan pengaturan Google Apps Script.',
        });
        return;
      }
      if (data.status) applyStatus(data.status);
      setGasSecretInput('');
      setGasSaveNotice(
        data.warning
          ? { type: 'warning', text: data.warning }
          : {
              type: 'success',
              text: data.savedToSupabase
                ? 'Pengaturan Google Apps Script berhasil disimpan permanen ke Supabase dan langsung aktif.'
                : 'Pengaturan Google Apps Script berhasil disimpan dan langsung aktif.',
            }
      );
    } catch {
      setGasSaveNotice({
        type: 'error',
        text: 'Gagal terhubung ke server saat menyimpan pengaturan GAS.',
      });
    } finally {
      setSavingGas(false);
    }
  };

  const handleResetGasToEnv = async () => {
    setSavingGas(true);
    setGasSaveNotice(null);
    try {
      const res = await authFetch('/api/integrations/gas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToEnv: true }),
      });
      const data = await res.json();
      if (res.ok && data.status) {
        applyStatus(data.status);
        setGasUrlInput(data.status.gasDriveWebappUrl || '');
        setGasFolderInput(data.status.gasFolderId || '');
        setGasSecretInput('');
        setGasSaveNotice({
          type: 'success',
          text: 'Pengaturan GAS dikembalikan ke konfigurasi bawaan server (Secrets / Environment).',
        });
      }
    } finally {
      setSavingGas(false);
    }
  };

  const currentCode = activeCodeTab === 'supabase' ? supabaseSql : gasCode;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const blob = new Blob([currentCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeCodeTab === 'supabase' ? 'supabase_schema.sql' : 'Code.gs';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          Pengaturan &amp; Pengujian Supabase serta Google Apps Script (Drive)
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          Uji kesiapan tabel database Supabase secara langsung dan atur URL WebApp Google Apps Script
          (Google Drive) dari dashboard ini tanpa perlu deploy ulang.
        </p>
      </div>

      {/* Main Two-Column Config & Diagnostics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* CARD 1: SUPABASE DIAGNOSTICS */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-700" />
                Database Supabase PostgreSQL
              </span>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">
                {status?.supabaseProjectHost || 'Host belum disetel di Secrets / Vercel Env'}
              </p>
            </div>
            <button
              type="button"
              disabled={testingSupabase}
              onClick={handleTestSupabase}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingSupabase ? 'animate-spin' : ''}`} />
              <span>{testingSupabase ? 'Menguji Supabase...' : 'Uji Koneksi Supabase'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-[11px] text-slate-500">URL &amp; Secret Key Server</p>
              <p
                className={`font-semibold mt-0.5 ${
                  status?.supabaseConfigured ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {status?.supabaseConfigured ? 'Tersetel' : 'Belum Lengkap'}
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-[11px] text-slate-500">Publishable &amp; JWKS</p>
              <p
                className={`font-semibold mt-0.5 ${
                  status?.supabasePublishableConfigured && status?.supabaseJwksUrl
                    ? 'text-emerald-700'
                    : 'text-slate-600'
                }`}
              >
                {status?.supabasePublishableConfigured ? 'Tersetel' : 'Opsional / Belum'}
              </p>
            </div>
          </div>

          {supabaseTest ? (
            <div className="space-y-3">
              <div
                className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                  supabaseTest.tablesReady
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : supabaseTest.connected
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {supabaseTest.tablesReady ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {supabaseTest.tablesReady
                      ? `Supabase Berhasil Terhubung & Seluruh 8 Tabel Siap (${supabaseTest.latencyMs} ms)`
                      : supabaseTest.connected
                        ? `Host Supabase Terhubung (${supabaseTest.latencyMs} ms), tetapi Akses/Tabel Perlu Diperbaiki`
                        : 'Gagal Terhubung ke Supabase'}
                  </p>
                  {supabaseTest.error && (
                    <p className="mt-1 leading-relaxed break-words">{supabaseTest.error}</p>
                  )}
                </div>
              </div>

              {supabaseTest.tables.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5">
                  {supabaseTest.tables.map((tbl) => {
                    const isPermDenied = Boolean(
                      tbl.error &&
                        /permission denied|row-level security|not allowed|insufficient_privilege/i.test(
                          tbl.error
                        )
                    );
                    return (
                      <div
                        key={tbl.table}
                        title={tbl.error || undefined}
                        className={`px-2.5 py-1.5 rounded-md border text-[11px] flex items-center justify-between gap-2 ${
                          tbl.ok
                            ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                            : 'bg-red-50/60 border-red-200 text-red-800'
                        }`}
                      >
                        <span className="font-mono truncate">{tbl.table}</span>
                        <span className="font-mono font-semibold shrink-0">
                          {tbl.ok
                            ? `OK (${tbl.rowCount ?? 0})`
                            : isPermDenied
                              ? 'Akses ditolak'
                              : 'Belum ada'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
              {status?.supabaseConfigured
                ? status.supabaseTablesReady
                  ? `Terhubung ke ${status.supabaseProjectHost} dengan seluruh 8 tabel aktif. Klik "Uji Koneksi Supabase" kapan saja untuk memeriksa latensi & jumlah baris.`
                  : `Host ${status.supabaseProjectHost} terkonfigurasi, namun tabel berikut belum ditemukan: ${status.supabaseMissingTables.join(', ') || 'perlu dicek'}. Klik "Uji Koneksi Supabase" untuk diagnosa rinci atau jalankan skrip SQL di bawah.`
                : 'Variabel SUPABASE_URL dan SUPABASE_SECRET_KEY (atau SUPABASE_SERVICE_ROLE_KEY) belum terbaca oleh server ini. Atur pada Secrets / Vercel Environment Variables lalu klik "Uji Koneksi Supabase".'}
            </div>
          )}
        </div>

        {/* CARD 2: EDITABLE GAS WEBAPP URL & TEST */}
        <form
          onSubmit={handleSaveGasConfig}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-emerald-700" />
                Google Apps Script (Google Drive)
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                Sumber aktif:{' '}
                <span className="font-semibold text-slate-700">
                  {status?.gasConfigSource === 'admin_panel'
                    ? 'Pengaturan Dashboard Admin'
                    : status?.gasConfigSource === 'env'
                      ? 'Environment / Secrets Server'
                      : 'Belum Dikonfigurasi'}
                </span>
              </p>
            </div>

            <button
              type="button"
              disabled={testingGas}
              onClick={handleTestGas}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingGas ? 'animate-spin' : ''}`} />
              <span>{testingGas ? 'Menguji GAS...' : 'Uji Koneksi GAS'}</span>
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Google Apps Script Web App URL (<code className="font-mono">/exec</code>)
              </label>
              <input
                type="url"
                value={gasUrlInput}
                onChange={(e) => setGasUrlInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Google Drive Folder ID <span className="text-slate-400">(opsional)</span>
                </label>
                <input
                  type="text"
                  value={gasFolderInput}
                  onChange={(e) => setGasFolderInput(e.target.value)}
                  placeholder="Otomatis dari Code.gs / Drive"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  GAS API Secret{' '}
                  <span
                    className={`ml-1 font-semibold ${
                      status?.gasSecretConfigured ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    ({status?.gasSecretConfigured ? 'Sudah Tersetel' : 'Belum Diisi'})
                  </span>
                </label>
                <input
                  type="password"
                  value={gasSecretInput}
                  onChange={(e) => setGasSecretInput(e.target.value)}
                  placeholder={
                    status?.gasSecretConfigured
                      ? 'Biarkan kosong untuk tetap memakai secret aktif'
                      : 'Isi jika Code.gs memakai SHARED_SECRET'
                  }
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                />
              </div>
            </div>
          </div>

          {gasSaveNotice && (
            <div
              className={`p-3 rounded-lg border text-xs ${
                gasSaveNotice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : gasSaveNotice.type === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {gasSaveNotice.text}
            </div>
          )}

          {gasTest && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                gasTest.reachable
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {gasTest.reachable ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-bold">
                  {gasTest.reachable
                    ? `WebApp GAS Aktif & Terhubung (${gasTest.latencyMs} ms)`
                    : 'WebApp GAS Gagal Terhubung'}
                </p>
                {gasTest.reachable ? (
                  <p>
                    Folder Drive:{' '}
                    <code className="font-mono">{gasTest.folderId || '-'}</code> · Terdeteksi{' '}
                    <strong>{gasTest.fileCount ?? 0}</strong> berkas.
                  </p>
                ) : (
                  <p className="break-words">{gasTest.error}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={savingGas}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingGas ? 'Menyimpan...' : 'Simpan Pengaturan GAS'}</span>
            </button>
            {status?.gasConfigSource === 'admin_panel' && (
              <button
                type="button"
                disabled={savingGas}
                onClick={handleResetGasToEnv}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset ke Default Server</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Ready-to-use SQL & GAS Script Viewer */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/70">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveCodeTab('supabase')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                activeCodeTab === 'supabase'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1. Skema SQL Supabase (supabase_schema.sql)
            </button>
            <button
              type="button"
              onClick={() => setActiveCodeTab('gas')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                activeCodeTab === 'gas'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2. Google Apps Script (Code.gs)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Disalin' : 'Salin Kode'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Berkas</span>
            </button>
          </div>
        </div>

        <pre className="p-5 text-xs font-mono text-slate-800 bg-slate-50 overflow-x-auto max-h-[460px] leading-relaxed">
          <code>{currentCode}</code>
        </pre>
      </div>
    </div>
  );
};
