import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { extractTextItems } from 'unpdf';
import { assemblePageLayout, PageLine } from './equation-text';
import { isScannedOrLowText, ocrPdfPage } from './pdf-ocr';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** HSC / board papers often exceed 30 pages; keep a hard ceiling for safety. */
export const MAX_PDF_PAGES = 80;

export type PdfPage = {
  pageNumber: number;
  text: string;
  lines: PageLine[];
  ocrApplied?: boolean;
  ocrConfidence?: number;
};

// Question text comes primarily from the native PDF text layer. Raised and
// lowered numbers are written as ^{n} and _{n}. Line boxes are kept so an
// extracted image can be placed beside the question that occupies that part
// of the page. If a page contains no or very little native text (scanned PDF),
// an intelligent OCR fallback is applied for that specific page.
export async function extractPdfPages(
  bytes: Buffer,
  options?: {
    enableOcr?: boolean;
    minTextLength?: number;
  },
): Promise<PdfPage[]> {
  assertPdfBytes(bytes);
  try {
    const extracted = await extractTextItems(new Uint8Array(bytes));
    if (
      extracted.totalPages > MAX_PDF_PAGES ||
      extracted.items.length > MAX_PDF_PAGES
    ) {
      throw new UnprocessableEntityException(
        `PDF must be at most ${MAX_PDF_PAGES} pages.`,
      );
    }
    const extractedPages: PdfPage[] = extracted.items.map((items, index) => {
      const layout = assemblePageLayout(items);
      return {
        pageNumber: index + 1,
        text: layout.text,
        lines: layout.lines,
        ocrApplied: false,
      };
    });

    const ocrAllowed =
      options?.enableOcr ?? process.env.PAPER_OCR_ENABLED !== 'false';
    const minText =
      options?.minTextLength ??
      Number.parseInt(process.env.PAPER_OCR_MIN_NATIVE_TEXT || '40', 10);

    // Intelligent OCR Fallback: Only scan pages that have little or no native digital text
    if (ocrAllowed) {
      for (const page of extractedPages) {
        if (isScannedOrLowText(page.text, minText)) {
          const ocrResult = await ocrPdfPage(bytes, page.pageNumber);
          if (ocrResult && ocrResult.text.trim().length > page.text.trim().length) {
            page.text = ocrResult.text;
            page.lines = ocrResult.lines;
            page.ocrApplied = true;
            page.ocrConfidence = ocrResult.confidence;
          }
        }
      }
    }

    if (!extractedPages.some((page) => page.text.trim().length > 0)) {
      throw new UnprocessableEntityException(
        'No text could be extracted from this PDF.',
      );
    }
    return extractedPages;
  } catch (error) {
    if (
      error instanceof UnprocessableEntityException ||
      error instanceof BadRequestException
    ) {
      throw error;
    }
    if (isEncryptedPdf(error)) {
      throw new UnprocessableEntityException(
        'This PDF is encrypted and cannot be read.',
      );
    }
    throw new UnprocessableEntityException('The PDF could not be read.');
  }
}

export function assertPdfBytes(bytes: Buffer): void {
  if (!bytes || bytes.length === 0) {
    throw new BadRequestException('A PDF file is required.');
  }
  if (bytes.length > MAX_PDF_BYTES) {
    throw new BadRequestException('PDF must be at most 10 MB.');
  }
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new BadRequestException('The file is not a PDF.');
  }
}

function isEncryptedPdf(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === 'PasswordException' || /password/i.test(error.message);
}
