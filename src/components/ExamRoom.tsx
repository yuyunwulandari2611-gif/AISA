import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  Maximize2,
  Send,
  ShieldCheck,
  ZoomIn,
  X,
} from 'lucide-react';
import type {
  AntiCheatLog,
  Assessment,
  SafeQuestion,
  SessionUser,
  StudentAnswerPayload,
  SubmissionRecord,
} from '../types/cbt.ts';
import { authFetch } from '../lib/authClient.ts';

interface ExamRoomProps {
  user: SessionUser;
  assessment: Assessment;
  questions: SafeQuestion[];
  startedAt: string;
  onSubmitted: (result: SubmissionRecord) => void;
}

export const ExamRoom: React.FC<ExamRoomProps> = ({
  user,
  assessment,
  questions,
  startedAt,
  onSubmitted,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, StudentAnswerPayload>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState(assessment.durationMinutes * 60);
  const [violationCount, setViolationCount] = useState(0);
  const [securityWarning, setSecurityWarning] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; caption?: string } | null>(null);
  const [imgErrorIds, setImgErrorIds] = useState<Record<string, boolean>>({});

  const submittedRef = useRef(false);
  const violationCountRef = useRef(0);
  const lastViolationTimeRef = useRef(0);
  const startMsRef = useRef(Date.now());

  const currentQuestion = questions[currentIndex];

  const performSubmit = useCallback(
    async (autoLocked: boolean) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);

      const durationSeconds = Math.max(1, Math.round((Date.now() - startMsRef.current) / 1000));
      const payloadAnswers: StudentAnswerPayload[] = questions.map((q) => {
        return (
          answers[q.id] || {
            questionId: q.id,
          }
        );
      });

      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen().catch(() => {});
        }
        const res = await authFetch('/api/exam/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assessmentId: assessment.id,
            startedAt,
            durationSeconds,
            violationCount: violationCountRef.current,
            autoSubmittedBySecurity: autoLocked,
            answers: payloadAnswers,
          }),
        });
        const data = await res.json();
        if (res.ok && data.submission) {
          onSubmitted(data.submission);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [answers, assessment.id, onSubmitted, questions, startedAt]
  );

  const recordViolation = useCallback(
    async (eventType: AntiCheatLog['eventType'], detail: string) => {
      if (submittedRef.current) return;
      const now = Date.now();
      // Debounce rapid duplicate events (e.g. blur + visibilitychange firing together)
      if (now - lastViolationTimeRef.current < 1500) return;
      lastViolationTimeRef.current = now;

      const nextCount = violationCountRef.current + 1;
      violationCountRef.current = nextCount;
      setViolationCount(nextCount);

      authFetch('/api/anti-cheat/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId: assessment.id,
          assessmentTitle: assessment.title,
          eventType: nextCount >= assessment.maxViolations ? 'AUTO_LOCKOUT' : eventType,
          detail,
          violationNumber: nextCount,
        }),
      }).catch(() => {});

      if (nextCount >= assessment.maxViolations) {
        setSecurityWarning(
          `Batas pelanggaran (${assessment.maxViolations}x) tercapai. Ujian dikunci dan dikumpulkan otomatis.`
        );
        setTimeout(() => {
          performSubmit(true);
        }, 1200);
      } else {
        setSecurityWarning(
          `${detail} (Pelanggaran ${nextCount} dari ${assessment.maxViolations}). Jangan meninggalkan layar ujian.`
        );
      }
    },
    [assessment.id, assessment.maxViolations, assessment.title, performSubmit, user]
  );

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          performSubmit(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [performSubmit]);

  // Anti-cheat event listeners
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        recordViolation('TAB_SWITCH', 'Terdeteksi berpindah tab atau menyembunyikan jendela ujian.');
      }
    };

    const onWindowBlur = () => {
      recordViolation('WINDOW_BLUR', 'Fokus jendela ujian berpindah ke aplikasi atau jendela lain.');
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement && !submittedRef.current) {
        recordViolation('FULLSCREEN_EXIT', 'Mode layar penuh (Fullscreen) dinonaktifkan oleh peserta.');
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setSecurityWarning('Klik kanan dinonaktifkan selama asesmen berlangsung.');
    };

    const onCopyCutPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEssayField = target?.tagName === 'TEXTAREA';
      if (!isEssayField || e.type === 'paste') {
        e.preventDefault();
        setSecurityWarning('Aksi salin/tempel (Copy/Paste) diblokir oleh sistem keamanan CBT.');
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const blocked =
        e.key === 'F12' ||
        e.key === 'PrintScreen' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
        (e.ctrlKey && ['u', 'c', 'v', 'p'].includes(key));

      if (blocked) {
        e.preventDefault();
        recordViolation(
          'DEVTOOLS_SHORTCUT',
          `Menekan pintasan terlarang (${e.key}) saat ujian berlangsung.`
        );
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('copy', onCopyCutPaste);
    document.addEventListener('cut', onCopyCutPaste);
    document.addEventListener('paste', onCopyCutPaste);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('copy', onCopyCutPaste);
      document.removeEventListener('cut', onCopyCutPaste);
      document.removeEventListener('paste', onCopyCutPaste);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [recordViolation]);

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const handleSelectPg = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { questionId, selectedOptionId: optionId },
    }));
  };

  const handleTogglePgk = (questionId: string, optionId: string) => {
    setAnswers((prev) => {
      const existing = prev[questionId]?.selectedOptionIds || [];
      const next = existing.includes(optionId)
        ? existing.filter((id) => id !== optionId)
        : [...existing, optionId];
      return {
        ...prev,
        [questionId]: { questionId, selectedOptionIds: next },
      };
    });
  };

  const handleEssayChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { questionId, essayText: text },
    }));
  };

  const isQuestionAnswered = (q: SafeQuestion) => {
    const ans = answers[q.id];
    if (!ans) return false;
    if (q.type === 'pg') return Boolean(ans.selectedOptionId);
    if (q.type === 'pgk') return Boolean(ans.selectedOptionIds && ans.selectedOptionIds.length > 0);
    return Boolean(ans.essayText && ans.essayText.trim().length > 0);
  };

  const answeredCount = questions.filter(isQuestionAnswered).length;
  const flaggedCount = Object.values(flagged).filter(Boolean).length;

  const reenterFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // ignore if blocked by iframe policy
    }
    setSecurityWarning(null);
  };

  if (!currentQuestion) return null;

  const currentAnswer = answers[currentQuestion.id];
  const timerColor =
    secondsLeft <= 60
      ? 'text-red-700 bg-red-50 border-red-200'
      : secondsLeft <= 300
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : 'text-slate-900 bg-slate-100 border-slate-200';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col exam-protected">
      {/* Top Exam Control Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 truncate">
              {user.name} · NISN {user.identifier} · {user.className}
            </p>
            <h1 className="text-sm font-bold text-slate-900 truncate">
              {assessment.title}
            </h1>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-700">
              <ShieldCheck
                className={`w-4 h-4 ${violationCount > 0 ? 'text-amber-600' : 'text-emerald-700'}`}
              />
              <span className="font-mono tabular-nums whitespace-nowrap">
                Pelanggaran: {violationCount}/{assessment.maxViolations}
              </span>
            </div>

            <div
              className={`px-3 py-1.5 rounded-lg border font-mono text-sm font-bold tabular-nums whitespace-nowrap ${timerColor}`}
              aria-label="Sisa waktu ujian"
            >
              {formatTimer(secondsLeft)}
            </div>

            <button
              type="button"
              onClick={() => setShowSubmitConfirm(true)}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Kumpulkan Ujian</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Two-Zone Split AKM Exam Workspace */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Zone: Stimulus Wacana, Gambar & Video (7 cols) */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 lg:p-8 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-600">
              Soal {currentIndex + 1} dari {questions.length} · {currentQuestion.domain} ·{' '}
              {currentQuestion.cognitiveLevel} ·{' '}
              {currentQuestion.type === 'pg'
                ? 'Pilihan Ganda'
                : currentQuestion.type === 'pgk'
                  ? 'Pilihan Ganda Kompleks'
                  : 'Esai Uraian'}
            </p>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Bobot {currentQuestion.maxPoints} poin
            </span>
          </div>

          {currentQuestion.stimulusTitle && (
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {currentQuestion.stimulusTitle}
            </h2>
          )}

          {currentQuestion.stimulusPassage && (
            <div className="font-serif text-base text-slate-800 leading-relaxed whitespace-pre-line">
              {currentQuestion.stimulusPassage}
            </div>
          )}

          {/* Video Attachment */}
          {currentQuestion.videoUrl && (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-950">
              <video
                key={currentQuestion.videoUrl}
                controls
                preload="metadata"
                className="w-full max-h-[340px] object-contain bg-slate-950"
              >
                <source src={currentQuestion.videoUrl} type="video/mp4" />
                Browser Anda tidak mendukung pemutar video HTML5.
              </video>
              {currentQuestion.videoCaption && (
                <p className="px-4 py-2.5 text-xs text-slate-300 bg-slate-900">
                  {currentQuestion.videoCaption}
                </p>
              )}
            </div>
          )}

          {/* Image Attachment */}
          {currentQuestion.imageUrl && (
            <figure className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
              {!imgErrorIds[currentQuestion.id] ? (
                <div className="relative group">
                  <img
                    src={currentQuestion.imageUrl}
                    alt={currentQuestion.imageCaption || 'Lampiran gambar stimulus soal'}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setImgErrorIds((prev) => ({ ...prev, [currentQuestion.id]: true }))
                    }
                    className="w-full max-h-[360px] object-contain bg-white"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxImage({
                        url: currentQuestion.imageUrl!,
                        caption: currentQuestion.imageCaption,
                      })
                    }
                    className="absolute bottom-3 right-3 px-3 py-1.5 bg-slate-900/85 hover:bg-slate-900 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>Perbesar Gambar</span>
                  </button>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-100 text-slate-600 text-xs">
                  Lampiran gambar: {currentQuestion.imageCaption || 'Media stimulus soal'}
                </div>
              )}
              {currentQuestion.imageCaption && (
                <figcaption className="px-4 py-2.5 text-xs text-slate-600 border-t border-slate-200 bg-white">
                  {currentQuestion.imageCaption}
                </figcaption>
              )}
            </figure>
          )}
        </section>

        {/* Right Zone: Pertanyaan, Jawaban & Navigasi Nomor (5 cols) */}
        <section className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <p className="text-xs font-semibold text-emerald-700 mb-2">
                {currentQuestion.type === 'pg'
                  ? 'Pilih satu jawaban yang paling tepat'
                  : currentQuestion.type === 'pgk'
                    ? 'Pilihan Ganda Kompleks — Pilih lebih dari satu jawaban yang benar'
                    : 'Soal Esai — Tuliskan jawaban lengkap dan terstruktur'}
              </p>
              <p className="text-base font-semibold text-slate-900 leading-relaxed">
                {currentQuestion.prompt}
              </p>
            </div>

            {/* Pilihan Ganda (PG) */}
            {currentQuestion.type === 'pg' && (
              <div className="space-y-2.5" role="radiogroup" aria-label="Pilihan jawaban">
                {currentQuestion.options.map((opt) => {
                  const selected = currentAnswer?.selectedOptionId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectPg(currentQuestion.id, opt.id)}
                      className={`w-full text-left p-3.5 rounded-lg border transition-colors flex items-start gap-3 cursor-pointer ${
                        selected
                          ? 'border-emerald-700 bg-emerald-50/70 text-slate-900'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-md text-xs font-bold font-mono flex items-center justify-center shrink-0 ${
                          selected
                            ? 'bg-emerald-700 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {opt.label}
                      </span>
                      <div className="flex-1 min-w-0 space-y-2 pt-0.5">
                        {opt.text && <span className="text-sm leading-relaxed block">{opt.text}</span>}
                        {opt.imageUrl && (
                          <img
                            src={opt.imageUrl}
                            alt={`Pilihan ${opt.label}`}
                            referrerPolicy="no-referrer"
                            className="max-h-40 rounded-md border border-slate-200 bg-white p-1 object-contain"
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Pilihan Ganda Kompleks (PGK) */}
            {currentQuestion.type === 'pgk' && (
              <div className="space-y-2.5">
                {currentQuestion.options.map((opt) => {
                  const selectedIds = currentAnswer?.selectedOptionIds || [];
                  const checked = selectedIds.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleTogglePgk(currentQuestion.id, opt.id)}
                      className={`w-full text-left p-3.5 rounded-lg border transition-colors flex items-start gap-3 cursor-pointer ${
                        checked
                          ? 'border-emerald-700 bg-emerald-50/70 text-slate-900'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 mt-0.5 rounded border flex items-center justify-center shrink-0 ${
                          checked
                            ? 'bg-emerald-700 border-emerald-700 text-white'
                            : 'bg-white border-slate-300'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <div className="flex-1 min-w-0 space-y-2">
                        <span className="text-sm leading-relaxed block">
                          <strong className="font-mono mr-1.5">{opt.label}.</strong>
                          {opt.text}
                        </span>
                        {opt.imageUrl && (
                          <img
                            src={opt.imageUrl}
                            alt={`Pilihan ${opt.label}`}
                            referrerPolicy="no-referrer"
                            className="max-h-40 rounded-md border border-slate-200 bg-white p-1 object-contain"
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Esai / Uraian */}
            {currentQuestion.type === 'essay' && (
              <div className="space-y-2">
                <textarea
                  rows={6}
                  value={currentAnswer?.essayText || ''}
                  onChange={(e) => handleEssayChange(currentQuestion.id, e.target.value)}
                  placeholder="Tuliskan jawaban uraian Anda di sini secara jelas dan runtut..."
                  className="w-full p-3.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 leading-relaxed"
                />
                <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                  <span>Penilaian otomatis berbasis rubrik konsep kunci</span>
                  <span>
                    {(currentAnswer?.essayText || '').trim().split(/\s+/).filter(Boolean).length}{' '}
                    kata
                  </span>
                </div>
              </div>
            )}

            {/* Prev / Flag / Next Controls */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Sebelumnya</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setFlagged((prev) => ({
                    ...prev,
                    [currentQuestion.id]: !prev[currentQuestion.id],
                  }))
                }
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg border inline-flex items-center gap-1.5 cursor-pointer ${
                  flagged[currentQuestion.id]
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{flagged[currentQuestion.id] ? 'Ditandai Ragu' : 'Ragu-ragu'}</span>
              </button>

              {currentIndex < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Selanjutnya</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(true)}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Selesai</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Question Navigator Grid */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-800">Navigasi Nomor Soal</p>
              <p className="text-xs text-slate-500 font-mono tabular-nums">
                {answeredCount}/{questions.length} Terjawab
              </p>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {questions.map((q, idx) => {
                const isActive = idx === currentIndex;
                const isDone = isQuestionAnswered(q);
                const isFlagged = flagged[q.id];

                let style = 'bg-white border-slate-200 text-slate-700 hover:border-slate-400';
                if (isFlagged) {
                  style = 'bg-amber-50 border-amber-400 text-amber-900';
                } else if (isDone) {
                  style = 'bg-emerald-700 border-emerald-700 text-white';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-10 rounded-lg border text-xs font-bold font-mono tabular-nums transition-colors cursor-pointer ${style} ${
                      isActive ? 'ring-2 ring-slate-900 ring-offset-1' : ''
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* Anti-Cheat Warning Modal */}
      {securityWarning && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="bg-white border border-red-200 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-700 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold">Peringatan Keamanan Anti-Kecurangan</h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed mb-5">{securityWarning}</p>
            {violationCount < assessment.maxViolations && (
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={reenterFullscreen}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Kembali ke Layar Penuh</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Kumpulkan Jawaban Ujian?</h3>
            <p className="text-sm text-slate-600 mt-1.5">
              Setelah dikumpulkan, sistem penilaian otomatis akan langsung menghitung skor dan
              menyimpannya ke database nilai instan.
            </p>
            <div className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5 font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-600">Soal Terjawab</span>
                <span className="font-semibold text-emerald-700">
                  {answeredCount} dari {questions.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Ditandai Ragu-ragu</span>
                <span className="font-semibold text-amber-700">{flaggedCount} soal</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Pelanggaran Keamanan</span>
                <span className="font-semibold text-slate-900">{violationCount}x</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Periksa Kembali
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => performSubmit(false)}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {submitting ? 'Menilai Otomatis...' : 'Ya, Kumpulkan Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-6"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="max-w-4xl w-full bg-white rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <p className="text-xs font-medium text-slate-700">
                {lightboxImage.caption || 'Pratinjau Gambar Stimulus'}
              </p>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={lightboxImage.url}
              alt={lightboxImage.caption || 'Gambar stimulus diperbesar'}
              referrerPolicy="no-referrer"
              className="w-full max-h-[80vh] object-contain bg-slate-50"
            />
          </div>
        </div>
      )}
    </div>
  );
};
