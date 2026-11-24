import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardPaste,
  Cloud,
  Image as ImageIcon,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type {
  CognitiveLevel,
  DriveAsset,
  Question,
  QuestionDomain,
  QuestionOption,
  QuestionType,
} from '../types/cbt.ts';

interface QuestionEditorModalProps {
  assessmentId: string;
  initialQuestion?: Question | null;
  nextOrderNumber: number;
  driveAssets: DriveAsset[];
  authorId: string;
  uploaderName: string;
  onAssetUploaded: (asset: DriveAsset) => void;
  onSave: (question: Question) => Promise<void>;
  onClose: () => void;
}

const DEFAULT_OPTIONS: QuestionOption[] = [
  { id: 'opt-a', label: 'A', text: '' },
  { id: 'opt-b', label: 'B', text: '' },
  { id: 'opt-c', label: 'C', text: '' },
  { id: 'opt-d', label: 'D', text: '' },
];

export const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({
  assessmentId,
  initialQuestion,
  nextOrderNumber,
  driveAssets,
  authorId,
  uploaderName,
  onAssetUploaded,
  onSave,
  onClose,
}) => {
  const [type, setType] = useState<QuestionType>(initialQuestion?.type || 'pg');
  const [orderNumber, setOrderNumber] = useState(
    initialQuestion?.orderNumber || nextOrderNumber
  );
  const [domain, setDomain] = useState<QuestionDomain>(
    initialQuestion?.domain || 'Literasi Membaca'
  );
  const [cognitiveLevel, setCognitiveLevel] = useState<CognitiveLevel>(
    initialQuestion?.cognitiveLevel || 'L2 Penerapan'
  );
  const [maxPoints, setMaxPoints] = useState(initialQuestion?.maxPoints || 15);
  const [stimulusTitle, setStimulusTitle] = useState(initialQuestion?.stimulusTitle || '');
  const [stimulusPassage, setStimulusPassage] = useState(
    initialQuestion?.stimulusPassage || ''
  );
  const [imageUrl, setImageUrl] = useState(initialQuestion?.imageUrl || '');
  const [imageCaption, setImageCaption] = useState(initialQuestion?.imageCaption || '');
  const [videoUrl, setVideoUrl] = useState(initialQuestion?.videoUrl || '');
  const [videoCaption, setVideoCaption] = useState(initialQuestion?.videoCaption || '');
  const [prompt, setPrompt] = useState(initialQuestion?.prompt || '');
  const [options, setOptions] = useState<QuestionOption[]>(
    initialQuestion?.options?.length ? initialQuestion.options : DEFAULT_OPTIONS
  );
  const [correctOptionId, setCorrectOptionId] = useState(
    initialQuestion?.correctOptionId || 'opt-a'
  );
  const [correctOptionIds, setCorrectOptionIds] = useState<string[]>(
    initialQuestion?.correctOptionIds || ['opt-a', 'opt-b']
  );
  const [essayKeywordsText, setEssayKeywordsText] = useState(
    (initialQuestion?.essayKeywords || []).join(', ')
  );
  const [essaySampleAnswer, setEssaySampleAnswer] = useState(
    initialQuestion?.essaySampleAnswer || ''
  );

  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const [dragOverMain, setDragOverMain] = useState(false);
  const [pickerKind, setPickerKind] = useState<'image' | 'video' | null>(null);
  const [uploadStatusNote, setUploadStatusNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFileToDrive = async (
    file: File,
    target: 'image' | 'video' | { optionIndex: number }
  ) => {
    const targetKey =
      typeof target === 'string' ? target : `opt-${target.optionIndex}`;
    setUploadingTarget(targetKey);
    setError(null);
    setUploadStatusNote(null);

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const fallbackName =
        file.name ||
        `soal_gambar_${Date.now()}.${file.type?.includes('png') ? 'png' : 'jpg'}`;
      const mimeType =
        file.type || (target === 'video' ? 'video/mp4' : 'image/png');

      const res = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fallbackName,
          mimeType,
          base64Data,
          uploadedBy: uploaderName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal mengunggah lampiran media.');
        return;
      }

      const uploadedAsset: DriveAsset = data.asset;
      onAssetUploaded(uploadedAsset);

      if (target === 'image') {
        setImageUrl(uploadedAsset.url);
      } else if (target === 'video') {
        setVideoUrl(uploadedAsset.url);
      } else {
        setOptions((prev) =>
          prev.map((item, i) =>
            i === target.optionIndex ? { ...item, imageUrl: uploadedAsset.url } : item
          )
        );
      }

      setUploadStatusNote(
        data.gasSynced
          ? 'Gambar otomatis terunggah ke Google Drive (tanpa login) & siap ditampilkan.'
          : 'Gambar tersimpan di Galeri Server Madrasah & siap sinkron otomatis ke Google Drive tanpa login.'
      );
    } catch {
      setError('Gagal membaca atau mengunggah file media.');
    } finally {
      setUploadingTarget(null);
    }
  };

  const handleFileInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'image' | 'video' | { optionIndex: number }
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFileToDrive(file, target);
    }
    e.target.value = '';
  };

  // Support Ctrl+V / screenshot paste anywhere inside the editor modal
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            uploadFileToDrive(file, 'image');
            return;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [uploaderName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPrompt = prompt.trim();
    const hasMainImage = Boolean(imageUrl.trim());
    if (!cleanPrompt && !hasMainImage) {
      setError('Isi teks pertanyaan atau sisipkan gambar soal terlebih dahulu.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const parsedKeywords = essayKeywordsText
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

      const normalizedOptions =
        type === 'essay'
          ? []
          : options.map((o) => ({
              ...o,
              text: o.text.trim() || (o.imageUrl ? `Pilihan ${o.label}` : ''),
            }));

      const question: Question = {
        id: initialQuestion?.id || `q-${Date.now()}`,
        assessmentId,
        orderNumber: Number(orderNumber),
        type,
        domain,
        cognitiveLevel,
        stimulusTitle: stimulusTitle.trim() || undefined,
        stimulusPassage: stimulusPassage.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        imageCaption: imageCaption.trim() || undefined,
        videoUrl: videoUrl.trim() || undefined,
        videoCaption: videoCaption.trim() || undefined,
        prompt: cleanPrompt || 'Perhatikan gambar soal berikut dengan saksama.',
        options: normalizedOptions,
        correctOptionId: type === 'pg' ? correctOptionId : undefined,
        correctOptionIds: type === 'pgk' ? correctOptionIds : [],
        essayKeywords: type === 'essay' ? parsedKeywords : [],
        essaySampleAnswer: type === 'essay' ? essaySampleAnswer.trim() || undefined : undefined,
        maxPoints: Number(maxPoints),
        authorId: initialQuestion?.authorId || authorId,
        authorName: initialQuestion?.authorName || uploaderName,
      };

      await onSave(question);
      onClose();
    } catch {
      setError('Gagal menyimpan butir soal.');
    } finally {
      setSaving(false);
    }
  };

  const filteredAssets = driveAssets.filter((a) =>
    pickerKind === 'image' ? a.mediaKind === 'image' : a.mediaKind === 'video'
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs font-medium text-emerald-700">
              Editor Bank Soal &amp; Gambar Otomatis Google Drive (Tanpa Login)
            </p>
            <h3 className="text-lg font-bold text-slate-900">
              {initialQuestion ? 'Edit Butir Soal' : 'Tambah Butir Soal Baru'}
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

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Metadata Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nomor Urut</label>
              <input
                type="number"
                min={1}
                value={orderNumber}
                onChange={(e) => setOrderNumber(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Model Soal</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as QuestionType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="pg">Pilihan Ganda</option>
                <option value="pgk">Pilihan Ganda Kompleks</option>
                <option value="essay">Esai Uraian</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Domain</label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value as QuestionDomain)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Literasi Membaca">Literasi Membaca</option>
                <option value="Numerasi">Numerasi</option>
                <option value="Literasi Sains">Literasi Sains</option>
                <option value="PAI & Akhlak">PAI &amp; Akhlak</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Level Kognitif</label>
              <select
                value={cognitiveLevel}
                onChange={(e) => setCognitiveLevel(e.target.value as CognitiveLevel)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="L1 Pemahaman">L1 Pemahaman</option>
                <option value="L2 Penerapan">L2 Penerapan</option>
                <option value="L3 Penalaran">L3 Penalaran</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Bobot Poin</label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxPoints}
                onChange={(e) => setMaxPoints(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Easy Image Question Insertion Zone + Video Attachment */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2 border-t border-slate-100">
            {/* Image Dropzone / Paste / Upload / Preview (7 cols) */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverMain(true);
              }}
              onDragLeave={() => setDragOverMain(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverMain(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped && dropped.type.startsWith('image/')) {
                  uploadFileToDrive(dropped, 'image');
                }
              }}
              className={`md:col-span-7 p-4 rounded-xl border-2 border-dashed transition-colors space-y-3 ${
                dragOverMain
                  ? 'border-emerald-600 bg-emerald-50/70'
                  : 'border-slate-300 bg-slate-50/70'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900 inline-flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-emerald-700" />
                  Sisipkan Gambar Soal (Tarik, Tempel Ctrl+V, atau Pilih File)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPickerKind(pickerKind === 'image' ? null : 'image')}
                    className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Galeri Drive
                  </button>
                  <label className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-md cursor-pointer inline-flex items-center gap-1">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingTarget === 'image' ? 'Mengunggah...' : 'Pilih Gambar'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileInputChange(e, 'image')}
                    />
                  </label>
                </div>
              </div>

              {imageUrl ? (
                <div className="relative rounded-lg border border-slate-200 bg-white p-2 flex items-center gap-3">
                  <img
                    src={imageUrl}
                    alt={imageCaption || 'Pratinjau gambar soal'}
                    referrerPolicy="no-referrer"
                    className="h-24 w-32 object-contain rounded border border-slate-100 bg-slate-50 shrink-0"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-semibold text-emerald-800 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Gambar Soal Terpasang</span>
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 truncate">{imageUrl}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <label className="text-[11px] font-semibold text-slate-700 hover:text-emerald-700 cursor-pointer underline">
                        Ganti Gambar
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileInputChange(e, 'image')}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="text-[11px] font-semibold text-red-700 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <label className="block py-4 px-3 rounded-lg bg-white border border-slate-200 text-center cursor-pointer hover:border-emerald-600 transition-colors">
                  <ClipboardPaste className="w-5 h-5 text-emerald-700 mx-auto mb-1" />
                  <p className="text-xs font-medium text-slate-800">
                    {uploadingTarget === 'image'
                      ? 'Sedang mengunggah gambar ke Google Drive (tanpa login)...'
                      : 'Klik untuk memilih gambar, tarik file ke sini, atau tekan Ctrl+V (tempel screenshot)'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 inline-flex items-center gap-1">
                    <Cloud className="w-3 h-3 text-emerald-700" />
                    <span>Semua gambar otomatis diarsipkan ke Google Drive tanpa login</span>
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileInputChange(e, 'image')}
                  />
                </label>
              )}

              {uploadStatusNote && (
                <p className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5">
                  {uploadStatusNote}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="URL gambar (otomatis terisi saat unggah)"
                  className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
                <input
                  type="text"
                  value={imageCaption}
                  onChange={(e) => setImageCaption(e.target.value)}
                  placeholder="Keterangan gambar (opsional)"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>

            {/* Video Attachment (5 cols) */}
            <div className="md:col-span-5 p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-emerald-700" />
                    Lampiran Video (Opsional)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPickerKind(pickerKind === 'video' ? null : 'video')}
                      className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                    >
                      Galeri Drive
                    </button>
                    <label className="text-xs font-medium text-slate-700 hover:text-slate-900 cursor-pointer inline-flex items-center gap-1">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingTarget === 'video' ? 'Mengunggah...' : 'Unggah'}</span>
                      <input
                        type="file"
                        accept="video/mp4,video/webm"
                        className="hidden"
                        onChange={(e) => handleFileInputChange(e, 'video')}
                      />
                    </label>
                  </div>
                </div>
                <input
                  type="text"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="URL video (.mp4 / Google Drive)"
                  className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
                <input
                  type="text"
                  value={videoCaption}
                  onChange={(e) => setVideoCaption(e.target.value)}
                  placeholder="Keterangan video (opsional)"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Mendukung unggahan video stimulus `.mp4` / `.webm` otomatis ke Google Drive.
              </p>
            </div>
          </div>

          {/* Inline Drive Asset Picker with Thumbnails */}
          {pickerKind && (
            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-800">
                  Pilih {pickerKind === 'image' ? 'Gambar' : 'Video'} dari Galeri Google Drive
                </p>
                <button
                  type="button"
                  onClick={() => setPickerKind(null)}
                  className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-48 overflow-y-auto">
                {filteredAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      if (pickerKind === 'image') setImageUrl(asset.url);
                      else setVideoUrl(asset.url);
                      setPickerKind(null);
                    }}
                    className="text-left p-2 bg-white border border-slate-200 hover:border-emerald-600 rounded-lg space-y-1.5 cursor-pointer"
                  >
                    {pickerKind === 'image' && (
                      <img
                        src={asset.url}
                        alt={asset.name}
                        className="w-full h-16 object-cover rounded border border-slate-100"
                      />
                    )}
                    <p className="text-[11px] font-medium text-slate-800 truncate">{asset.name}</p>
                  </button>
                ))}
                {filteredAssets.length === 0 && (
                  <p className="text-xs text-slate-500 col-span-full">
                    Belum ada media {pickerKind} tersedia.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Prompt */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-700">
                Pertanyaan Utama {imageUrl.trim() ? '(Opsional karena sudah ada gambar soal)' : '*'}
              </label>
            </div>
            <textarea
              rows={3}
              required={!imageUrl.trim()}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                imageUrl.trim()
                  ? 'Boleh dikosongkan jika seluruh soal sudah tertera pada gambar di atas, atau tulis perintah singkat...'
                  : 'Tuliskan pokok pertanyaan yang harus dijawab peserta ujian...'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {/* Stimulus Passage (Collapsible / Secondary) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Judul Stimulus / Wacana (Opsional)
              </label>
              <input
                type="text"
                value={stimulusTitle}
                onChange={(e) => setStimulusTitle(e.target.value)}
                placeholder="Contoh: Ekosistem Sawah Soborejo"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="md:col-span-8">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Teks Bacaan / Stimulus (Opsional)
              </label>
              <textarea
                rows={2}
                value={stimulusPassage}
                onChange={(e) => setStimulusPassage(e.target.value)}
                placeholder="Tuliskan bacaan, data cerita, atau konteks masalah jika diperlukan..."
                className="w-full px-3 py-2 text-sm font-serif border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Answer Key Section (with easy Option Images!) */}
          {type !== 'essay' ? (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-800">
                {type === 'pg'
                  ? 'Pilihan Jawaban & Kunci Tunggal (Teks dan/atau Gambar Opsi)'
                  : 'Pilihan Jawaban & Kunci Kompleks (Centang semua jawaban benar)'}
              </p>
              {options.map((opt, idx) => {
                const isSelected =
                  type === 'pg'
                    ? correctOptionId === opt.id
                    : correctOptionIds.includes(opt.id);
                const optUploading = uploadingTarget === `opt-${idx}`;

                return (
                  <div
                    key={opt.id}
                    className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/40 space-y-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (type === 'pg') {
                            setCorrectOptionId(opt.id);
                          } else {
                            setCorrectOptionIds((prev) =>
                              prev.includes(opt.id)
                                ? prev.filter((id) => id !== opt.id)
                                : [...prev, opt.id]
                            );
                          }
                        }}
                        className={`px-3 py-2 rounded-lg border text-xs font-bold font-mono shrink-0 cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-700 border-emerald-700 text-white'
                            : 'bg-white border-slate-300 text-slate-600'
                        }`}
                      >
                        {opt.label} {isSelected ? '✓' : ''}
                      </button>
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOptions((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, text: val } : item))
                          );
                        }}
                        placeholder={`Teks pilihan ${opt.label} (opsional jika memakai gambar)`}
                        className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                      />
                      <label
                        title={`Sisipkan gambar untuk opsi ${opt.label}`}
                        className="px-2.5 py-2 bg-white border border-slate-300 hover:border-emerald-600 text-slate-700 hover:text-emerald-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">
                          {optUploading ? 'Unggah...' : 'Gambar'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileInputChange(e, { optionIndex: idx })}
                        />
                      </label>
                    </div>

                    {opt.imageUrl && (
                      <div className="flex items-center gap-3 pl-11">
                        <img
                          src={opt.imageUrl}
                          alt={`Gambar opsi ${opt.label}`}
                          className="h-14 w-20 object-contain rounded border border-slate-200 bg-white p-0.5"
                        />
                        <span className="text-[11px] font-mono text-slate-500 truncate flex-1">
                          {opt.imageUrl}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setOptions((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, imageUrl: undefined } : item
                              )
                            )
                          }
                          className="text-[11px] font-semibold text-red-700 hover:underline cursor-pointer"
                        >
                          Hapus Gambar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-xs font-semibold text-slate-900">
                Rubrik Penilaian Otomatis Soal Esai
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kata Kunci Konsep (pisahkan dengan koma, gunakan | untuk sinonim)
                </label>
                <input
                  type="text"
                  value={essayKeywordsText}
                  onChange={(e) => setEssayKeywordsText(e.target.value)}
                  placeholder="Contoh: katak|kodok, meningkat|bertambah, bangau, keseimbangan|rantai makanan"
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kunci Jawaban Ideal (Referensi Guru)
                </label>
                <textarea
                  rows={2}
                  value={essaySampleAnswer}
                  onChange={(e) => setEssaySampleAnswer(e.target.value)}
                  placeholder="Jawaban rujukan lengkap untuk pedoman kalibrasi guru..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {saving ? 'Menyimpan...' : 'Simpan Butir Soal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
