import type {
  GradedQuestionResult,
  Question,
  StudentAnswerPayload,
  SubmissionRecord,
} from '../types/cbt.ts';

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,!?;:"'()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function gradeQuestion(
  question: Question,
  answer: StudentAnswerPayload | undefined
): GradedQuestionResult {
  const maxPoints = question.maxPoints || 10;

  if (question.type === 'pg') {
    const selectedId = answer?.selectedOptionId || '';
    const selectedOpt = question.options.find((o) => o.id === selectedId);
    const correctOpt = question.options.find((o) => o.id === question.correctOptionId);
    const isCorrect = Boolean(selectedId && selectedId === question.correctOptionId);
    const earned = isCorrect ? maxPoints : 0;

    return {
      questionId: question.id,
      orderNumber: question.orderNumber,
      type: question.type,
      domain: question.domain,
      prompt: question.prompt,
      studentAnswerText: selectedOpt
        ? `${selectedOpt.label}. ${selectedOpt.text}`
        : 'Tidak dijawab',
      maxPoints,
      earnedPoints: earned,
      status: isCorrect ? 'correct' : 'incorrect',
      matchedKeywords: [],
      missedKeywords: [],
      feedback: isCorrect
        ? 'Jawaban Pilihan Ganda tepat.'
        : `Belum tepat. Kunci jawaban: ${correctOpt ? `${correctOpt.label}. ${correctOpt.text}` : '-'}.`,
    };
  }

  if (question.type === 'pgk') {
    const selectedIds = Array.from(new Set(answer?.selectedOptionIds || []));
    const correctIds = question.correctOptionIds || [];
    const selectedLabels = question.options
      .filter((o) => selectedIds.includes(o.id))
      .map((o) => `${o.label}. ${o.text}`);

    if (selectedIds.length === 0 || correctIds.length === 0) {
      return {
        questionId: question.id,
        orderNumber: question.orderNumber,
        type: question.type,
        domain: question.domain,
        prompt: question.prompt,
        studentAnswerText: 'Tidak dijawab',
        maxPoints,
        earnedPoints: 0,
        status: 'incorrect',
        matchedKeywords: [],
        missedKeywords: [],
        feedback: 'Belum ada pernyataan yang dipilih.',
      };
    }

    const correctHits = selectedIds.filter((id) => correctIds.includes(id)).length;
    const wrongHits = selectedIds.filter((id) => !correctIds.includes(id)).length;

    // Proportional AKM scoring with penalty for wrong selections so selecting all options yields partial/low score
    const rawRatio = (correctHits - wrongHits * 0.5) / correctIds.length;
    const clampedRatio = Math.max(0, Math.min(1, rawRatio));
    const earned = Math.round(clampedRatio * maxPoints * 100) / 100;

    const status =
      correctHits === correctIds.length && wrongHits === 0
        ? 'correct'
        : earned > 0
          ? 'partial'
          : 'incorrect';

    return {
      questionId: question.id,
      orderNumber: question.orderNumber,
      type: question.type,
      domain: question.domain,
      prompt: question.prompt,
      studentAnswerText: selectedLabels.join(' | '),
      maxPoints,
      earnedPoints: earned,
      status,
      matchedKeywords: [],
      missedKeywords: [],
      feedback:
        status === 'correct'
          ? `Semua ${correctIds.length} pernyataan benar dipilih dengan tepat.`
          : `Terpilih ${correctHits} dari ${correctIds.length} pernyataan benar (${wrongHits} pilihan kurang tepat).`,
    };
  }

  // Essay automatic rubric grading using keyword/concept clusters + structured response completeness
  const rawEssay = (answer?.essayText || '').trim();
  const normalizedEssay = normalizeText(rawEssay);
  const keywordGroups = question.essayKeywords || [];

  if (!rawEssay) {
    return {
      questionId: question.id,
      orderNumber: question.orderNumber,
      type: question.type,
      domain: question.domain,
      prompt: question.prompt,
      studentAnswerText: 'Tidak dijawab',
      maxPoints,
      earnedPoints: 0,
      status: 'incorrect',
      matchedKeywords: [],
      missedKeywords: keywordGroups.map((k) => k.split('|')[0]),
      feedback: 'Jawaban esai masih kosong.',
    };
  }

  const matchedKeywords: string[] = [];
  const missedKeywords: string[] = [];

  for (const group of keywordGroups) {
    const synonyms = group
      .split('|')
      .map((s) => normalizeText(s))
      .filter(Boolean);
    const primaryLabel = group.split('|')[0].trim();
    const isMatched = synonyms.some((syn) => normalizedEssay.includes(syn));
    if (isMatched) {
      matchedKeywords.push(primaryLabel);
    } else {
      missedKeywords.push(primaryLabel);
    }
  }

  const wordCount = normalizedEssay.split(' ').filter(Boolean).length;
  let ratio = 0;

  if (keywordGroups.length > 0) {
    const keywordRatio = matchedKeywords.length / keywordGroups.length;
    const lengthBonus = wordCount >= 12 ? 0.15 : wordCount >= 5 ? 0.08 : 0;
    ratio = Math.min(1, keywordRatio * 0.85 + (matchedKeywords.length > 0 ? lengthBonus : 0));
  } else {
    ratio = wordCount >= 15 ? 0.8 : wordCount >= 6 ? 0.5 : 0.25;
  }

  const earned = Math.round(ratio * maxPoints * 100) / 100;

  return {
    questionId: question.id,
    orderNumber: question.orderNumber,
    type: question.type,
    domain: question.domain,
    prompt: question.prompt,
    studentAnswerText: rawEssay,
    maxPoints,
    earnedPoints: earned,
    status: 'auto_rubric',
    matchedKeywords,
    missedKeywords,
    feedback:
      matchedKeywords.length > 0
        ? `Dinilai otomatis oleh rubrik (${matchedKeywords.length}/${keywordGroups.length || 1} konsep kunci terpenuhi).`
        : 'Konsep kunci rubrik belum terdeteksi; disarankan tinjauan guru.',
  };
}

export function computePredicate(
  score: number
): SubmissionRecord['predicate'] {
  if (score >= 88) return 'Sangat Baik';
  if (score >= 75) return 'Baik';
  if (score >= 60) return 'Cukup';
  return 'Perlu Bimbingan';
}

export function computeDomainBreakdown(items: GradedQuestionResult[]) {
  const map = new Map<string, { earned: number; max: number }>();
  for (const item of items) {
    const prev = map.get(item.domain) || { earned: 0, max: 0 };
    map.set(item.domain, {
      earned: prev.earned + item.earnedPoints,
      max: prev.max + item.maxPoints,
    });
  }
  return Array.from(map.entries()).map(([domain, val]) => ({
    domain,
    earned: Math.round(val.earned * 100) / 100,
    max: val.max,
    percentage: val.max > 0 ? Math.round((val.earned / val.max) * 100) : 0,
  }));
}
