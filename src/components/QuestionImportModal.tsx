import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  Download,
  FileSpreadsheet,
  FileText,
  FileUp,
  Square,
  Upload,
  X,
} from 'lucide-react';
import type { DriveAsset, Question } from '../types/cbt.ts';

interface ParsedQuestionDraft {
  tempId: string;
  orderNumber: number;
  type: 'pg' | 'pgk' | 'essay';
  domain: string;
  cognitiveLevel: string;
  stimulusTitle?: string;
  stimulusPassage?: string;
  imageUrl?: string;
  imageCaption?: string;
  videoUrl?: string;
  videoCaption?: string;
  prompt: string;
  options: { id: string; label: string; text: string }[];
  correctOptionId?: string;
  correctOptionIds?: string[];
  essayKeywords?: string[];
  essaySampleAnswer?: string;
  maxPoints: number;
  warnings: string[];
}

interface ParseSummary {
  total: number;
  pg: number;
  pgk: number;
  essay: number;
}

interface QuestionImportModalProps {
  assessmentId: string;
  assessmentTitle: string;
  actorId: string;
  actorRole: string;
  onImported: (questions: Question[], newAssets: DriveAsset[]) => void;
  onClose: () => void;
}

export const QuestionImportModal: React.FC<QuestionImportModalProps> = ({
  assessmentId,
  assessmentTitle,
  actorId,
  actorRole,
  onImported,
  onClose,
}) => {
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [rawText, setRawText] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<ParsedQuestionDraft[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [importFormat, setImportFormat] = useState<string | null>(null);
  const [summary, setSummary] = useState<ParseSummary | null>(null);
  const [embeddedImagesCount, setEmbeddedImagesCount] = useState(0);
  const [uploadedAssets, setUploadedAssets] = useState<DriveAsset[]>([]);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');

  const applyParsedResponse = (data: {
    result?: {
      format: string;
      questions: ParsedQuestionDraft[];
      embeddedImagesCount: number;
      summary: ParseSummary;
    };
    uploadedAssets?: DriveAsset[];
  }) => {
    const resObj = data.result;
    if (!resObj || resObj.questions.length === 0) {
      setError(
        'Tidak ada butir soal yang berhasil dikenali dari dokumen tersebut. Periksa kembali format atau gunakan template yang disediakan.'
      );
      setDrafts([]);
      setSummary(null);
      return;
    }
    setImportFormat(resObj.format);
    setDrafts(resObj.questions);
    setSummary(resObj.summary);
    setEmbeddedImagesCount(resObj.embeddedImagesCount || 0);
    setUploadedAssets(data.uploadedAssets || []);
    const initialSel: Record<string, boolean> = {};
    resObj.questions.forEach((q) => {
      initialSel[q.tempId] = true;
    });
    setSelectedIds(initialSel);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    setParsing(true);
    setError(null);

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/questions/parse-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': actorRole,
          'x-user-id': actorId,
        },
        body: JSON.stringify({
          assessmentId,
          fileName: file.name,
          base64Data,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal membaca dokumen.');
        return;
      }
      applyParsedResponse(data);
    } catch {
      setError('Gagal membaca berkas dokumen. Pastikan ukuran dan format file valid.');
    } finally {
      setParsing(false);
    }
  };

  const handleParseText = async () => {
    if (!rawText.trim()) {
      setError('Tempelkan naskah soal terlebih dahulu sebelum memproses.');
      return;
    }
    setParsing(true);
    setError(null);
    try {
      const res = await fetch('/api/questions/parse-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': actorRole,
          'x-user-id': actorId,
        },
        body: JSON.stringify({
          assessmentId,
          rawText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal memproses teks soal.');
        return;
      }
      applyParsedResponse(data);
    } catch {
      setError('Terjadi kesalahan saat memproses teks soal.');
    } finally {
      setParsing(false);
    }
  };

  const selectedDrafts = drafts.filter((d) => selectedIds[d.tempId]);

  const handleConfirmImport = async () => {
    if (selectedDrafts.length === 0) {
      setError('Pilih minimal satu butir soal untuk disimpan.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/questions/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': actorRole,
          'x-user-id': actorId,
        },
        body: JSON.stringify({
          assessmentId,
          drafts: selectedDrafts,
          mode: importMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal menyimpan butir soal hasil impor.');
        return;
      }
      onImported(data.questions || [], uploadedAssets);
      onClose();
    } catch {
      setError('Gagal menghubungi server untuk menyimpan soal.');
    } finally {
      setSaving(false);
    }
  };

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    drafts.forEach((d) => {
      next[d.tempId] = checked;
    });
    setSelectedIds(next);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs font-semibold text-emerald-700">
              Impor Dokumen Bank Soal · Word, Excel, CSV, Teks, JSON
            </p>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5 truncate max-w-2xl">
              {assessmentTitle}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Template Downloads & Format Guidance */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-900">
                Unduh Format Template Dokumen Resmi AISA
              </p>
              <p className="text-xs text-slate-600">
                Mendukung unggahan <strong>.docx</strong> (termasuk gambar di dalam Word),{' '}
                <strong>.xlsx / .xls / .csv</strong>, <strong>.txt / .md</strong>, dan{' '}
                <strong>.json</strong>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <a
                href="/api/questions/import-template?format=xlsx"
                download="Template_Bank_Soal_AISA.xlsx"
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Template Excel (.xlsx)</span>
              </a>
              <a
                href="/api/questions/import-template?format=txt"
                download="Template_Bank_Soal_AISA.txt"
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-slate-700" />
                <span>Template Word/Teks (.txt)</span>
              </a>
              <a
                href="/api/questions/import-template?format=csv"
                download="Template_Bank_Soal_AISA.csv"
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-slate-700" />
                <span>CSV</span>
              </a>
            </div>
          </div>

          {/* Input Mode Switch */}
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setInputMode('file')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  inputMode === 'file'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Unggah Berkas Dokumen
              </button>
              <button
                type="button"
                onClick={() => setInputMode('paste')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  inputMode === 'paste'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tempel Teks dari Word / Docs
              </button>
            </div>

            {drafts.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDrafts([]);
                  setSummary(null);
                  setSelectedFileName(null);
                  setError(null);
                }}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Muat Ulang Dokumen Lain
              </button>
            )}
          </div>

          {/* File Upload or Paste Text Area */}
          {inputMode === 'file' ? (
            <label className="block border-2 border-dashed border-slate-300 hover:border-emerald-600 bg-slate-50/50 rounded-xl p-6 text-center cursor-pointer transition-colors">
              <FileUp className="w-7 h-7 text-emerald-700 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 mt-2">
                {parsing
                  ? 'Membaca dan memetakan butir soal dari dokumen...'
                  : selectedFileName
                    ? `Berkas terpilih: ${selectedFileName}`
                    : 'Pilih dokumen Word (.docx), Excel (.xlsx/.xls), CSV, TXT, atau JSON'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Gambar yang disisipkan langsung di dalam dokumen Word (.docx) otomatis diekstrak dan
                diunggah ke Google Drive tanpa perlu login akun Google.
              </p>
              <input
                type="file"
                accept=".docx,.xlsx,.xls,.csv,.ods,.txt,.md,.json"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          ) : (
            <div className="space-y-2.5">
              <textarea
                rows={7}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`Contoh format teks:\n[SOAL 1]\nTipe: PG\nDomain: Literasi Membaca\nPertanyaan: Apa hikmah utama dari kisah kejujuran tersebut?\nA. Mendapat pujian sementara\nB. Dipercaya oleh guru dan teman\nC. Menghindari tugas piket\nD. Tidak perlu belajar lagi\nKunci: B`}
                className="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-300 rounded-xl bg-white"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={parsing}
                  onClick={handleParseText}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{parsing ? 'Memproses...' : 'Proses & Pratinjau Teks'}</span>
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {error}
            </div>
          )}

          {/* Preview Parsed Questions */}
          {drafts.length > 0 && summary && (
            <div className="space-y-4 pt-2 border-t border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
                <div>
                  <p className="text-xs font-bold text-emerald-900">
                    Hasil Pembacaan Dokumen ({importFormat})
                  </p>
                  <p className="text-xs text-emerald-800 font-mono tabular-nums mt-0.5">
                    Total {summary.total} soal · {summary.pg} Pilihan Ganda · {summary.pgk} PG
                    Kompleks · {summary.essay} Esai
                    {embeddedImagesCount > 0
                      ? ` · ${embeddedImagesCount} gambar otomatis diunggah (${
                          uploadedAssets.filter((a) => a.source === 'google_drive_gas').length > 0
                            ? 'Tersinkron Google Drive'
                            : 'Galeri Server Siap Drive'
                        })`
                      : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={importMode}
                    onChange={(e) => setImportMode(e.target.value as 'append' | 'replace')}
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-emerald-300 rounded-lg text-slate-800"
                  >
                    <option value="append">Tambahkan ke bank soal saat ini</option>
                    <option value="replace">Ganti seluruh soal di asesmen ini</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-mono tabular-nums">
                  {selectedDrafts.length} dari {drafts.length} soal dipilih untuk diimpor
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleAll(true)}
                    className="font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Pilih Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAll(false)}
                    className="font-semibold text-slate-500 hover:underline cursor-pointer"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {drafts.map((q) => {
                  const isChecked = Boolean(selectedIds[q.tempId]);
                  return (
                    <div
                      key={q.tempId}
                      className={`p-4 rounded-xl border transition-colors ${
                        isChecked
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-50/70 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedIds((prev) => ({ ...prev, [q.tempId]: !isChecked }))
                          }
                          className="mt-0.5 text-emerald-700 cursor-pointer shrink-0"
                          aria-label="Pilih butir soal"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-mono tabular-nums text-slate-500">
                              No. {q.orderNumber} ·{' '}
                              <span className="font-semibold text-slate-800">
                                {q.type === 'pg'
                                  ? 'Pilihan Ganda'
                                  : q.type === 'pgk'
                                    ? 'PG Kompleks'
                                    : 'Esai'}
                              </span>{' '}
                              · {q.domain} · {q.cognitiveLevel} · {q.maxPoints} poin
                            </p>
                          </div>

                          {q.stimulusPassage && (
                            <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 line-clamp-3 font-serif">
                              {q.stimulusTitle ? `${q.stimulusTitle}: ` : ''}
                              {q.stimulusPassage}
                            </p>
                          )}

                          {q.imageUrl && (
                            <div className="flex items-center gap-3">
                              <img
                                src={q.imageUrl}
                                alt="Lampiran soal"
                                className="h-14 w-20 object-cover rounded border border-slate-200"
                              />
                              <span className="text-[11px] font-mono text-slate-500 truncate">
                                {q.imageUrl}
                              </span>
                            </div>
                          )}

                          <p className="text-sm font-medium text-slate-900">{q.prompt}</p>

                          {q.type !== 'essay' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                              {q.options.map((opt) => {
                                const isKey =
                                  q.type === 'pg'
                                    ? q.correctOptionId === opt.id
                                    : (q.correctOptionIds || []).includes(opt.id);
                                return (
                                  <div
                                    key={opt.id}
                                    className={`px-2.5 py-1.5 rounded border ${
                                      isKey
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                        : 'bg-slate-50 border-slate-200 text-slate-700'
                                    }`}
                                  >
                                    <span className="font-mono mr-1.5">{opt.label}.</span>
                                    <span>{opt.text}</span>
                                    {isKey && <span className="ml-1.5 text-emerald-700">✓</span>}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-600 space-y-1">
                              {q.essayKeywords && q.essayKeywords.length > 0 && (
                                <p className="font-mono text-emerald-700">
                                  Kata kunci rubrik: {q.essayKeywords.join(', ')}
                                </p>
                              )}
                              {q.essaySampleAnswer && (
                                <p className="text-slate-500">
                                  Referensi: {q.essaySampleAnswer}
                                </p>
                              )}
                            </div>
                          )}

                          {q.warnings.length > 0 && (
                            <div className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{q.warnings.join(' ')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={saving || selectedDrafts.length === 0}
            onClick={handleConfirmImport}
            className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg cursor-pointer"
          >
            {saving
              ? 'Menyimpan Butir Soal...'
              : `Simpan ${selectedDrafts.length} Butir Soal ke Bank Soal`}
          </button>
        </div>
      </div>
    </div>
  );
};
