import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import type { SessionUser, SiteSettings } from '../types/cbt.ts';

interface LoginPageProps {
  siteSettings?: SiteSettings | null;
  onLoginSuccess: (user: SessionUser, token: string) => void;
}

const FALLBACK_SETTINGS: SiteSettings = {
  appName: 'AISA',
  schoolName: "MI Ma'arif Al Ihsan Soborejo",
  tagline: 'Al Ihsan Smart Asesment · Tahun Pelajaran 2026/2027',
  eyebrowText: 'Al Ihsan Smart Asesment · Literasi & Numerasi',
  heroTitle: 'Ujian Madrasah yang Jujur, Terukur, dan Terintegrasi',
  heroSubtitle:
    'Platform evaluasi digital AISA untuk Asesmen Sumatif Akhir Semester, Asesmen Tengah Semester, serta Try Out Literasi dan Numerasi dengan dukungan lampiran gambar, video, keamanan anti-kecurangan, dan database nilai instan.',
  loginHeading: 'Masuk ke Al Ihsan Smart Asesment',
  logoUrl: '/src/assets/images/aisa_madrasah_logo_1795493183530.jpg',
  backgroundImageUrl: '/src/assets/images/madrasah_campus_hero_1794802017792.jpg',
  showQuickDemo: false,
  updatedAt: '',
};

export const LoginPage: React.FC<LoginPageProps> = ({ siteSettings, onLoginSuccess }) => {
  const settings = siteSettings || FALLBACK_SETTINGS;

  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupUsername, setSetupUsername] = useState('');
  const [setupTitle, setSetupTitle] = useState('Administrator Utama & Kepala Proktor');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');

  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [logoImgFailed, setLogoImgFailed] = useState(false);

  useEffect(() => {
    setHeroImgFailed(false);
  }, [settings.backgroundImageUrl]);

  useEffect(() => {
    setLogoImgFailed(false);
  }, [settings.logoUrl]);

  useEffect(() => {
    fetch('/api/auth/bootstrap-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.needsAdminSetup === 'boolean') {
          setNeedsAdminSetup(data.needsAdminSetup);
        }
      })
      .catch(() => {});
  }, []);

  const submitCredentials = async (idToUse: string, secretToUse: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'auto',
          identifier: idToUse,
          secret: secretToUse,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal masuk ke sistem.');
        return;
      }
      onLoginSuccess(data.user, data.token);
    } catch {
      setError('Koneksi ke server terputus. Silakan coba kembali.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !secret.trim()) {
      setError('Mohon lengkapi identitas dan PIN/kata sandi terlebih dahulu.');
      return;
    }
    submitCredentials(identifier, secret);
  };

  const handleBootstrapAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!setupName.trim() || !setupUsername.trim() || setupPassword.length < 6) {
      setError('Nama lengkap, username, dan kata sandi minimal 6 karakter wajib diisi.');
      return;
    }
    if (setupPassword !== setupConfirm) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/bootstrap-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: setupName.trim(),
          username: setupUsername.trim(),
          title: setupTitle.trim(),
          password: setupPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal mengaktifkan akun Administrator.');
        if (res.status === 409) {
          setNeedsAdminSetup(false);
        }
        return;
      }
      onLoginSuccess(data.user, data.token);
    } catch {
      setError('Koneksi ke server terputus. Silakan coba kembali.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 grid grid-cols-1 lg:grid-cols-12 items-stretch">
      {/* Left Editorial Hero Column */}
      <div className="lg:col-span-7 relative min-h-[380px] lg:min-h-screen bg-slate-900 overflow-hidden flex flex-col justify-between p-8 lg:p-14">
        {settings.backgroundImageUrl && !heroImgFailed ? (
          <img
            src={settings.backgroundImageUrl}
            alt={`Latar halaman awal ${settings.schoolName}`}
            referrerPolicy="no-referrer"
            onError={() => setHeroImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950" />
        )}
        <div
          className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-slate-950/35"
          aria-hidden="true"
        />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-5">
            {settings.logoUrl && !logoImgFailed ? (
              <div className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 rounded-2xl bg-white p-2 flex items-center justify-center border-2 border-white/80 shadow-2xl ring-4 ring-emerald-400/20 shrink-0 overflow-hidden">
                <img
                  src={settings.logoUrl}
                  alt={`Logo ${settings.appName} — ${settings.schoolName}`}
                  referrerPolicy="no-referrer"
                  onError={() => setLogoImgFailed(true)}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-bold text-xl sm:text-2xl tracking-tight border-2 border-emerald-400/50 shadow-2xl shrink-0">
                {settings.appName.slice(0, 6)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white font-bold text-2xl sm:text-3xl tracking-tight leading-none">
                {settings.appName}
              </p>
              <p className="text-emerald-200 font-semibold text-sm sm:text-base mt-1.5">
                {settings.schoolName}
              </p>
              <p className="text-slate-300 text-xs sm:text-sm mt-0.5">{settings.tagline}</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-2xl mt-12 lg:mt-0">
          {settings.eyebrowText && (
            <p className="text-emerald-300 text-sm font-medium mb-3">{settings.eyebrowText}</p>
          )}
          <h1 className="text-3xl lg:text-5xl font-bold text-white tracking-tight leading-tight text-balance">
            {settings.heroTitle}
          </h1>
          {settings.heroSubtitle && (
            <p className="text-slate-200 text-base leading-relaxed mt-4 max-w-xl">
              {settings.heroSubtitle}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10 pt-8 border-t border-white/15">
            <div>
              <p className="text-white font-semibold text-sm">Anti-Kecurangan Aktif</p>
              <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                Kunci layar penuh, deteksi pindah tab otomatis, dan blokir salin-tempel.
              </p>
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Model Soal AKM Lengkap</p>
              <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                Pilihan ganda, pilihan ganda kompleks, dan esai berlampiran gambar serta video.
              </p>
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Nilai Instan &amp; Drive</p>
              <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                Skor otomatis masuk ke database nilai instan dan arsip Google Drive madrasah.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Form Column */}
      <div className="lg:col-span-5 flex items-center justify-center p-6 sm:p-10 lg:p-14 bg-white">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            {settings.logoUrl && !logoImgFailed ? (
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-white p-2 border border-slate-200 shadow-lg ring-4 ring-emerald-50 mx-auto mb-5 flex items-center justify-center overflow-hidden">
                <img
                  src={settings.logoUrl}
                  alt={`Logo ${settings.appName}`}
                  referrerPolicy="no-referrer"
                  onError={() => setLogoImgFailed(true)}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-emerald-700 text-white font-bold text-2xl tracking-tight border border-emerald-600 shadow-lg ring-4 ring-emerald-50 mx-auto mb-5 flex items-center justify-center">
                {settings.appName.slice(0, 6)}
              </div>
            )}
            <p className="text-xs font-semibold tracking-wide text-emerald-700 mb-1.5">
              {needsAdminSetup ? 'Aktivasi Awal Sistem' : `Gerbang Masuk ${settings.appName}`}
            </p>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight text-balance">
              {needsAdminSetup ? 'Buat Akun Administrator Pertama' : settings.loginHeading}
            </h2>
            <p className="text-sm text-slate-600 mt-1.5">
              {needsAdminSetup
                ? 'Belum ada akun Administrator terdaftar. Tetapkan akun Admin utama untuk mulai mengelola jadwal, guru, dan peserta ujian.'
                : 'Masukkan NISN & PIN untuk Peserta Ujian, atau Username & Kata Sandi untuk Guru dan Administrator.'}
            </p>
          </div>

          {needsAdminSetup ? (
            <form onSubmit={handleBootstrapAdmin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">
                  Nama Lengkap &amp; Gelar
                </label>
                <input
                  type="text"
                  required
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  placeholder="Nama kepala proktor / administrator"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-800 mb-1.5">
                    Username Admin
                  </label>
                  <input
                    type="text"
                    required
                    value={setupUsername}
                    onChange={(e) => setSetupUsername(e.target.value)}
                    placeholder="Contoh: admin"
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800 mb-1.5">
                    Jabatan
                  </label>
                  <input
                    type="text"
                    value={setupTitle}
                    onChange={(e) => setSetupTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">
                  Kata Sandi (minimal 6 karakter)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  placeholder="Buat kata sandi administrator"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">
                  Konfirmasi Kata Sandi
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={setupConfirm}
                  onChange={(e) => setSetupConfirm(e.target.value)}
                  placeholder="Ulangi kata sandi"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{loading ? 'Mengaktifkan...' : 'Aktifkan Administrator & Masuk'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-identifier"
                  className="block text-sm font-medium text-slate-800 mb-1.5"
                >
                  NISN / Username / NIP
                </label>
                <input
                  id="login-identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Masukkan NISN peserta atau username"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                />
              </div>

              <div>
                <label
                  htmlFor="login-secret"
                  className="block text-sm font-medium text-slate-800 mb-1.5"
                >
                  PIN Ujian / Kata Sandi
                </label>
                <div className="relative">
                  <input
                    id="login-secret"
                    type={showSecret ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="Masukkan PIN atau kata sandi"
                    className="w-full px-3.5 py-2.5 pr-11 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => !s)}
                    aria-label={showSecret ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>{loading ? 'Memverifikasi Akun...' : `Masuk ke ${settings.appName}`}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
