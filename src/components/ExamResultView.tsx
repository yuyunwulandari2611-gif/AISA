import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { SubmissionRecord } from '../types/cbt.ts';
import { authFetch } from '../lib/authClient.ts';

interface ExamResultViewProps {
  submission: SubmissionRecord;
  onBack: () => void;
}

export const ExamResultView: React.FC<ExamResultViewProps> = ({
  submission: initialSubmission,
  onBack,
}) => {
  const [submission, setSubmission] = useState<SubmissionRecord>(initialSubmission);
  const [loadingDetails, setLoadingDetails] = useState(
    initialSubmission.gradedItems.length === 0
  );

  useEffect(() => {
    setSubmission(initialSubmission);
    if (initialSubmission.gradedItems.length > 0) {
      setLoadingDetails(false);
      return;
    }
    let cancelled = false;
    setLoadingDetails(true);
    authFetch(`/api/submissions/${encodeURIComponent(initialSubmission.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.submission) {
          setSubmission(d.submission);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetails(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSubmission]);

  const mins = Math.floor(submission.durationSeconds / 60);
  const secs = submission.durationSeconds % 60;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Portal Peserta</span>
          </button>
          <p className="text-xs text-slate-500 font-mono tabular-nums">
            ID Rekaman: {submission.id}
          </p>
        </div>

        {/* Summary Header Card */}
        <section className="bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
            <div>
              <p className="text-xs font-semibold text-emerald-700 mb-1">
                Penilaian Otomatis Instan Selesai
              </p>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {submission.assessmentTitle}
              </h1>
              <p className="text-sm text-slate-600 mt-1.5 font-mono tabular-nums">
                {submission.studentName} · NISN {submission.studentNisn} · {submission.className}
              </p>
            </div>

            <div className="text-left md:text-right shrink-0">
              <p className="text-xs text-slate-500">Nilai Akhir (Skala 100)</p>
              <p className="text-5xl font-bold text-emerald-700 font-mono tabular-nums mt-1">
                {submission.finalScore}
              </p>
              <p className="text-sm font-semibold text-slate-800 mt-1">{submission.predicate}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-6">
            <div>
              <p className="text-xs text-slate-500">Perolehan Poin</p>
              <p className="text-base font-bold text-slate-900 font-mono tabular-nums mt-1">
                {submission.totalPointsEarned} / {submission.totalPointsMax}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Durasi Pengerjaan</p>
              <p className="text-base font-bold text-slate-900 font-mono tabular-nums mt-1">
                {mins}m {secs}d
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Status Integritas</p>
              <p className="text-sm font-semibold mt-1 inline-flex items-center gap-1.5">
                {submission.violationCount === 0 ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span className="text-emerald-700">Bersih (0 Pelanggaran)</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span className="text-amber-700">
                      {submission.violationCount}x Peringatan
                    </span>
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Penyimpanan Nilai</p>
              <p className="text-sm font-semibold text-slate-800 mt-1 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>Tercatat di Database</span>
              </p>
            </div>
          </div>
        </section>

        {/* Domain Breakdown */}
        {submission.domainBreakdown.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-900 mb-4">
              Capaian per Domain Literasi &amp; Numerasi
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {submission.domainBreakdown.map((d) => (
                <div key={d.domain} className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{d.domain}</span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {d.earned}/{d.max} ({d.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-700 rounded-full"
                      style={{ width: `${Math.min(100, d.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Itemized Graded Feedback */}
        {loadingDetails ? (
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <p className="text-xs text-slate-500">
              Memuat rincian penilaian per butir soal...
            </p>
          </section>
        ) : (
          submission.gradedItems.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                Rincian Penilaian Otomatis per Butir Soal
              </h2>
              <div className="divide-y divide-slate-100">
              {submission.gradedItems.map((item) => (
                <div key={item.questionId} className="py-4 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-xs font-medium text-slate-500">
                      Soal {item.orderNumber} · {item.domain} ·{' '}
                      {item.type === 'pg'
                        ? 'Pilihan Ganda'
                        : item.type === 'pgk'
                          ? 'Pilihan Ganda Kompleks (MCMA)'
                          : item.type === 'pgk_kategori'
                            ? 'PG Kompleks Kategori'
                            : item.type === 'isian'
                              ? 'Isian Singkat'
                              : 'Uraian (Rubrik Otomatis)'}
                    </p>
                    <span className="text-sm font-bold font-mono tabular-nums text-slate-900 shrink-0">
                      {item.earnedPoints} / {item.maxPoints} poin
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-900">{item.prompt}</p>
                  <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <strong className="text-slate-900">Jawaban Anda:</strong>{' '}
                    {item.studentAnswerText}
                  </p>
                  <p className="text-xs text-slate-600">{item.feedback}</p>
                  {item.type === 'essay' && item.matchedKeywords.length > 0 && (
                    <p className="text-xs text-emerald-700">
                      Konsep kunci terpenuhi: {item.matchedKeywords.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
          )
        )}
      </div>
    </div>
  );
};
