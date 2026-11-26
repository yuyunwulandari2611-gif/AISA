import React from 'react';

const ARABIC_LETTER_RE =
  /[\u0621-\u064A\u066E-\u06D5\u06EE-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

const ALL_ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

const ARABIC_PHRASE_RE =
  /([\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+(?:[\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF،؛؟«»\-–—٠-٩]*[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF])?)/g;

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function containsArabic(text: string): boolean {
  return ARABIC_LETTER_RE.test(text);
}

/**
 * Mengonversi angka ASCII (0-9) ke angka Arab-Indic (٠-٩).
 */
export function toArabicIndicDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => ARABIC_INDIC_DIGITS[Number(d)]);
}

/**
 * Menentukan apakah sebuah paragraf/baris sepenuhnya menggunakan aksara Arab.
 * Paragraf dianggap murni Arab jika mengandung huruf Arab dan tidak mengandung
 * huruf dari aksara lain (misal huruf Latin A-Z). Angka dan tanda baca umum diabaikan.
 */
export function isPureArabicParagraph(text: string): boolean {
  if (!containsArabic(text)) return false;
  const withoutArabic = text.replace(ALL_ARABIC_SCRIPT_RE, '');
  return !/\p{L}/u.test(withoutArabic);
}

/**
 * Memformat penomoran (1, 2, 3...) agar menyesuaikan konteks teks:
 * gunakan angka Arab (١، ٢، ٣) bila konteks teksnya murni Arab, atau angka Latin (1, 2, 3) bila tidak.
 */
export function formatContextualNumber(num: number | string, contextText: string): string {
  return isPureArabicParagraph(contextText) ? toArabicIndicDigits(num) : String(num);
}

export function getBidiInputDirection(value: string): 'rtl' | 'ltr' {
  if (!value.trim()) return 'ltr';
  return isPureArabicParagraph(value) ? 'rtl' : 'ltr';
}

export function getBidiInputClass(value: string): string {
  if (!containsArabic(value)) return '';
  if (isPureArabicParagraph(value)) {
    return 'font-arabic text-right text-lg leading-[2.0]';
  }
  return 'font-arabic text-left leading-[1.9]';
}

function renderMixedInline(text: string): React.ReactNode {
  if (!containsArabic(text)) return text;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  ARABIC_PHRASE_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = ARABIC_PHRASE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const arabicRun = match[0];
    if (containsArabic(arabicRun)) {
      parts.push(
        <span
          key={`${match.index}-${arabicRun.length}`}
          dir="rtl"
          lang="ar"
          className="arabic-inline"
        >
          {arabicRun}
        </span>
      );
    } else {
      parts.push(arabicRun);
    }
    lastIndex = match.index + arabicRun.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export type BidiVariant = 'title' | 'passage' | 'prompt' | 'option' | 'compact' | 'caption';

interface BidiParagraphsProps {
  text: string;
  variant?: BidiVariant;
  className?: string;
  prefix?: string;
}

const VARIANT_CLASSES: Record<
  BidiVariant,
  { pureArabic: string; mixed: string; defaultText: string; containerGap: string }
> = {
  title: {
    pureArabic: 'font-arabic text-2xl sm:text-[26px] font-bold text-slate-900 leading-[1.95]',
    mixed: 'text-xl font-bold text-slate-900 tracking-tight leading-[1.9]',
    defaultText: 'text-xl font-bold text-slate-900 tracking-tight',
    containerGap: 'space-y-2',
  },
  passage: {
    pureArabic: 'font-arabic text-[21px] sm:text-[23px] text-slate-900 leading-[2.25]',
    mixed: 'font-serif text-base text-slate-800 leading-[2.0]',
    defaultText: 'font-serif text-base text-slate-800 leading-relaxed',
    containerGap: 'space-y-3',
  },
  prompt: {
    pureArabic: 'font-arabic text-[20px] sm:text-[22px] font-semibold text-slate-900 leading-[2.15]',
    mixed: 'text-base font-semibold text-slate-900 leading-[1.95]',
    defaultText: 'text-base font-semibold text-slate-900 leading-relaxed',
    containerGap: 'space-y-2.5',
  },
  option: {
    pureArabic: 'font-arabic text-[18px] sm:text-[19px] font-medium leading-[2.05]',
    mixed: 'text-sm leading-[1.95]',
    defaultText: 'text-sm leading-relaxed',
    containerGap: 'space-y-1.5',
  },
  compact: {
    pureArabic: 'font-arabic text-[17px] sm:text-[18px] font-medium leading-[1.95]',
    mixed: 'text-sm font-medium leading-[1.85]',
    defaultText: 'text-sm font-medium leading-relaxed',
    containerGap: 'space-y-1.5',
  },
  caption: {
    pureArabic: 'font-arabic text-[15px] leading-[1.9]',
    mixed: 'text-xs leading-[1.8]',
    defaultText: 'text-xs leading-relaxed',
    containerGap: 'space-y-1',
  },
};

/**
 * Merender teks soal/wacana/opsi secara rapi per paragraf:
 * - Paragraf seluruhnya Arab -> dir="rtl", rata kanan, angka konteks Arab (٠-٩), font Noto Sans Arabic ukuran lebih besar & lega.
 * - Paragraf campuran Arab + Latin -> mempertahankan arah & penomoran paragraf aslinya (dir="ltr", rata kiri),
 *   namun fragmen Arab tetap memakai font Noto Sans Arabic yang lebih besar & terisolasi agar harakat jelas.
 * - Paragraf non-Arab -> mengikuti tipografi standar aplikasi.
 */
export const BidiParagraphs: React.FC<BidiParagraphsProps> = ({
  text,
  variant = 'compact',
  className = '',
  prefix,
}) => {
  if (!text) return null;

  const styles = VARIANT_CLASSES[variant];
  const paragraphs = text.split(/\r?\n/);

  return (
    <div className={`${styles.containerGap} ${className}`.trim()}>
      {paragraphs.map((rawLine, idx) => {
        const line = idx === 0 && prefix ? `${prefix}${rawLine}` : rawLine;
        if (!line.trim()) {
          return <div key={idx} className="h-1.5" aria-hidden="true" />;
        }

        const pureArabic = isPureArabicParagraph(line);
        const hasArabic = containsArabic(line);

        if (pureArabic) {
          return (
            <p
              key={idx}
              dir="rtl"
              lang="ar"
              className={`text-right ${styles.pureArabic}`}
            >
              {toArabicIndicDigits(line)}
            </p>
          );
        }

        if (hasArabic) {
          return (
            <p key={idx} dir="ltr" className={`text-left ${styles.mixed}`}>
              {renderMixedInline(line)}
            </p>
          );
        }

        return (
          <p key={idx} dir="ltr" className={`text-left ${styles.defaultText}`}>
            {line}
          </p>
        );
      })}
    </div>
  );
};
