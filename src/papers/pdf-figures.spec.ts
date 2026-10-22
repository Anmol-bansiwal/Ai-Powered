import { createHash } from 'crypto';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { extractImages, getDocumentProxy, getResolvedPDFJS } from 'unpdf';
import { readFigureFile } from './figure-store';
import { extractPdfFigures } from './pdf-figures';

jest.mock('unpdf', () => ({
  extractImages: jest.fn(),
  getDocumentProxy: jest.fn(),
  getResolvedPDFJS: jest.fn(),
}));

const OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  paintImageXObject: 85,
};

describe('PDF figure extraction', () => {
  const bytes = Buffer.from('%PDF-1.4 figure test');
  const fileHash = createHash('sha256').update(bytes).digest('hex');

  afterEach(() => {
    rmSync(join(tmpdir(), 'edusearch-ai', 'figures', fileHash), {
      recursive: true,
      force: true,
    });
  });

  it('returns no figures when the PDF cannot be opened for images', async () => {
    jest
      .mocked(getDocumentProxy)
      .mockRejectedValue(
        new Error('Cannot transfer object of unsupported type.'),
      );

    await expect(extractPdfFigures(bytes)).resolves.toEqual([]);
  });

  it('keeps figures from other pages when one page fails', async () => {
    jest.mocked(getResolvedPDFJS).mockResolvedValue({ OPS } as never);
    jest.mocked(getDocumentProxy).mockResolvedValue(proxy(2) as never);
    jest.mocked(extractImages).mockImplementation((_pdf, page) => {
      if (page === 2) {
        return Promise.reject(new Error('image decode failed'));
      }
      return Promise.resolve([
        {
          data: Uint8ClampedArray.from([255, 0, 0]),
          width: 1,
          height: 1,
          channels: 3 as const,
          key: 'img_1',
        },
      ]);
    });

    const figures = await extractPdfFigures(bytes);

    expect(figures).toEqual([
      {
        page: 1,
        index: 1,
        x: 30,
        y: 40,
        width: 1,
        height: 1,
        pixelWidth: 1,
        pixelHeight: 1,
      },
    ]);
    expect(readFigureFile(fileHash, 1, 1).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  });
});

function proxy(pageCount: number) {
  return {
    numPages: pageCount,
    destroy: jest.fn(),
    getPage: jest.fn(() =>
      Promise.resolve({
        getOperatorList: () =>
          Promise.resolve({
            fnArray: [
              OPS.save,
              OPS.transform,
              OPS.paintImageXObject,
              OPS.restore,
            ],
            argsArray: [null, [1, 0, 0, 1, 30, 40], ['img_1'], null],
          }),
      }),
    ),
  };
}
