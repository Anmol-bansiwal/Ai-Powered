import { extractImages, getDocumentProxy, getResolvedPDFJS } from 'unpdf';
import { FigurePlacement } from './figure-association';
import { writeFigureFile } from './figure-store';
import { encodePng } from './pdf-png';
import { MAX_PDF_PAGES } from './pdf-text';
import { sha256Hex } from './source-document';

type Matrix = [number, number, number, number, number, number];

type ImagePosition = {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

// Embedded images are copied to temporary PNG files for the review screen.
// A fresh PDF.js document is opened for this pass because an earlier text
// extraction already transferred its buffer. Pixel bytes are not stored in
// the database, and the image content is not interpreted.
export async function extractPdfFigures(
  bytes: Buffer,
): Promise<FigurePlacement[]> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
    const fileHash = sha256Hex(bytes);
    const { OPS } = await getResolvedPDFJS();
    const placements: FigurePlacement[] = [];
    const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
    for (let page = 1; page <= pageCount; page += 1) {
      try {
        placements.push(...(await figuresOnPage(pdf, page, fileHash, OPS)));
      } catch {
        continue;
      }
    }
    return placements;
  } catch {
    return [];
  } finally {
    await closeDocument(
      pdf as unknown as { destroy?: () => Promise<void> } | undefined,
    );
  }
}

async function closeDocument(
  pdf: { destroy?: () => Promise<void> } | undefined,
): Promise<void> {
  try {
    await pdf?.destroy?.();
  } catch {
    // The document was only used to copy images for review.
  }
}

async function figuresOnPage(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  pageNumber: number,
  fileHash: string,
  ops: Awaited<ReturnType<typeof getResolvedPDFJS>>['OPS'],
): Promise<FigurePlacement[]> {
  const page = await pdf.getPage(pageNumber);
  const operatorList = await page.getOperatorList();
  const positions = imagePositions(operatorList, ops);
  const images = await extractImages(pdf, pageNumber);
  const used = new Set<number>();
  const placements: FigurePlacement[] = [];

  for (let imageNumber = 0; imageNumber < images.length; imageNumber += 1) {
    const image = images[imageNumber];
    const positionIndex = positions.findIndex(
      (position, index) => !used.has(index) && position.key === image.key,
    );
    if (positionIndex >= 0) {
      used.add(positionIndex);
    }
    const position = positionIndex >= 0 ? positions[positionIndex] : undefined;
    try {
      const png = encodePng(
        image.data,
        image.width,
        image.height,
        image.channels,
      );
      const index = imageNumber + 1;
      writeFigureFile(fileHash, pageNumber, index, png);
      placements.push({
        page: pageNumber,
        index,
        x: position?.x ?? 0,
        y: position?.y ?? 0,
        width: position?.width ?? 0,
        height: position?.height ?? 0,
        pixelWidth: image.width,
        pixelHeight: image.height,
      });
    } catch {
      continue;
    }
  }

  return placements;
}

function imagePositions(
  operatorList: { fnArray: number[]; argsArray: unknown[] },
  ops: {
    save: number;
    restore: number;
    transform: number;
    paintImageXObject: number;
  },
): ImagePosition[] {
  let current: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const positions: ImagePosition[] = [];

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const fn = operatorList.fnArray[index];
    if (fn === ops.save) {
      stack.push(current);
      continue;
    }
    if (fn === ops.restore) {
      current = stack.pop() ?? current;
      continue;
    }
    if (fn === ops.transform) {
      const next = numericMatrix(operatorList.argsArray[index]);
      if (next) {
        current = multiply(current, next);
      }
      continue;
    }
    if (fn === ops.paintImageXObject) {
      const args = operatorList.argsArray[index];
      const key = Array.isArray(args) ? String(args[0]) : '';
      positions.push({ key, ...boxFromMatrix(current) });
    }
  }

  return positions;
}

function numericMatrix(value: unknown): Matrix | undefined {
  if (!Array.isArray(value) || value.length < 6) {
    return undefined;
  }
  const numbers = value.slice(0, 6).map((item) => Number(item));
  if (numbers.some((item) => !Number.isFinite(item))) {
    return undefined;
  }
  return numbers as Matrix;
}

function multiply(current: Matrix, next: Matrix): Matrix {
  const [a, b, c, d, e, f] = current;
  const [a2, b2, c2, d2, e2, f2] = next;
  return [
    a * a2 + c * b2,
    b * a2 + d * b2,
    a * c2 + c * d2,
    b * c2 + d * d2,
    a * e2 + c * f2 + e,
    b * e2 + d * f2 + f,
  ];
}

function boxFromMatrix(matrix: Matrix): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const [a, b, c, d, e, f] = matrix;
  const xs = [e, e + a, e + c, e + a + c];
  const ys = [f, f + b, f + d, f + b + d];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}
