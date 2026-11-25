import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Clock, KeyRound, LogOut, ShieldAlert, X } from 'lucide-react';
import type { Assessment, SafeQuestion, SessionUser, SiteSettings, SubmissionRecord } from '../types/cbt.ts';
import { authFetch } from '../lib/authClient.ts';

interface EnrichedAssessment extends Omit<Assessment, 'token'> {
  questionCount: number;
  submissionCount: number;
  mySubmission: SubmissionRecord | null;
}

interface StudentDashboardProps {
  user: SessionUser;
  siteSettings?: SiteSettings | null;
  onLogout: () => void;
  onStartExam: (assessment: Assessment, questions: SafeQuestion[], startedAt: string) => void;
  onViewResult: (submission: SubmissionRecord) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  user,
  siteSettings,
  onLogout,
  onStartExam,
  onViewResult,
}) => {
  const [activeTab, setActiveTab] = useState<'assessments' | 'history'>('assessments');
  const [assessments, setAssessments] = useState<EnrichedAssessment[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedAssessment, setSelectedAssessment] = useState<EnrichedAssessment | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [agreedIntegrity, setAgreedIntegrity] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [asmRes, subRes] = await Promise.all([
        authFetch('/api/assessments'),
        authFetch('/api/submissions'),
      ]);
      const asmData = await asmRes.json();
      const subData = await subRes.json();
      setAssessments(asmData.assessments || []);
      setSubmissions(subData.submissions || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user.identifier]);

  const handleOpenStartModal = (asm: EnrichedAssessment) => {
    setSelectedAssessment(asm);
    setTokenInput('');
    setAgreedIntegrity(false);
    setTokenError(null);
  };

  const handleVerifyAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssessment) return;
    if (!tokenInput.trim()) {
      setTokenError('Masukkan token ujian dari pengawas ruang.');
      return;
    }
    if (!agreedIntegrity) {
      setTokenError('Centang persetujuan pakta integritas anti-kecurangan.');
      return;
    }

    setVerifying(true);
    setTokenError(null);
    try {
      // Request fullscreen on user gesture before entering exam room
      try {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        // Fallback allowed if iframe blocks fullscreen, exam room monitors visibility & focus
      }

      const res = await authFetch(`/api/assessments/${selectedAssessment.id}/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTokenError(data.error || 'Token tidak valid.');
        return;
      }

      onStartExam(data.assessment, data.questions, data.startedAt);
    } catch {
      setTokenError('Gagal menghubungi server ujian.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            {siteSettings?.appName || 'TUNTAS'} Smart Assesment
          </span>

          <nav className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab('assessments')}
              className={`text-sm font-medium py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'assessments'
                  ? 'text-emerald-700 underline underline-offset-8 decoration-2'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daftar Asesmen
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`text-sm font-medium py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'history'
                  ? 'text-emerald-700 underline underline-offset-8 decoration-2'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Riwayat Nilai
            </button>
          </nav>

          <button
            type="button"
            onClick={onLogout}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        {/* Student Identity Strip */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-emerald-700 mb-1">
              Peserta Ujian Terdaftar
            </p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {user.name}
            </h1>
            <p className="text-sm text-slate-600 mt-1 font-mono tabular-nums">
              NISN {user.identifier} · {user.className} ·{' '}
              {siteSettings?.schoolName || "MI Ma'arif Al Ihsan Soborejo"}
            </p>
          </div>
          <div className="flex items-center gap-8 border-t md:border-t-0 pt-4 md:pt-0 border-slate-100">
            <div>
              <p className="text-xs text-slate-500">Asesmen Aktif</p>
              <p className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                {assessments.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Selesai Dikerjakan</p>
              <p className="text-xl font-bold text-emerald-700 font-mono tabular-nums mt-0.5">
                {submissions.length}
              </p>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : activeTab === 'assessments' ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-900">
                Jadwal &amp; Paket Asesmen Tersedia
              </h2>
              <p className="text-xs text-slate-500">
                Gunakan token ruang yang diberikan oleh pengawas atau guru
              </p>
            </div>

            {assessments.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-900">
                  Belum ada asesmen aktif saat ini.
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Silakan hubungi guru atau proktor untuk mengaktifkan jadwal ujian.
                </p>
              </div>
            ) : (
              assessments.map((asm) => {
                const sub = asm.mySubmission;
                return (
                  <article
                    key={asm.id}
                    className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6"
                  >
                    <div className="space-y-2 max-w-2xl">
                      <p className="text-xs text-slate-500">
                        {asm.category} · {asm.gradeLevel} · Semester {asm.semester} {asm.academicYear}
                      </p>
                      <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                        {asm.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1">
                        <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {asm.durationMinutes} menit
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{asm.questionCount} butir soal</span>
                        <span aria-hidden="true">·</span>
                        <span>Batas pelanggaran: {asm.maxViolations}x</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {sub ? (
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Nilai Instan</p>
                            <p className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">
                              {sub.finalScore}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onViewResult(sub)}
                            className="px-4 py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                            <span>Lihat Rincian Nilai</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenStartModal(asm)}
                          className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
                        >
                          <span>Mulai Asesmen</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </section>
        ) : (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Riwayat Nilai Asesmen Saya
            </h2>

            {submissions.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                <p className="text-sm font-medium text-slate-900">
                  Belum ada riwayat nilai tersimpan.
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Nilai akan muncul secara instan setelah Anda menyelesaikan ujian.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Asesmen</th>
                      <th className="py-3 px-4">Waktu Kumpul</th>
                      <th className="py-3 px-4 text-right">Pelanggaran</th>
                      <th className="py-3 px-4 text-right">Nilai</th>
                      <th className="py-3 px-4">Predikat</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {submissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-4 font-medium text-slate-900">
                          {sub.assessmentTitle}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600 font-mono tabular-nums">
                          {new Date(sub.submittedAt).toLocaleString('id-ID')}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                          {sub.violationCount === 0 ? (
                            <span className="text-emerald-700 font-medium">0 · Bersih</span>
                          ) : (
                            <span className="text-amber-700 font-medium">
                              {sub.violationCount}x Peringatan
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                          {sub.finalScore}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-700">{sub.predicate}</td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onViewResult(sub)}
                            className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            Buka Transkrip
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Token Verification & Anti-Cheat Integrity Pact Modal */}
      {selectedAssessment && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-token-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-xs font-medium text-emerald-700">
                  Konfirmasi Sesi &amp; Pakta Integritas
                </p>
                <h3 id="modal-token-title" className="text-lg font-bold text-slate-900 mt-1">
                  {selectedAssessment.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAssessment(null)}
                aria-label="Tutup modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1.5 mb-5">
              <p className="font-semibold inline-flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-700" />
                Aturan Keamanan Anti-Kecurangan Aktif
              </p>
              <ul className="list-disc pl-5 space-y-1 leading-relaxed">
                <li>Ruang ujian berjalan dalam mode Layar Penuh (Fullscreen).</li>
                <li>Dilarang berpindah tab browser, membuka aplikasi lain, atau menyalin teks soal.</li>
                <li>
                  Pelanggaran tercatat otomatis ke pengawas. Melebihi{' '}
                  <strong className="font-mono">{selectedAssessment.maxViolations}x</strong>{' '}
                  pelanggaran akan mengunci dan mengumpulkan ujian secara otomatis.
                </li>
              </ul>
            </div>

            <form onSubmit={handleVerifyAndStart} className="space-y-4">
              <div>
                <label
                  htmlFor="exam-token-input"
                  className="block text-sm font-medium text-slate-800 mb-1.5"
                >
                  Token Sesi Ujian
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="exam-token-input"
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                    placeholder="Masukkan token sesi ujian dari pengawas"
                    className="w-full pl-10 pr-4 py-2.5 text-sm font-mono uppercase tracking-wider bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedIntegrity}
                  onChange={(e) => setAgreedIntegrity(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                />
                <span>
                  Saya berjanji mengerjakan asesmen ini dengan jujur, mandiri, dan mematuhi
                  seluruh ketentuan pengawasan digital madrasah.
                </span>
              </label>

              {tokenError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs">
                  {tokenError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedAssessment(null)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={verifying}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {verifying ? 'Memuat Soal...' : 'Aktifkan Mode Terkunci & Mulai'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
