import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import type {
  CognitiveLevel,
  Question,
  QuestionDomain,
  QuestionOption,
  QuestionType,
} from '../types/cbt.ts';

export interface ParsedQuestionDraft {
  tempId: string;
  orderNumber: number;
  type: QuestionType;
  domain: QuestionDomain;
  cognitiveLevel: CognitiveLevel;
  stimulusTitle?: string;
  stimulusPassage?: string;
  imageUrl?: string;
  imageCaption?: string;
  videoUrl?: string;
  videoCaption?: string;
  prompt: string;
  options: QuestionOption[];
  correctOptionId?: string;
  correctOptionIds?: string[];
  essayKeywords?: string[];
  essaySampleAnswer?: string;
  maxPoints: number;
  warnings: string[];
}

export interface ParseDocumentResult {
  format: string;
  questions: ParsedQuestionDraft[];
  embeddedImagesCount: number;
  summary: {
    total: number;
    pg: number;
    pgk: number;
    essay: number;
  };
}

function normalizeQuestionType(raw?: string, hasOptions?: boolean, multiKey?: boolean): QuestionType {
  const val = (raw || '').trim().toLowerCase();
  if (val.includes('kompleks') || val === 'pgk' || val.includes('multi')) return 'pgk';
  if (val.includes('esai') || val.includes('essay') || val.includes('uraian') || val.includes('isian')) {
    return 'essay';
  }
  if (val === 'pg' || val.includes('pilihan ganda') || val === 'mc') return 'pg';
  if (multiKey) return 'pgk';
  if (hasOptions === false) return 'essay';
  return 'pg';
}

function normalizeDomain(raw?: string): QuestionDomain {
  const val = (raw || '').trim().toLowerCase();
  if (val.includes('numerasi') || val.includes('matematika') || val.includes('hitung')) {
    return 'Numerasi';
  }
  if (val.includes('sains') || val.includes('ipa') || val.includes('ipas') || val.includes('alam')) {
    return 'Literasi Sains';
  }
  if (
    val.includes('pai') ||
    val.includes('akhlak') ||
    val.includes('akidah') ||
    val.includes('fikih') ||
    val.includes('quran') ||
    val.includes('islam')
  ) {
    return 'PAI & Akhlak';
  }
  return 'Literasi Membaca';
}

function normalizeCognitiveLevel(raw?: string): CognitiveLevel {
  const val = (raw || '').trim().toLowerCase();
  if (val.includes('l1') || val.includes('pemahaman') || val.includes('c1') || val.includes('c2')) {
    return 'L1 Pemahaman';
  }
  if (val.includes('l3') || val.includes('penalaran') || val.includes('hots') || val.includes('c4') || val.includes('c5') || val.includes('c6')) {
    return 'L3 Penalaran';
  }
  return 'L2 Penerapan';
}

function parseAnswerLetters(raw?: string): string[] {
  if (!raw) return [];
  const cleaned = raw
    .toUpperCase()
    .replace(/OPT-/g, '')
    .replace(/[^A-E,;|\s]/g, ' ');
  const tokens = cleaned
    .split(/[,;|\s]+/)
    .map((t) => t.trim())
    .filter((t) => /^[A-E]$/.test(t));
  return Array.from(new Set(tokens)).map((letter) => `opt-${letter.toLowerCase()}`);
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function finalizeDraft(
  partial: Partial<ParsedQuestionDraft>,
  index: number,
  startingOrderNumber: number
): ParsedQuestionDraft | null {
  const rawPrompt = (partial.prompt || '').trim();
  const hasImage = Boolean(partial.imageUrl && partial.imageUrl.trim());
  if (!rawPrompt && !hasImage) return null;
  const prompt = rawPrompt || 'Perhatikan gambar berikut dengan saksama.';

  const options = (partial.options || []).filter((o) => o.text.trim().length > 0 || Boolean(o.imageUrl));
  const keysFromRaw = partial.correctOptionIds && partial.correctOptionIds.length > 0
    ? partial.correctOptionIds
    : partial.correctOptionId
      ? [partial.correctOptionId]
      : [];

  const qType = partial.type || normalizeQuestionType(undefined, options.length > 0, keysFromRaw.length > 1);
  const warnings: string[] = [];

  if (qType !== 'essay' && options.length < 2) {
    warnings.push('Opsi pilihan jawaban kurang dari 2.');
  }
  if (qType === 'pg' && keysFromRaw.length === 0) {
    warnings.push('Kunci jawaban PG belum terdeteksi (default ke A jika tidak dipilih).');
  }
  if (qType === 'pgk' && keysFromRaw.length < 1) {
    warnings.push('Kunci jawaban PG Kompleks belum terdeteksi.');
  }
  if (qType === 'essay' && (!partial.essayKeywords || partial.essayKeywords.length === 0)) {
    warnings.push('Kata kunci rubrik esai kosong; penilaian otomatis akan memakai skor minimal sampai dilengkapi.');
  }

  const normalizedOptions =
    qType === 'essay'
      ? []
      : options.length > 0
        ? options
        : [
            { id: 'opt-a', label: 'A', text: 'Pilihan A' },
            { id: 'opt-b', label: 'B', text: 'Pilihan B' },
            { id: 'opt-c', label: 'C', text: 'Pilihan C' },
            { id: 'opt-d', label: 'D', text: 'Pilihan D' },
          ];

  const validOptionIds = new Set(normalizedOptions.map((o) => o.id));
  const filteredKeys = keysFromRaw.filter((id) => validOptionIds.has(id));

  return {
    tempId: `imp-${Date.now()}-${index}`,
    orderNumber: partial.orderNumber && partial.orderNumber > 0 ? partial.orderNumber : startingOrderNumber + index,
    type: qType,
    domain: partial.domain || 'Literasi Membaca',
    cognitiveLevel: partial.cognitiveLevel || 'L2 Penerapan',
    stimulusTitle: partial.stimulusTitle?.trim() || undefined,
    stimulusPassage: partial.stimulusPassage?.trim() || undefined,
    imageUrl: partial.imageUrl?.trim() || undefined,
    imageCaption: partial.imageCaption?.trim() || undefined,
    videoUrl: partial.videoUrl?.trim() || undefined,
    videoCaption: partial.videoCaption?.trim() || undefined,
    prompt,
    options: normalizedOptions,
    correctOptionId: qType === 'pg' ? filteredKeys[0] || normalizedOptions[0]?.id : undefined,
    correctOptionIds: qType === 'pgk' ? filteredKeys : [],
    essayKeywords: qType === 'essay' ? partial.essayKeywords || [] : [],
    essaySampleAnswer: qType === 'essay' ? partial.essaySampleAnswer?.trim() || undefined : undefined,
    maxPoints: partial.maxPoints && partial.maxPoints > 0 ? partial.maxPoints : qType === 'essay' ? 20 : 10,
    warnings,
  };
}

function getColumnValue(row: Record<string, unknown>, aliases: string[]): string {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const found = entries.find(
      ([k]) => k.trim().toLowerCase().replace(/[\s_-]+/g, '') === alias.toLowerCase().replace(/[\s_-]+/g, '')
    );
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== '') {
      return String(found[1]).trim();
    }
  }
  return '';
}

function parseTabularRows(
  rows: Record<string, unknown>[],
  startingOrderNumber: number
): ParsedQuestionDraft[] {
  const drafts: ParsedQuestionDraft[] = [];

  rows.forEach((row) => {
    const prompt = getColumnValue(row, [
      'pertanyaan',
      'soal',
      'pokoksoal',
      'prompt',
      'question',
      'tekssoal',
    ]);
    const rowImageUrl = getColumnValue(row, ['gambar', 'urlgambar', 'image', 'imageurl']);
    if (!prompt && !rowImageUrl) return;

    const optA = getColumnValue(row, ['opsia', 'pilihan_a', 'pilihana', 'a', 'optiona']);
    const optB = getColumnValue(row, ['opsib', 'pilihan_b', 'pilihanb', 'b', 'optionb']);
    const optC = getColumnValue(row, ['opsic', 'pilihan_c', 'pilihanc', 'c', 'optionc']);
    const optD = getColumnValue(row, ['opsid', 'pilihan_d', 'pilihand', 'd', 'optiond']);
    const optE = getColumnValue(row, ['opsie', 'pilihan_e', 'pilihane', 'e', 'optione']);

    const imgA = getColumnValue(row, ['gambara', 'opsia_gambar', 'imagea']);
    const imgB = getColumnValue(row, ['gambarb', 'opsib_gambar', 'imageb']);
    const imgC = getColumnValue(row, ['gambarc', 'opsic_gambar', 'imagec']);
    const imgD = getColumnValue(row, ['gambard', 'opsid_gambar', 'imaged']);
    const imgE = getColumnValue(row, ['gambare', 'opsie_gambar', 'imagee']);

    const options: QuestionOption[] = [];
    if (optA || imgA) options.push({ id: 'opt-a', label: 'A', text: optA || 'Pilihan A', ...(imgA ? { imageUrl: imgA } : {}) });
    if (optB || imgB) options.push({ id: 'opt-b', label: 'B', text: optB || 'Pilihan B', ...(imgB ? { imageUrl: imgB } : {}) });
    if (optC || imgC) options.push({ id: 'opt-c', label: 'C', text: optC || 'Pilihan C', ...(imgC ? { imageUrl: imgC } : {}) });
    if (optD || imgD) options.push({ id: 'opt-d', label: 'D', text: optD || 'Pilihan D', ...(imgD ? { imageUrl: imgD } : {}) });
    if (optE || imgE) options.push({ id: 'opt-e', label: 'E', text: optE || 'Pilihan E', ...(imgE ? { imageUrl: imgE } : {}) });

    const keyRaw = getColumnValue(row, ['kunci', 'kuncijawaban', 'jawaban', 'answer', 'key']);
    const keyIds = parseAnswerLetters(keyRaw);
    const typeRaw = getColumnValue(row, ['tipe', 'model', 'jenis', 'type', 'modelsoal']);
    const qType = normalizeQuestionType(typeRaw, options.length > 0, keyIds.length > 1);

    const keywordsRaw = getColumnValue(row, [
      'katakunciesai',
      'katakunci',
      'rubrik',
      'keywords',
      'essaykeywords',
    ]);
    const essayKeywords = keywordsRaw
      ? keywordsRaw
          .split(/[,;]+/)
          .map((k) => k.trim())
          .filter(Boolean)
      : [];

    const orderNumRaw = Number(getColumnValue(row, ['no', 'nomor', 'nomorsoal', 'ordernumber']));
    const maxPointsRaw = Number(getColumnValue(row, ['poin', 'bobot', 'bobotpoin', 'skor', 'maxpoints']));

    const draft = finalizeDraft(
      {
        orderNumber: Number.isFinite(orderNumRaw) && orderNumRaw > 0 ? orderNumRaw : undefined,
        type: qType,
        domain: normalizeDomain(getColumnValue(row, ['domain', 'materi', 'aspek'])),
        cognitiveLevel: normalizeCognitiveLevel(
          getColumnValue(row, ['level', 'levelkognitif', 'kognitif', 'cognitivelevel'])
        ),
        stimulusTitle: getColumnValue(row, ['judulstimulus', 'judulwacana', 'stimulustitle']),
        stimulusPassage: getColumnValue(row, ['stimulus', 'wacana', 'bacaan', 'stimuluspassage']),
        imageUrl: rowImageUrl,
        imageCaption: getColumnValue(row, ['keterangangambar', 'captiongambar', 'imagecaption']),
        videoUrl: getColumnValue(row, ['video', 'urlvideo', 'videourl']),
        videoCaption: getColumnValue(row, ['keteranganvideo', 'captionvideo', 'videocaption']),
        prompt,
        options,
        correctOptionId: keyIds[0],
        correctOptionIds: keyIds,
        essayKeywords,
        essaySampleAnswer: getColumnValue(row, [
          'jawabanideal',
          'referensiesai',
          'sampleanswer',
          'essaysampleanswer',
        ]),
        maxPoints: Number.isFinite(maxPointsRaw) && maxPointsRaw > 0 ? maxPointsRaw : undefined,
      },
      drafts.length,
      startingOrderNumber
    );

    if (draft) drafts.push(draft);
  });

  return drafts;
}

export function parseStructuredText(
  rawText: string,
  startingOrderNumber = 1
): ParsedQuestionDraft[] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  // Split into question blocks using --- / === or numbered lines (1. / Soal 1: / [SOAL 1])
  const lines = normalized.split('\n');
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  const isSeparator = (line: string) => /^[-=]{3,}\s*$/.test(line.trim());
  const isNewQuestionMarker = (line: string) => {
    const trimmed = line.trim();
    if (/^\[SOAL(?:\s+\d+)?\]$/i.test(trimmed)) return true;
    if (/^(?:SOAL|NO\.?)\s*\d+\s*[:.)-]/i.test(trimmed)) return true;
    // Numbered line like "1. Teks..." when currentBlock already has options/kunci/prompt
    if (/^\d{1,3}[.)]\s+/.test(trimmed)) {
      const blockText = currentBlock.join('\n');
      const hasContent =
        /\n\s*[A-Ea-e][.)]\s+/.test(blockText) ||
        /^(?:Kunci|Jawaban|Pertanyaan)\s*:/im.test(blockText);
      if (currentBlock.length === 0 || hasContent) return true;
    }
    return false;
  };

  for (const line of lines) {
    if (isSeparator(line)) {
      if (currentBlock.some((l) => l.trim().length > 0)) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
      continue;
    }
    if (isNewQuestionMarker(line) && currentBlock.some((l) => l.trim().length > 0)) {
      blocks.push(currentBlock);
      currentBlock = [line];
      continue;
    }
    currentBlock.push(line);
  }
  if (currentBlock.some((l) => l.trim().length > 0)) {
    blocks.push(currentBlock);
  }

  const drafts: ParsedQuestionDraft[] = [];

  blocks.forEach((blockLines) => {
    const partial: Partial<ParsedQuestionDraft> = {
      options: [],
      correctOptionIds: [],
      essayKeywords: [],
    };
    const bodyLines: string[] = [];
    let activeMultilineField: 'stimulus' | 'prompt' | 'sample' | null = null;

    for (const rawLine of blockLines) {
      const line = rawLine.trim();
      if (!line) {
        if (activeMultilineField === 'stimulus' && partial.stimulusPassage) {
          partial.stimulusPassage += '\n';
        }
        continue;
      }

      if (/^\[SOAL(?:\s+\d+)?\]$/i.test(line)) {
        const m = line.match(/\d+/);
        if (m) partial.orderNumber = Number(m[0]);
        activeMultilineField = null;
        continue;
      }

      // Check metadata tag lines
      const tagMatch = line.match(
        /^(Tipe|Model|Jenis|Domain|Materi|Level|Kognitif|Poin|Bobot|Skor|Judul\s*Stimulus|Stimulus|Wacana|Bacaan|Gambar|Keterangan\s*Gambar|Video|Keterangan\s*Video|Pertanyaan|Soal|Kunci(?:\s*Jawaban)?|Jawaban(?:\s*Benar)?|Kata\s*Kunci(?:\s*Esai)?|Rubrik|Jawaban\s*Ideal)\s*:\s*(.*)$/i
      );

      if (tagMatch) {
        const key = tagMatch[1].toLowerCase().replace(/\s+/g, '');
        const val = tagMatch[2].trim();
        activeMultilineField = null;

        if (key === 'tipe' || key === 'model' || key === 'jenis') {
          partial.type = normalizeQuestionType(val);
        } else if (key === 'domain' || key === 'materi') {
          partial.domain = normalizeDomain(val);
        } else if (key === 'level' || key === 'kognitif') {
          partial.cognitiveLevel = normalizeCognitiveLevel(val);
        } else if (key === 'poin' || key === 'bobot' || key === 'skor') {
          const num = Number(val.replace(/[^\d.]/g, ''));
          if (num > 0) partial.maxPoints = num;
        } else if (key === 'judulstimulus') {
          partial.stimulusTitle = val;
        } else if (key === 'stimulus' || key === 'wacana' || key === 'bacaan') {
          partial.stimulusPassage = val;
          activeMultilineField = 'stimulus';
        } else if (key === 'gambar') {
          if (!partial.imageUrl) partial.imageUrl = val;
        } else if (key === 'keterangangambar') {
          partial.imageCaption = val;
        } else if (key === 'video') {
          partial.videoUrl = val;
        } else if (key === 'keteranganvideo') {
          partial.videoCaption = val;
        } else if (key === 'pertanyaan' || key === 'soal') {
          // Handle "Soal 1: ..." where val might still be prompt
          const numPrefix = tagMatch[0].match(/^Soal\s+(\d+)\s*:/i);
          if (numPrefix) partial.orderNumber = Number(numPrefix[1]);
          partial.prompt = val;
          activeMultilineField = 'prompt';
        } else if (key === 'kunci' || key === 'kuncijawaban' || key === 'jawaban' || key === 'jawabanbenar') {
          const keys = parseAnswerLetters(val);
          if (keys.length > 0) {
            partial.correctOptionIds = keys;
            partial.correctOptionId = keys[0];
          } else if (val && !partial.essaySampleAnswer) {
            partial.essaySampleAnswer = val;
          }
        } else if (key === 'katakunci' || key === 'katakunciesai' || key === 'rubrik') {
          partial.essayKeywords = val
            .split(/[,;]+/)
            .map((k) => k.trim())
            .filter(Boolean);
        } else if (key === 'jawabanideal') {
          partial.essaySampleAnswer = val;
          activeMultilineField = 'sample';
        }
        continue;
      }

      // Check option line: A. Text / A) Text / (A) Text
      const optMatch = line.match(/^\(?([A-E])\)?[.)]\s+(.+)$/i);
      if (optMatch) {
        activeMultilineField = null;
        const letter = optMatch[1].toUpperCase();
        let text = optMatch[2].trim();
        let optImageUrl: string | undefined;
        const imgTagMatch = text.match(/\[IMG:([^\]]+)\]/i);
        if (imgTagMatch) {
          optImageUrl = imgTagMatch[1].trim();
          text = text.replace(imgTagMatch[0], '').trim();
        }
        // Support inline correct marker like "*Teks benar" or "[BENAR]" or "(Kunci)"
        const isInlineCorrect =
          /\*$/.test(text) ||
          /^\*/.test(text) ||
          /\[BENAR\]|\(BENAR\)|\[KUNCI\]/i.test(text);
        if (isInlineCorrect) {
          text = text
            .replace(/^\*|\*$/g, '')
            .replace(/\[BENAR\]|\(BENAR\)|\[KUNCI\]/gi, '')
            .trim();
          const optId = `opt-${letter.toLowerCase()}`;
          partial.correctOptionIds = Array.from(
            new Set([...(partial.correctOptionIds || []), optId])
          );
          if (!partial.correctOptionId) partial.correctOptionId = optId;
        }
        partial.options!.push({
          id: `opt-${letter.toLowerCase()}`,
          label: letter,
          text: text || (optImageUrl ? `Pilihan ${letter}` : ''),
          ...(optImageUrl ? { imageUrl: optImageUrl } : {}),
        });
        continue;
      }

      // Check numbered header like "1. Teks pertanyaan..."
      const numHeader = line.match(/^(?:SOAL\s+|NO\.?\s*)?(\d{1,3})[.):-]\s*(.*)$/i);
      if (numHeader && !partial.prompt && bodyLines.length === 0) {
        partial.orderNumber = Number(numHeader[1]);
        if (numHeader[2].trim()) {
          bodyLines.push(numHeader[2].trim());
        }
        continue;
      }

      if (activeMultilineField === 'stimulus') {
        partial.stimulusPassage = `${partial.stimulusPassage ? `${partial.stimulusPassage}\n` : ''}${line}`;
      } else if (activeMultilineField === 'prompt') {
        partial.prompt = `${partial.prompt ? `${partial.prompt} ` : ''}${line}`;
      } else if (activeMultilineField === 'sample') {
        partial.essaySampleAnswer = `${partial.essaySampleAnswer ? `${partial.essaySampleAnswer} ` : ''}${line}`;
      } else {
        bodyLines.push(line);
      }
    }

    if (!partial.prompt && bodyLines.length > 0) {
      partial.prompt = bodyLines.join(' ');
    } else if (partial.prompt && bodyLines.length > 0 && !partial.stimulusPassage) {
      // If both bodyLines and Pertanyaan: tag exist, treat preceding bodyLines as stimulus
      partial.stimulusPassage = bodyLines.join('\n');
    }

    const draft = finalizeDraft(partial, drafts.length, startingOrderNumber);
    if (draft) drafts.push(draft);
  });

  return drafts;
}

function extractTablesFromHtml(html: string): {
  tabularRows: Record<string, unknown>[];
  remainingHtml: string;
} {
  const tabularRows: Record<string, unknown>[] = [];
  const remainingHtml = html.replace(/<table[\s\S]*?<\/table>/gi, (tableHtml) => {
    const rowMatches = [...tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)];
    if (rowMatches.length < 2) return tableHtml;

    const matrix = rowMatches.map((r) =>
      [...r[0].matchAll(/<t[hd][\s\S]*?<\/t[hd]>/gi)].map((cell) =>
        stripTags(cell[0].replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, ' $1 '))
      )
    );
    const headers = matrix[0].map((h) => h.trim());
    const headerJoined = headers.join(' ').toLowerCase();
    const looksLikeQuestionTable =
      (headerJoined.includes('pertanyaan') || headerJoined.includes('soal')) &&
      (headerJoined.includes('kunci') || headerJoined.includes('tipe') || headerJoined.includes('opsi') || headerJoined.includes('a'));

    if (!looksLikeQuestionTable) return tableHtml;

    for (let i = 1; i < matrix.length; i++) {
      const cells = matrix[i];
      const obj: Record<string, unknown> = {};
      headers.forEach((h, colIdx) => {
        if (h) obj[h] = cells[colIdx] || '';
      });
      tabularRows.push(obj);
    }
    return '\n';
  });

  return { tabularRows, remainingHtml };
}

export async function parseQuestionsDocument(params: {
  fileName: string;
  buffer: Buffer;
  startingOrderNumber: number;
  onSaveEmbeddedImage: (base64: string, mimeType: string) => Promise<string>;
}): Promise<ParseDocumentResult> {
  const { fileName, buffer, startingOrderNumber, onSaveEmbeddedImage } = params;
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  let embeddedImagesCount = 0;

  if (ext === 'json') {
    const raw = JSON.parse(buffer.toString('utf8'));
    const list: Record<string, unknown>[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.questions)
        ? raw.questions
        : [];
    const drafts: ParsedQuestionDraft[] = [];
    list.forEach((item) => {
      const optionsRaw = Array.isArray(item.options) ? item.options : [];
      const options: QuestionOption[] = optionsRaw.map((o: any, idx: number) => ({
        id: String(o.id || `opt-${String.fromCharCode(97 + idx)}`),
        label: String(o.label || String.fromCharCode(65 + idx)),
        text: String(o.text || ''),
        ...(o.imageUrl ? { imageUrl: String(o.imageUrl) } : {}),
      }));
      const draft = finalizeDraft(
        {
          orderNumber: Number(item.orderNumber || 0) || undefined,
          type: normalizeQuestionType(String(item.type || ''), options.length > 0),
          domain: normalizeDomain(String(item.domain || '')),
          cognitiveLevel: normalizeCognitiveLevel(String(item.cognitiveLevel || '')),
          stimulusTitle: item.stimulusTitle ? String(item.stimulusTitle) : undefined,
          stimulusPassage: item.stimulusPassage ? String(item.stimulusPassage) : undefined,
          imageUrl: item.imageUrl ? String(item.imageUrl) : undefined,
          imageCaption: item.imageCaption ? String(item.imageCaption) : undefined,
          videoUrl: item.videoUrl ? String(item.videoUrl) : undefined,
          videoCaption: item.videoCaption ? String(item.videoCaption) : undefined,
          prompt: String(item.prompt || ''),
          options,
          correctOptionId: item.correctOptionId ? String(item.correctOptionId) : undefined,
          correctOptionIds: Array.isArray(item.correctOptionIds)
            ? item.correctOptionIds.map(String)
            : [],
          essayKeywords: Array.isArray(item.essayKeywords)
            ? item.essayKeywords.map(String)
            : [],
          essaySampleAnswer: item.essaySampleAnswer ? String(item.essaySampleAnswer) : undefined,
          maxPoints: Number(item.maxPoints || 0) || undefined,
        },
        drafts.length,
        startingOrderNumber
      );
      if (draft) drafts.push(draft);
    });

    return {
      format: 'JSON',
      questions: drafts,
      embeddedImagesCount,
      summary: {
        total: drafts.length,
        pg: drafts.filter((d) => d.type === 'pg').length,
        pgk: drafts.filter((d) => d.type === 'pgk').length,
        essay: drafts.filter((d) => d.type === 'essay').length,
      },
    };
  }

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' || ext === 'ods') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const drafts = parseTabularRows(rows, startingOrderNumber);
    return {
      format: ext.toUpperCase(),
      questions: drafts,
      embeddedImagesCount,
      summary: {
        total: drafts.length,
        pg: drafts.filter((d) => d.type === 'pg').length,
        pgk: drafts.filter((d) => d.type === 'pgk').length,
        essay: drafts.filter((d) => d.type === 'essay').length,
      },
    };
  }

  if (ext === 'docx') {
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const base64 = await image.read('base64');
          const url = await onSaveEmbeddedImage(base64, image.contentType || 'image/png');
          embeddedImagesCount += 1;
          return { src: url };
        }),
      }
    );

    const { tabularRows, remainingHtml } = extractTablesFromHtml(result.value);
    const tableDrafts =
      tabularRows.length > 0 ? parseTabularRows(tabularRows, startingOrderNumber) : [];

    // Convert remaining HTML to structured text lines preserving embedded image URLs
    const textWithImgMarkers = remainingHtml
      .replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, '\nGambar: $1\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '');

    const cleanText = decodeHtmlEntities(textWithImgMarkers);
    const textDrafts = parseStructuredText(
      cleanText,
      startingOrderNumber + tableDrafts.length
    );

    const drafts = [...tableDrafts, ...textDrafts];
    return {
      format: 'DOCX',
      questions: drafts,
      embeddedImagesCount,
      summary: {
        total: drafts.length,
        pg: drafts.filter((d) => d.type === 'pg').length,
        pgk: drafts.filter((d) => d.type === 'pgk').length,
        essay: drafts.filter((d) => d.type === 'essay').length,
      },
    };
  }

  // Fallback: TXT / MD plain text
  const rawText = buffer.toString('utf8');
  const drafts = parseStructuredText(rawText, startingOrderNumber);
  return {
    format: ext ? ext.toUpperCase() : 'TXT',
    questions: drafts,
    embeddedImagesCount,
    summary: {
      total: drafts.length,
      pg: drafts.filter((d) => d.type === 'pg').length,
      pgk: drafts.filter((d) => d.type === 'pgk').length,
      essay: drafts.filter((d) => d.type === 'essay').length,
    },
  };
}

export function convertDraftToQuestion(
  draft: ParsedQuestionDraft,
  meta: {
    assessmentId: string;
    authorId: string;
    authorName: string;
  },
  idx: number
): Question {
  return {
    id: `q-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    assessmentId: meta.assessmentId,
    orderNumber: Number(draft.orderNumber),
    type: draft.type,
    domain: draft.domain,
    cognitiveLevel: draft.cognitiveLevel,
    stimulusTitle: draft.stimulusTitle,
    stimulusPassage: draft.stimulusPassage,
    imageUrl: draft.imageUrl,
    imageCaption: draft.imageCaption,
    videoUrl: draft.videoUrl,
    videoCaption: draft.videoCaption,
    prompt: draft.prompt,
    options: draft.type === 'essay' ? [] : draft.options,
    correctOptionId: draft.type === 'pg' ? draft.correctOptionId : undefined,
    correctOptionIds: draft.type === 'pgk' ? draft.correctOptionIds || [] : [],
    essayKeywords: draft.type === 'essay' ? draft.essayKeywords || [] : [],
    essaySampleAnswer: draft.type === 'essay' ? draft.essaySampleAnswer : undefined,
    maxPoints: Number(draft.maxPoints || 10),
    authorId: meta.authorId,
    authorName: meta.authorName,
  };
}

const TEMPLATE_ROWS = [
  {
    No: 1,
    Tipe: 'PG',
    Domain: 'Literasi Membaca',
    Level: 'L2 Penerapan',
    Poin: 15,
    'Judul Stimulus': 'Gerakan Sedekah Sampah Madrasah',
    Stimulus:
      'Setiap hari Jumat, siswa MI Ma\'arif Al Ihsan Soborejo mengumpulkan botol plastik bersih ke Bank Sampah Madrasah untuk didaur ulang dan hasilnya disalurkan ke kas sosial kelas.',
    Pertanyaan: 'Apa manfaat utama dari kegiatan Bank Sampah Madrasah pada bacaan tersebut?',
    'Opsi A': 'Menambah jumlah sampah plastik di halaman sekolah.',
    'Opsi B': 'Menjaga kebersihan lingkungan sekaligus melatih kepedulian sosial siswa.',
    'Opsi C': 'Menggantikan seluruh pelajaran Ilmu Pengetahuan Alam.',
    'Opsi D': 'Mengharuskan siswa membeli botol plastik setiap hari.',
    Kunci: 'B',
    'Kata Kunci Esai': '',
    'Jawaban Ideal': '',
    Gambar: '',
    Video: '',
  },
  {
    No: 2,
    Tipe: 'PGK',
    Domain: 'Numerasi',
    Level: 'L3 Penalaran',
    Poin: 20,
    'Judul Stimulus': 'Pengadaan Rak Buku Perpustakaan',
    Stimulus:
      'Perpustakaan madrasah memiliki 3 rak baru. Setiap rak terdiri atas 4 susun, dan setiap susun dapat memuat 18 buku bacaan.',
    Pertanyaan:
      'Pilihlah DUA pernyataan yang BENAR berdasarkan data kapasitas rak buku tersebut!',
    'Opsi A': 'Total kapasitas seluruh rak baru adalah 216 buku.',
    'Opsi B': 'Satu rak buku dapat menampung maksimal 72 buku.',
    'Opsi C': 'Dua rak buku hanya menampung 120 buku.',
    'Opsi D': 'Jika tersedia 200 buku, masih ada sisa 20 tempat kosong.',
    Kunci: 'A, B',
    'Kata Kunci Esai': '',
    'Jawaban Ideal': '',
    Gambar: '',
    Video: '',
  },
  {
    No: 3,
    Tipe: 'ESAI',
    Domain: 'PAI & Akhlak',
    Level: 'L2 Penerapan',
    Poin: 25,
    'Judul Stimulus': 'Adab Kejujuran Saat Ujian',
    Stimulus:
      'Rasulullah SAW mengajarkan sifat shiddiq (jujur) dalam setiap perbuatan, termasuk ketika mengerjakan evaluasi belajar di madrasah.',
    Pertanyaan:
      'Jelaskan dua contoh penerapan sikap jujur saat mengikuti asesmen berbasis komputer dan manfaatnya bagi dirimu!',
    'Opsi A': '',
    'Opsi B': '',
    'Opsi C': '',
    'Opsi D': '',
    Kunci: '',
    'Kata Kunci Esai': 'jujur|shiddiq, mandiri|tidak menyontek, percaya diri, berkah|amanah',
    'Jawaban Ideal':
      'Mengerjakan soal secara mandiri tanpa menyontek dan tidak membuka catatan terlarang sehingga hasil nilai mencerminkan kemampuan asli serta membawa keberkahan ilmu.',
    Gambar: '',
    Video: '',
  },
];

export function buildExcelTemplateBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_ROWS);
  ws['!cols'] = [
    { wch: 5 },
    { wch: 8 },
    { wch: 18 },
    { wch: 15 },
    { wch: 6 },
    { wch: 28 },
    { wch: 45 },
    { wch: 45 },
    { wch: 28 },
    { wch: 28 },
    { wch: 28 },
    { wch: 28 },
    { wch: 10 },
    { wch: 35 },
    { wch: 40 },
    { wch: 25 },
    { wch: 25 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Template_Soal');

  const guide = XLSX.utils.json_to_sheet([
    { Kolom: 'Tipe', Keterangan: 'Isi: PG (Pilihan Ganda), PGK (PG Kompleks), atau ESAI' },
    { Kolom: 'Domain', Keterangan: 'Literasi Membaca, Numerasi, Literasi Sains, atau PAI & Akhlak' },
    { Kolom: 'Level', Keterangan: 'L1 Pemahaman, L2 Penerapan, atau L3 Penalaran' },
    { Kolom: 'Kunci', Keterangan: 'Untuk PG isi 1 huruf (mis. B). Untuk PGK pisahkan koma (mis. A, B).' },
    { Kolom: 'Kata Kunci Esai', Keterangan: 'Pisahkan kata kunci dengan koma, dan gunakan | untuk sinonim.' },
    { Kolom: 'Gambar / Video', Keterangan: 'Opsional: isi URL gambar/MP4 dari Google Drive atau biarkan kosong.' },
  ]);
  guide['!cols'] = [{ wch: 20 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(wb, guide, 'Panduan');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function buildCsvTemplateString(): string {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_ROWS);
  XLSX.utils.book_append_sheet(wb, ws, 'Template_Soal');
  return '\uFEFF' + XLSX.utils.sheet_to_csv(ws);
}

export function buildTextTemplateString(): string {
  return `[SOAL 1]
Tipe: PG
Domain: Literasi Membaca
Level: L2 Penerapan
Poin: 15
Judul Stimulus: Gerakan Sedekah Sampah Madrasah
Stimulus: Setiap hari Jumat, siswa MI Ma'arif Al Ihsan Soborejo mengumpulkan botol plastik bersih ke Bank Sampah Madrasah untuk didaur ulang dan hasilnya disalurkan ke kas sosial kelas.
Pertanyaan: Apa manfaat utama dari kegiatan Bank Sampah Madrasah pada bacaan tersebut?
A. Menambah jumlah sampah plastik di halaman sekolah.
B. Menjaga kebersihan lingkungan sekaligus melatih kepedulian sosial siswa.
C. Menggantikan seluruh pelajaran Ilmu Pengetahuan Alam.
D. Mengharuskan siswa membeli botol plastik setiap hari.
Kunci: B

---

[SOAL 2]
Tipe: PGK
Domain: Numerasi
Level: L3 Penalaran
Poin: 20
Judul Stimulus: Pengadaan Rak Buku Perpustakaan
Stimulus: Perpustakaan madrasah memiliki 3 rak baru. Setiap rak terdiri atas 4 susun, dan setiap susun dapat memuat 18 buku bacaan.
Pertanyaan: Pilihlah DUA pernyataan yang BENAR berdasarkan data kapasitas rak buku tersebut!
A. Total kapasitas seluruh rak baru adalah 216 buku.
B. Satu rak buku dapat menampung maksimal 72 buku.
C. Dua rak buku hanya menampung 120 buku.
D. Jika tersedia 200 buku, masih ada sisa 20 tempat kosong.
Kunci: A, B

---

[SOAL 3]
Tipe: ESAI
Domain: PAI & Akhlak
Level: L2 Penerapan
Poin: 25
Judul Stimulus: Adab Kejujuran Saat Ujian
Stimulus: Rasulullah SAW mengajarkan sifat shiddiq (jujur) dalam setiap perbuatan, termasuk ketika mengerjakan evaluasi belajar di madrasah.
Pertanyaan: Jelaskan dua contoh penerapan sikap jujur saat mengikuti asesmen berbasis komputer dan manfaatnya bagi dirimu!
Kata Kunci: jujur|shiddiq, mandiri|tidak menyontek, percaya diri, berkah|amanah
Jawaban Ideal: Mengerjakan soal secara mandiri tanpa menyontek dan tidak membuka catatan terlarang sehingga hasil nilai mencerminkan kemampuan asli serta membawa keberkahan ilmu.
`;
}
