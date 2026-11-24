import React, { useState } from 'react';
import {
  Check,
  CloudUpload,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  Image as ImageIcon,
  RefreshCw,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import type { DriveAsset, IntegrationStatus } from '../types/cbt.ts';
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
}

export const IntegrationConfigPanel: React.FC<IntegrationConfigPanelProps> = ({
  status: initialStatus,
  supabaseSql,
  gasCode,
}) => {
  const [status, setStatus] = useState<IntegrationStatus | null>(initialStatus);
  const [activeCodeTab, setActiveCodeTab] = useState<'supabase' | 'gas'>('supabase');
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    gasReachable: boolean;
    gasError: string | null;
  } | null>(null);

  const currentCode = activeCodeTab === 'supabase' ? supabaseSql : gasCode;

  const handleTestConnections = async () => {
    setTesting(true);
    try {
      const res = await authFetch('/api/integrations/test', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.status) setStatus(data.status);
        setTestResult({
          gasReachable: Boolean(data.gasReachable),
          gasError: data.gasError || null,
        });
      }
    } finally {
      setTesting(false);
    }
  };

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Integrasi Database Supabase &amp; Google Apps Script (Drive)
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Kredensial koneksi (<code className="font-mono">SUPABASE_URL</code>,{' '}
            <code className="font-mono">SUPABASE_SECRET_KEY</code>,{' '}
            <code className="font-mono">SUPABASE_PUBLISHABLE_KEY</code>,{' '}
            <code className="font-mono">SUPABASE_JWKS_URL</code>, dan{' '}
            <code className="font-mono">GAS_DRIVE_WEBAPP_URL</code>) dikonfigurasi secara aman
            melalui panel <strong>Secrets</strong> server.
          </p>
        </div>

        <button
          type="button"
          disabled={testing}
          onClick={handleTestConnections}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
          <span>{testing ? 'Menguji Koneksi...' : 'Uji Koneksi Supabase & GAS'}</span>
        </button>
      </div>

      {/* Connection Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-700" />
              Database Supabase PostgreSQL
            </span>
            <span
              className={`text-xs font-semibold ${
                status?.supabaseConfigured
                  ? status.supabaseTablesReady
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                  : 'text-amber-700'
              }`}
            >
              {status?.supabaseConfigured
                ? status.supabaseTablesReady
                  ? 'Terhubung & Tabel Siap'
                  : 'Terhubung · Perlu Jalankan SQL'
                : 'Mode Persisten Lokal Aktif'}
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            {status?.supabaseConfigured
              ? status.supabaseTablesReady
                ? `Terhubung ke ${status.supabaseProjectHost} dengan seluruh 8 tabel aktif (termasuk admins, assessments, questions, students, submissions).`
                : `Host ${status.supabaseProjectHost} terhubung, namun tabel berikut belum dibuat di Supabase SQL Editor: ${status.supabaseMissingTables.join(', ')}. Salin skrip SQL di bawah lalu jalankan di Supabase SQL Editor.`
              : 'Setel SUPABASE_URL dan SUPABASE_SECRET_KEY (atau SUPABASE_SERVICE_ROLE_KEY) di Secrets server untuk mengaktifkan database cloud Supabase.'}
          </p>
          {status?.supabaseJwksUrl && (
            <p className="text-[11px] font-mono text-slate-500 truncate">
              JWKS: {status.supabaseJwksUrl}
            </p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-emerald-700" />
              Google Drive via Google Apps Script
            </span>
            <span
              className={`text-xs font-semibold ${
                status?.gasDriveConfigured
                  ? testResult?.gasReachable === false
                    ? 'text-red-700'
                    : 'text-emerald-700'
                  : 'text-amber-700'
              }`}
            >
              {status?.gasDriveConfigured
                ? testResult?.gasReachable
                  ? 'WebApp GAS Aktif & Merespons'
                  : testResult?.gasReachable === false
                    ? 'WebApp GAS Gagal Dijangkau'
                    : 'WebApp GAS Terkonfigurasi'
                : 'Menunggu URL WebApp GAS'}
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            {status?.gasDriveConfigured
              ? 'Server meneruskan unggahan gambar/video soal dan cadangan rekap nilai CSV langsung ke folder Google Drive madrasah melalui Web App GAS.'
              : 'Tempel skrip Code.gs di bawah ke script.google.com, deploy sebagai Web App, lalu masukkan GAS_DRIVE_WEBAPP_URL di Secrets.'}
          </p>
          {status?.gasFolderId && (
            <p className="text-[11px] font-mono text-slate-500 truncate">
              Folder ID Drive: {status.gasFolderId}
            </p>
          )}
          {testResult?.gasError && (
            <p className="text-[11px] text-red-700">Detail: {testResult.gasError}</p>
          )}
        </div>
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
