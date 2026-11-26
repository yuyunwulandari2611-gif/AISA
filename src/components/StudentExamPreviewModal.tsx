import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Flag,
  KeyRound,
  RotateCcw,
  ShieldCheck,
  X,
  ZoomIn,
} from 'lucide-react';
import type {
  Assessment,
  Question,
  StudentAnswerPayload,
} from '../types/cbt.ts';
import {
  BidiParagraphs,
  formatContextualNumber,
  getBidiInputClass,
  getBidiInputDirection,
  isPureArabicParagraph,
} from './BidiText.tsx';

interface StudentExamPreviewModalProps {
  assessment: Assessment;
  questions: Question[];
  initialQuestionIndex?: number;
  viewerName: string;
  onEditQuestion?: (question: Question) => void;
  onClose: () => void;
}

export const StudentExamPreviewModal: React.FC<StudentExamPreviewModalProps> = ({
  assessment,
  questions,
  initialQuestionIndex = 0,
  viewerName,
  onEditQuestion,
  onClose,
}) => {
  const safeInitialIndex = Math.max(
    0,
    Math.min(initialQuestionIndex, Math.max(0, questions.length - 1))
  );

  const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
  const [answers, setAnswers] = useState<Record<string, StudentAnswerPayload>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; caption?: string } | null>(
    null
  );
  const [imgErrorIds, setImgErrorIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCurrentIndex(safeInitialIndex);
  }, [safeInitialIndex]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxImage) setLightboxImage(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxImage, onClose]);

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

  const currentAnswer = answers[currentQuestion.id];

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

  const handleSelectCategory = (questionId: string, optionId: string, side: 'A' | 'B') => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        questionId,
        categoryAnswers: {
          ...(prev[questionId]?.categoryAnswers || {}),
          [optionId]: side,
        },
      },
    }));
  };

  const handleShortAnswerChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { questionId, shortAnswerText: text },
    }));
  };

  const handleEssayChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { questionId, essayText: text },
    }));
  };

  const isQuestionAnswered = (q: Question) => {
    const ans = answers[q.id];
    if (!ans) return false;
    if (q.type === 'pg') return Boolean(ans.selectedOptionId);
    if (q.type === 'pgk') return Boolean(ans.selectedOptionIds && ans.selectedOptionIds.length > 0);
    if (q.type === 'pgk_kategori') {
      return (
        q.options.length > 0 &&
        q.options.every(
          (o) => ans.categoryAnswers?.[o.id] === 'A' || ans.categoryAnswers?.[o.id] === 'B'
        )
      );
    }
    if (q.type === 'isian') {
      return Boolean(ans.shortAnswerText && ans.shortAnswerText.trim().length > 0);
    }
    return Boolean(ans.essayText && ans.essayText.trim().length > 0);
  };

  const answeredCount = questions.filter(isQuestionAnswered).length;
  const formattedDuration = `${String(assessment.durationMinutes).padStart(2, '0')}:00`;

  const catLabels: [string, string] =
    currentQuestion.categoryLabels ||
    currentQuestion.options.find((o) => Array.isArray(o.categoryPair))?.categoryPair || [
      'Sesuai',
      'Tidak Sesuai',
    ];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-50 flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau Tampilan Soal di Dashbor Siswa"
    >
      {/* Teacher Preview Banner */}
      <div className="bg-slate-900 text-white px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Eye className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-xs font-medium text-slate-100 truncate">
            <strong className="font-semibold text-white">Pratinjau Tampilan Dashbor Siswa</strong>
            <span className="hidden sm:inline text-slate-300">
              {' '}
              · Simulasi interaktif untuk Guru (jawaban uji coba tidak disimpan ke database)
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowAnswerKey((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
              showAnswerKey
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{showAnswerKey ? 'Sembunyikan Kunci' : 'Tampilkan Kunci'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAnswers({});
              setFlagged({});
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Simulasi</span>
          </button>

          {onEditQuestion && (
            <button
              type="button"
              onClick={() => onEditQuestion(currentQuestion)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-900 hover:bg-slate-100 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Soal Ini</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white inline-flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Tutup Pratinjau</span>
          </button>
        </div>
      </div>

      {/* Simulated Student Exam Top Header (mirrors ExamRoom.tsx) */}
      <header className="bg-white border-b border-slate-200 shrink-0">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 truncate">
              Contoh Peserta ({viewerName}) · NISN 0000000000 · {assessment.gradeLevel}
            </p>
            <h1 className="text-sm font-bold text-slate-900 truncate">{assessment.title}</h1>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-700">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span className="font-mono tabular-nums whitespace-nowrap">
                Pelanggaran: 0/{assessment.maxViolations}
              </span>
            </div>

            <div className="px-3 py-1.5 rounded-lg border font-mono text-sm font-bold tabular-nums whitespace-nowrap text-slate-900 bg-slate-100 border-slate-200">
              {formattedDuration}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Selesai Pratinjau
            </button>
          </div>
        </div>
      </header>

      {/* Scrollable Two-Zone AKM Workspace (mirrors ExamRoom.tsx) */}
      <div className="flex-1 overflow-y-auto">
        <main className="max-w-[1440px] w-full mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Zone: Stimulus Wacana, Gambar & Video (7 cols) */}
          <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 lg:p-8 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <p className="text-xs font-medium text-slate-600">
                Soal {currentIndex + 1} dari {questions.length} · {currentQuestion.domain} ·{' '}
                {currentQuestion.cognitiveLevel} ·{' '}
                {currentQuestion.type === 'pg'
                  ? 'Pilihan Ganda'
                  : currentQuestion.type === 'pgk'
                    ? 'Pilihan Ganda Kompleks (MCMA)'
                    : currentQuestion.type === 'pgk_kategori'
                      ? 'PG Kompleks Kategori'
                      : currentQuestion.type === 'isian'
                        ? 'Isian Singkat'
                        : 'Uraian'}
              </p>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                Bobot {currentQuestion.maxPoints} poin
              </span>
            </div>

            {currentQuestion.stimulusTitle && (
              <BidiParagraphs text={currentQuestion.stimulusTitle} variant="title" />
            )}

            {currentQuestion.stimulusPassage && (
              <BidiParagraphs text={currentQuestion.stimulusPassage} variant="passage" />
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

            {!currentQuestion.stimulusTitle &&
              !currentQuestion.stimulusPassage &&
              !currentQuestion.imageUrl &&
              !currentQuestion.videoUrl && (
                <div className="py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-center">
                  <p className="text-xs text-slate-500">
                    Butir soal ini tidak memiliki wacana/gambar/video stimulus tambahan. Siswa akan
                    langsung membaca pokok pertanyaan di panel sebelah kanan.
                  </p>
                </div>
              )}
          </section>

          {/* Right Zone: Pertanyaan, Jawaban & Navigasi Nomor (5 cols) */}
          <section className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div>
                <p className="text-xs font-semibold text-emerald-700 mb-2">
                  {currentQuestion.type === 'pg'
                    ? 'Pilihan Ganda — Pilih satu jawaban yang paling tepat'
                    : currentQuestion.type === 'pgk'
                      ? 'Pilihan Ganda Kompleks (MCMA) — Pilih lebih dari satu jawaban yang benar'
                      : currentQuestion.type === 'pgk_kategori'
                        ? `PG Kompleks Kategori — Tentukan ${catLabels.join(' atau ')} untuk setiap pernyataan`
                        : currentQuestion.type === 'isian'
                          ? 'Isian Singkat — Tuliskan jawaban singkat yang tepat'
                          : 'Soal Uraian — Tuliskan jawaban lengkap dan terstruktur'}
                </p>
                <BidiParagraphs text={currentQuestion.prompt} variant="prompt" />
              </div>

              {/* Pilihan Ganda (PG) */}
              {currentQuestion.type === 'pg' && (
                <div className="space-y-2.5" role="radiogroup" aria-label="Pilihan jawaban">
                  {currentQuestion.options.map((opt) => {
                    const selected = currentAnswer?.selectedOptionId === opt.id;
                    const isKey = showAnswerKey && currentQuestion.correctOptionId === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectPg(currentQuestion.id, opt.id)}
                        className={`w-full text-left p-3.5 rounded-lg border transition-colors flex items-start gap-3 cursor-pointer ${
                          selected
                            ? 'border-emerald-700 bg-emerald-50/70 text-slate-900'
                            : isKey
                              ? 'border-emerald-400 bg-emerald-50/30 text-slate-900'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800'
                        }`}
                      >
                        <span
                          className={`w-7 h-7 rounded-md text-xs font-bold font-mono flex items-center justify-center shrink-0 mt-0.5 ${
                            selected
                              ? 'bg-emerald-700 text-white'
                              : isKey
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {formatContextualNumber(opt.label, opt.text || '')}
                        </span>
                        <div className="flex-1 min-w-0 space-y-2 pt-0.5">
                          {opt.text && <BidiParagraphs text={opt.text} variant="option" />}
                          {opt.imageUrl && (
                            <img
                              src={opt.imageUrl}
                              alt={`Pilihan ${opt.label}`}
                              referrerPolicy="no-referrer"
                              className="max-h-40 rounded-md border border-slate-200 bg-white p-1 object-contain"
                            />
                          )}
                          {isKey && (
                            <span className="inline-block text-[11px] font-semibold text-emerald-700">
                              Kunci Jawaban
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Pilihan Ganda Kompleks MCMA (PGK) */}
              {currentQuestion.type === 'pgk' && (
                <div className="space-y-2.5">
                  {currentQuestion.options.map((opt) => {
                    const selectedIds = currentAnswer?.selectedOptionIds || [];
                    const checked = selectedIds.includes(opt.id);
                    const isKey =
                      showAnswerKey && (currentQuestion.correctOptionIds || []).includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleTogglePgk(currentQuestion.id, opt.id)}
                        className={`w-full text-left p-3.5 rounded-lg border transition-colors flex items-start gap-3 cursor-pointer ${
                          checked
                            ? 'border-emerald-700 bg-emerald-50/70 text-slate-900'
                            : isKey
                              ? 'border-emerald-400 bg-emerald-50/30 text-slate-900'
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
                          <div className="flex items-start gap-2">
                            <span className="font-mono text-xs font-bold text-slate-600 shrink-0 pt-1">
                              {formatContextualNumber(opt.label, opt.text || '')}.
                            </span>
                            <div className="flex-1 min-w-0">
                              {opt.text && <BidiParagraphs text={opt.text} variant="option" />}
                            </div>
                          </div>
                          {opt.imageUrl && (
                            <img
                              src={opt.imageUrl}
                              alt={`Pilihan ${opt.label}`}
                              referrerPolicy="no-referrer"
                              className="max-h-40 rounded-md border border-slate-200 bg-white p-1 object-contain"
                            />
                          )}
                          {isKey && (
                            <span className="inline-block text-[11px] font-semibold text-emerald-700">
                              Kunci Jawaban Benar
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Pilihan Ganda Kompleks Kategori */}
              {currentQuestion.type === 'pgk_kategori' && (() => {
                const catMap = currentAnswer?.categoryAnswers || {};
                const completedRows = currentQuestion.options.filter(
                  (o) => catMap[o.id] === 'A' || catMap[o.id] === 'B'
                ).length;

                return (
                  <div className="space-y-2.5">
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-800">
                            <th className="py-2.5 px-3">Pernyataan</th>
                            <th className="py-2.5 px-2.5 text-center w-28">{catLabels[0]}</th>
                            <th className="py-2.5 px-2.5 text-center w-28">{catLabels[1]}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {currentQuestion.options.map((opt, idx) => {
                            const picked = catMap[opt.id];
                            const keyEntry = (currentQuestion.correctOptionIds || []).find((k) =>
                              k.startsWith(`${opt.id}:`)
                            );
                            const expectedSide = keyEntry?.split(':')[1] === 'B' ? 'B' : 'A';
                            return (
                              <tr key={opt.id} className="bg-white hover:bg-slate-50/70">
                                <td className="py-3 px-3 align-top text-slate-800">
                                  {isPureArabicParagraph(opt.text) ? (
                                    <div dir="rtl" className="flex items-start gap-2 text-right">
                                      <span className="font-arabic text-base font-bold text-slate-600 shrink-0 pt-0.5">
                                        {formatContextualNumber(idx + 1, opt.text)}.
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <BidiParagraphs text={opt.text} variant="option" />
                                      </div>
                                    </div>
                                  ) : (
                                    <div dir="ltr" className="flex items-start gap-2 text-left">
                                      <span className="font-mono text-xs font-semibold text-slate-500 shrink-0 pt-1">
                                        {idx + 1}.
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <BidiParagraphs text={opt.text} variant="option" />
                                      </div>
                                    </div>
                                  )}
                                  {opt.imageUrl && (
                                    <img
                                      src={opt.imageUrl}
                                      alt={`Pernyataan ${idx + 1}`}
                                      referrerPolicy="no-referrer"
                                      className="mt-2 max-h-28 rounded border border-slate-200 bg-white p-0.5 object-contain"
                                    />
                                  )}
                                </td>
                                <td className="py-3 px-2.5 text-center align-middle">
                                  <button
                                    type="button"
                                    aria-label={`${catLabels[0]} untuk pernyataan ${idx + 1}`}
                                    onClick={() =>
                                      handleSelectCategory(currentQuestion.id, opt.id, 'A')
                                    }
                                    className={`w-7 h-7 rounded-full border inline-flex items-center justify-center transition-colors cursor-pointer ${
                                      picked === 'A'
                                        ? 'bg-emerald-700 border-emerald-700 text-white'
                                        : showAnswerKey && expectedSide === 'A'
                                          ? 'bg-emerald-50 border-emerald-600 text-emerald-700 ring-2 ring-emerald-200'
                                          : 'bg-white border-slate-300 hover:border-emerald-600'
                                    }`}
                                  >
                                    {(picked === 'A' || (showAnswerKey && expectedSide === 'A')) && (
                                      <Check className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </td>
                                <td className="py-3 px-2.5 text-center align-middle">
                                  <button
                                    type="button"
                                    aria-label={`${catLabels[1]} untuk pernyataan ${idx + 1}`}
                                    onClick={() =>
                                      handleSelectCategory(currentQuestion.id, opt.id, 'B')
                                    }
                                    className={`w-7 h-7 rounded-full border inline-flex items-center justify-center transition-colors cursor-pointer ${
                                      picked === 'B'
                                        ? 'bg-emerald-700 border-emerald-700 text-white'
                                        : showAnswerKey && expectedSide === 'B'
                                          ? 'bg-emerald-50 border-emerald-600 text-emerald-700 ring-2 ring-emerald-200'
                                          : 'bg-white border-slate-300 hover:border-emerald-600'
                                    }`}
                                  >
                                    {(picked === 'B' || (showAnswerKey && expectedSide === 'B')) && (
                                      <Check className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-slate-500 font-mono tabular-nums">
                      {completedRows} dari {currentQuestion.options.length} pernyataan telah
                      dikategorikan
                    </p>
                  </div>
                );
              })()}

              {/* Isian Singkat */}
              {currentQuestion.type === 'isian' && (
                <div className="space-y-2">
                  <input
                    type="text"
                    dir={getBidiInputDirection(currentAnswer?.shortAnswerText || '')}
                    value={currentAnswer?.shortAnswerText || ''}
                    onChange={(e) => handleShortAnswerChange(currentQuestion.id, e.target.value)}
                    placeholder="Ketik jawaban singkat Anda di sini..."
                    className={`w-full px-4 py-3 text-base font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 ${getBidiInputClass(
                      currentAnswer?.shortAnswerText || ''
                    )}`}
                  />
                  <p className="text-xs text-slate-500">
                    Tuliskan jawaban singkat dengan tepat (angka atau kata/frasa singkat tanpa spasi
                    berlebih).
                  </p>
                  {showAnswerKey && (
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                      <span className="font-semibold block">Kunci Jawaban:</span>
                      <BidiParagraphs
                        text={
                          (currentQuestion.essayKeywords &&
                          currentQuestion.essayKeywords.length > 0
                            ? currentQuestion.essayKeywords.join(', ')
                            : currentQuestion.essaySampleAnswer) || '-'
                        }
                        variant="compact"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Uraian */}
              {currentQuestion.type === 'essay' && (
                <div className="space-y-2">
                  <textarea
                    rows={6}
                    dir={getBidiInputDirection(currentAnswer?.essayText || '')}
                    value={currentAnswer?.essayText || ''}
                    onChange={(e) => handleEssayChange(currentQuestion.id, e.target.value)}
                    placeholder="Tuliskan jawaban uraian Anda di sini secara jelas dan runtut..."
                    className={`w-full p-3.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 leading-relaxed ${getBidiInputClass(
                      currentAnswer?.essayText || ''
                    )}`}
                  />
                  <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                    <span>Penilaian otomatis berbasis rubrik konsep kunci</span>
                    <span>
                      {(currentAnswer?.essayText || '').trim().split(/\s+/).filter(Boolean).length}{' '}
                      kata
                    </span>
                  </div>
                  {showAnswerKey && (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1.5">
                      {currentQuestion.essayKeywords && currentQuestion.essayKeywords.length > 0 && (
                        <div>
                          <strong className="block mb-0.5">Kata Kunci:</strong>
                          <BidiParagraphs
                            text={currentQuestion.essayKeywords.join(', ')}
                            variant="caption"
                          />
                        </div>
                      )}
                      {currentQuestion.essaySampleAnswer && (
                        <div>
                          <strong className="block mb-0.5">Referensi Ideal:</strong>
                          <BidiParagraphs
                            text={currentQuestion.essaySampleAnswer}
                            variant="caption"
                          />
                        </div>
                      )}
                    </div>
                  )}
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

                <button
                  type="button"
                  disabled={currentIndex >= questions.length - 1}
                  onClick={() =>
                    setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))
                  }
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Selanjutnya</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
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
      </div>

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/85 flex items-center justify-center p-6"
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
