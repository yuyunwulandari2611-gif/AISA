import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import type { DriveAsset, SiteSettings } from '../types/cbt.ts';
import { authFetch } from '../lib/authClient.ts';

interface LandingSettingsPanelProps {
  settings: SiteSettings;
  driveAssets: DriveAsset[];
  uploaderName: string;
  actorRole: string;
  actorId: string;
  onAssetUploaded: (asset: DriveAsset) => void;
  onSaved: (settings: SiteSettings) => void;
}

const DEFAULT_HERO_BG = '/src/assets/images/madrasah_campus_hero_1794802017792.jpg';
const DEFAULT_LOGO_URL = '/src/assets/images/aisa_madrasah_logo_1795493183530.jpg';

export const LandingSettingsPanel: React.FC<LandingSettingsPanelProps> = ({
  settings,
  driveAssets,
  uploaderName,
  actorRole,
  actorId,
  onAssetUploaded,
  onSaved,
}) => {
  const [draft, setDraft] = useState<SiteSettings>(settings);
  const [uploadingTarget, setUploadingTarget] = useState<'logo' | 'bg' | null>(null);
  const [pickerTarget, setPickerTarget] = useState<'logo' | 'bg' | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const imageAssets = driveAssets.filter((a) => a.mediaKind === 'image');

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'logo' | 'bg'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingTarget(target);
    setFeedback(null);

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
          mimeType: file.type || 'image/png',
          base64Data,
          uploadedBy: uploaderName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ kind: 'err', text: data.error || 'Gagal mengunggah gambar.' });
        return;
      }

      onAssetUploaded(data.asset);
      setDraft((prev) => ({
        ...prev,
        [target === 'logo' ? 'logoUrl' : 'backgroundImageUrl']: data.asset.url,
      }));
      setFeedback({
        kind: 'ok',
        text: `${target === 'logo' ? 'Logo' : 'Gambar latar'} berhasil diunggah. Klik "Simpan Pengaturan Halaman Awal" untuk menerapkannya.`,
      });
    } catch {
      setFeedback({ kind: 'err', text: 'Gagal membaca atau mengunggah berkas gambar.' });
    } finally {
      setUploadingTarget(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ kind: 'err', text: data.error || 'Gagal menyimpan pengaturan.' });
        return;
      }
      setDraft(data.settings);
      onSaved(data.settings);
      setFeedback({
        kind: 'ok',
        text: 'Pengaturan halaman awal, logo, dan gambar latar berhasil disimpan.',
      });
    } catch {
      setFeedback({ kind: 'err', text: 'Gagal terhubung ke server saat menyimpan.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setFeedback(null);
    try {
      const res = await authFetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reset: true }),
      });
      const data = await res.json();
      if (res.ok && data.settings) {
        setDraft(data.settings);
        onSaved(data.settings);
        setFeedback({
          kind: 'ok',
          text: 'Tampilan halaman awal dikembalikan ke pengaturan bawaan AISA.',
        });
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          Pengaturan Halaman Awal (Login &amp; Identitas Madrasah)
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          Sesuaikan logo aplikasi/madrasah, gambar latar halaman depan, judul sambutan, serta
          identitas pada gerbang masuk AISA.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg border text-xs ${
            feedback.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form Settings */}
        <form onSubmit={handleSave} className="lg:col-span-7 space-y-5">
          {/* Logo & Background Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Logo Section */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 inline-flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-emerald-700" />
                  Logo Aplikasi / Madrasah
                </span>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, logoUrl: DEFAULT_LOGO_URL }))
                    }
                    className="text-[11px] font-medium text-emerald-700 hover:underline cursor-pointer"
                  >
                    Logo Bawaan
                  </button>
                  {draft.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, logoUrl: '' }))}
                      className="text-[11px] font-medium text-red-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="h-24 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center p-2 overflow-hidden">
                {draft.logoUrl ? (
                  <img
                    src={draft.logoUrl}
                    alt="Pratinjau logo"
                    className="max-h-20 max-w-full object-contain"
                  />
                ) : (
                  <div className="text-center">
                    <div className="w-10 h-10 rounded-lg bg-emerald-700 text-white font-bold text-xs flex items-center justify-center mx-auto">
                      {(draft.appName || 'AISA').slice(0, 6)}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Menggunakan inisial teks</p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingTarget === 'logo' ? 'Mengunggah...' : 'Unggah Logo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e, 'logo')}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setPickerTarget(pickerTarget === 'logo' ? null : 'logo')}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Pilih dari Galeri
                </button>
              </div>

              <input
                type="text"
                value={draft.logoUrl}
                onChange={(e) => setDraft((prev) => ({ ...prev, logoUrl: e.target.value }))}
                placeholder="Atau tempel URL logo (PNG/SVG/JPG)..."
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>

            {/* Background Image Section */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 inline-flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-emerald-700" />
                  Gambar Latar Halaman Awal
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, backgroundImageUrl: DEFAULT_HERO_BG }))
                  }
                  className="text-[11px] font-medium text-emerald-700 hover:underline cursor-pointer"
                >
                  Bawaan Kampus
                </button>
              </div>

              <div className="h-24 rounded-lg border border-slate-200 bg-slate-900 overflow-hidden relative">
                {draft.backgroundImageUrl ? (
                  <img
                    src={draft.backgroundImageUrl}
                    alt="Pratinjau gambar latar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 flex items-center justify-center">
                    <span className="text-[11px] text-slate-300">Gradien Warna Madrasah</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingTarget === 'bg' ? 'Mengunggah...' : 'Unggah Latar'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e, 'bg')}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setPickerTarget(pickerTarget === 'bg' ? null : 'bg')}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Pilih dari Galeri
                </button>
              </div>

              <input
                type="text"
                value={draft.backgroundImageUrl}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, backgroundImageUrl: e.target.value }))
                }
                placeholder="URL gambar latar (kosongkan untuk gradien polos)"
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Inline Gallery Picker */}
          {pickerTarget && (
            <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-900">
                  Pilih Gambar untuk {pickerTarget === 'logo' ? 'Logo' : 'Gambar Latar'} dari
                  Galeri Drive &amp; Madrasah
                </p>
                <button
                  type="button"
                  onClick={() => setPickerTarget(null)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    setDraft((prev) => ({
                      ...prev,
                      [pickerTarget === 'logo' ? 'logoUrl' : 'backgroundImageUrl']:
                        DEFAULT_HERO_BG,
                    }));
                    setPickerTarget(null);
                  }}
                  className="p-2 bg-white border border-slate-200 hover:border-emerald-600 rounded-lg text-left space-y-1.5 cursor-pointer"
                >
                  <img
                    src={DEFAULT_HERO_BG}
                    alt="Kampus Madrasah"
                    className="w-full h-16 object-cover rounded"
                  />
                  <p className="text-[11px] font-medium text-slate-700 truncate">
                    Gedung Madrasah Bawaan
                  </p>
                </button>
                {imageAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      setDraft((prev) => ({
                        ...prev,
                        [pickerTarget === 'logo' ? 'logoUrl' : 'backgroundImageUrl']: asset.url,
                      }));
                      setPickerTarget(null);
                    }}
                    className="p-2 bg-white border border-slate-200 hover:border-emerald-600 rounded-lg text-left space-y-1.5 cursor-pointer"
                  >
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-16 object-cover rounded"
                    />
                    <p className="text-[11px] font-medium text-slate-700 truncate">{asset.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Texts & Behavior Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Teks Identitas &amp; Sambutan</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Singkat Aplikasi
                </label>
                <input
                  type="text"
                  required
                  value={draft.appName}
                  onChange={(e) => setDraft((prev) => ({ ...prev, appName: e.target.value }))}
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Madrasah / Satuan Pendidikan
                </label>
                <input
                  type="text"
                  required
                  value={draft.schoolName}
                  onChange={(e) => setDraft((prev) => ({ ...prev, schoolName: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Sub-Identitas / Tahun Pelajaran
                </label>
                <input
                  type="text"
                  value={draft.tagline}
                  onChange={(e) => setDraft((prev) => ({ ...prev, tagline: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Teks Pembuka Atas (Eyebrow)
                </label>
                <input
                  type="text"
                  value={draft.eyebrowText}
                  onChange={(e) => setDraft((prev) => ({ ...prev, eyebrowText: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Judul Utama Halaman Awal
              </label>
              <input
                type="text"
                required
                value={draft.heroTitle}
                onChange={(e) => setDraft((prev) => ({ ...prev, heroTitle: e.target.value }))}
                className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Deskripsi Ringkas Halaman Awal
              </label>
              <textarea
                rows={3}
                value={draft.heroSubtitle}
                onChange={(e) => setDraft((prev) => ({ ...prev, heroSubtitle: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Judul Formulir Login
              </label>
              <input
                type="text"
                required
                value={draft.loginHeading}
                onChange={(e) => setDraft((prev) => ({ ...prev, loginHeading: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={resetting}
              onClick={handleReset}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{resetting ? 'Mengembalikan...' : 'Reset ke Pengaturan Awal'}</span>
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan Halaman Awal'}</span>
            </button>
          </div>
        </form>

        {/* Live Preview Column */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3 lg:sticky lg:top-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900">Pratinjau Langsung Halaman Awal</h3>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden grid grid-cols-12 min-h-[340px] shadow-sm">
            {/* Mini Hero */}
            <div className="col-span-7 relative bg-slate-900 p-4 flex flex-col justify-between overflow-hidden">
              {draft.backgroundImageUrl ? (
                <img
                  src={draft.backgroundImageUrl}
                  alt="Preview latar"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-slate-950/40" />

              <div className="relative z-10 flex items-center gap-2.5">
                {draft.logoUrl ? (
                  <div className="w-11 h-11 rounded-lg bg-white p-1 flex items-center justify-center shadow-md shrink-0 overflow-hidden">
                    <img
                      src={draft.logoUrl}
                      alt="Logo mini"
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {(draft.appName || 'AISA').slice(0, 5)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{draft.appName}</p>
                  <p className="text-[9px] text-emerald-200 truncate">{draft.schoolName}</p>
                  <p className="text-[8px] text-slate-300 truncate">{draft.tagline}</p>
                </div>
              </div>

              <div className="relative z-10 space-y-1.5 mt-8">
                <p className="text-[9px] font-medium text-emerald-300 line-clamp-1">
                  {draft.eyebrowText}
                </p>
                <p className="text-sm font-bold text-white leading-snug line-clamp-3">
                  {draft.heroTitle}
                </p>
                <p className="text-[9px] text-slate-200 leading-relaxed line-clamp-3">
                  {draft.heroSubtitle}
                </p>
              </div>
            </div>

            {/* Mini Form */}
            <div className="col-span-5 bg-white p-4 flex flex-col justify-center space-y-2.5 text-center">
              {draft.logoUrl ? (
                <div className="w-12 h-12 rounded-lg bg-white p-1 border border-slate-200 shadow-sm mx-auto flex items-center justify-center overflow-hidden">
                  <img
                    src={draft.logoUrl}
                    alt="Logo kolom login"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-lg bg-emerald-700 text-white text-[10px] font-bold mx-auto flex items-center justify-center">
                  {(draft.appName || 'AISA').slice(0, 5)}
                </div>
              )}
              <p className="text-[9px] font-semibold text-emerald-700">
                Gerbang Masuk {draft.appName}
              </p>
              <p className="text-xs font-bold text-slate-900 leading-tight line-clamp-2">
                {draft.loginHeading}
              </p>
              <div className="space-y-1.5 text-left">
                <div className="h-5 rounded border border-slate-200 bg-slate-50" />
                <div className="h-5 rounded border border-slate-200 bg-slate-50" />
                <div className="h-6 rounded bg-emerald-700 text-white text-[9px] font-semibold flex items-center justify-center">
                  Masuk
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
