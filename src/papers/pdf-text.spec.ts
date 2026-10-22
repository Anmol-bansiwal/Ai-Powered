import { UnprocessableEntityException } from '@nestjs/common';
import { extractImages, getDocumentProxy } from 'unpdf';
import { extractPdfPages, MAX_PDF_BYTES, MAX_PDF_PAGES } from './pdf-text';
import { buildTextPdf } from './text-pdf.fixture';

describe('PDF text extraction', () => {
  it('rejects a file that is not a PDF', async () => {
    await expect(extractPdfPages(Buffer.from('not a pdf'))).rejects.toThrow(
      'The file is not a PDF.',
    );
  });

  it('rejects an oversize PDF before parsing', async () => {
    const bytes = Buffer.concat([
      Buffer.from('%PDF-'),
      Buffer.alloc(MAX_PDF_BYTES),
    ]);
    await expect(extractPdfPages(bytes)).rejects.toThrow(
      'PDF must be at most 10 MB.',
    );
  });

  it('rejects a malformed PDF', async () => {
    await expect(
      extractPdfPages(Buffer.from('%PDF-1.4 this is not a valid document')),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects a PDF with no extractable text', async () => {
    await expect(extractPdfPages(buildTextPdf([[]]))).rejects.toThrow(
      'No text could be extracted from this PDF.',
    );
  });

  it('rejects a PDF over the page limit', async () => {
    const pages = Array.from({ length: MAX_PDF_PAGES + 1 }, (_, index) => [
      `Page ${index + 1}`,
    ]);
    await expect(extractPdfPages(buildTextPdf(pages))).rejects.toThrow(
      'PDF must be at most 80 pages.',
    );
  });

  it('returns text for each page', async () => {
    const pages = await extractPdfPages(
      buildTextPdf([['1. First question'], ['2. Second question']]),
    );
    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(pages[0].text).toContain('1. First question');
    expect(pages[1].text).toContain('2. Second question');
  });

  it('reads embedded images from a fresh copy and rejects a reused buffer', async () => {
    const pdf = buildTextPdf([['A text question without a figure.']]);
    const reused = new Uint8Array(pdf);
    await getDocumentProxy(reused);
    await expect(extractImages(reused, 1)).rejects.toThrow(
      /Cannot transfer object of unsupported type/,
    );

    const images = await extractImages(new Uint8Array(pdf), 1);
    expect(images).toEqual([]);
  });
});
