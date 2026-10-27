import { renderPageAsImage } from 'unpdf';
import { PageLine } from './equation-text';

export const DEFAULT_OCR_MIN_TEXT = 0;
export const DEFAULT_OCR_DPI_SCALE = 2; // ~150-200 DPI

export type OcrPageResult = {
  text: string;
  lines: PageLine[];
  confidence: number;
};

/**
 * Determines whether a page appears to be scanned or contains insufficient native text.
 * Pages with no text or only whitespace/non-word artifacts are treated as scanned.
 */
export function isScannedOrLowText(
  nativeText: string,
  minTextLength = DEFAULT_OCR_MIN_TEXT,
): boolean {
  if (!nativeText) {
    return true;
  }
  const clean = nativeText.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) {
    return true;
  }
  if (minTextLength > 0 && clean.length < minTextLength && !/[a-zA-Z]{4,}/.test(clean)) {
    return true;
  }
  return false;
}

/**
 * Runs Tesseract OCR on a specific page of a PDF by rasterizing it.
 */
export async function ocrPdfPage(
  pdfBytes: Buffer | Uint8Array,
  pageNumber: number,
  options?: {
    scale?: number;
    language?: string;
  },
): Promise<OcrPageResult | null> {
  const scale = options?.scale ?? DEFAULT_OCR_DPI_SCALE;
  const lang = options?.language ?? 'eng';

  try {
    // 1. Render the PDF page into a high-resolution image buffer
    const imageBytes = await renderPageAsImage(
      new Uint8Array(pdfBytes),
      pageNumber,
      {
        canvasImport: () => import('@napi-rs/canvas'),
        scale,
      },
    );

    if (!imageBytes || imageBytes.byteLength === 0) {
      return null;
    }

    // 2. Perform OCR using Tesseract.js
    const Tesseract = await import('tesseract.js');
    const result = await Tesseract.recognize(Buffer.from(imageBytes), lang);

    const fullText = (result.data?.text ?? '').trim();
    const confidence = result.data?.confidence ?? 0;

    // 3. Map Tesseract layout (blocks -> paragraphs -> lines) to PageLine
    const estimatedHeight = 792 * scale;
    const lines: PageLine[] = [];

    if (Array.isArray(result.data?.blocks)) {
      for (const block of result.data.blocks) {
        if (!Array.isArray(block.paragraphs)) continue;
        for (const paragraph of block.paragraphs) {
          if (!Array.isArray(paragraph.lines)) continue;
          for (const line of paragraph.lines) {
            const text = line.text?.trim();
            if (text) {
              const y0 = line.bbox?.y0 ?? 0;
              const y1 = line.bbox?.y1 ?? 20;
              const top = estimatedHeight - y0;
              const bottom = estimatedHeight - y1;
              lines.push({ text, top, bottom });
            }
          }
        }
      }
    }

    // Fallback: If blocks were not parsed, split fullText line-by-line
    if (lines.length === 0 && fullText) {
      const textLines = fullText.split('\n');
      const step = estimatedHeight / Math.max(textLines.length, 1);
      textLines.forEach((rawLine, index) => {
        const text = rawLine.trim();
        if (text) {
          lines.push({
            text,
            top: estimatedHeight - index * step,
            bottom: estimatedHeight - (index + 1) * step,
          });
        }
      });
    }

    return {
      text: fullText,
      lines,
      confidence,
    };
  } catch {
    return null;
  }
}
