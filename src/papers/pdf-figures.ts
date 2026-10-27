import {
  extractImages,
  getDocumentProxy,
  getResolvedPDFJS,
  renderPageAsImage,
} from 'unpdf';
import { createCanvas, loadImage } from '@napi-rs/canvas';
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

type VectorCluster = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  count: number;
};

// Embedded images and vector diagrams are copied to temporary PNG files for the review screen.
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
        placements.push(
          ...(await figuresOnPage(pdf, page, fileHash, OPS, bytes)),
        );
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
  bytes?: Buffer,
): Promise<FigurePlacement[]> {
  const page = await pdf.getPage(pageNumber);
  const operatorList = await page.getOperatorList();
  const positions = imagePositions(operatorList, ops);
  let images: Array<{
    data: Uint8ClampedArray;
    width: number;
    height: number;
    channels: 1 | 3 | 4;
    key: string;
  }> = [];
  try {
    images = await extractImages(pdf, pageNumber);
  } catch {
    images = [];
  }
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
      const index = placements.length + 1;
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

  // Next, detect vector diagrams and graphs drawn with PDF paths
  if (bytes) {
    try {
      const viewport = page.getViewport?.({ scale: 1.0 }) ?? {
        width: 595,
        height: 842,
      };
      const vectorDiagrams = detectVectorDiagrams(operatorList, ops, viewport);
      if (vectorDiagrams.length > 0) {
        // Filter out vector diagrams that overlap already-extracted raster images
        const unrendered = vectorDiagrams.filter((diag) => {
          return !placements.some((p) => {
            const overlapX = Math.max(
              0,
              Math.min(diag.x1, p.x + p.width) - Math.max(diag.x0, p.x),
            );
            const overlapY = Math.max(
              0,
              Math.min(diag.y1, p.y + p.height) - Math.max(diag.y0, p.y),
            );
            return overlapX > 20 && overlapY > 20;
          });
        });

        if (unrendered.length > 0) {
          const pageImgBuffer = await renderPageAsImage(
            new Uint8Array(bytes),
            pageNumber,
            {
              canvasImport: () => import('@napi-rs/canvas'),
              scale: 2.0,
            },
          );
          const pageImg = await loadImage(Buffer.from(pageImgBuffer));
          const scale = pageImg.width / viewport.width;

          for (const diag of unrendered) {
            const pad = 12;
            const x0 = Math.max(0, diag.x0 - pad);
            const x1 = Math.min(viewport.width, diag.x1 + pad);
            const y0 = Math.max(0, diag.y0 - pad);
            const y1 = Math.min(viewport.height, diag.y1 + pad);

            const cropX = Math.round(x0 * scale);
            const cropY = Math.round((viewport.height - y1) * scale);
            const cropW = Math.round((x1 - x0) * scale);
            const cropH = Math.round((y1 - y0) * scale);

            if (cropW <= 0 || cropH <= 0) continue;

            const canvas = createCanvas(cropW, cropH);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(
              pageImg,
              cropX,
              cropY,
              cropW,
              cropH,
              0,
              0,
              cropW,
              cropH,
            );
            const png = canvas.toBuffer('image/png');

            const index = placements.length + 1;
            writeFigureFile(fileHash, pageNumber, index, png);
            placements.push({
              page: pageNumber,
              index,
              x: x0,
              y: y0,
              width: x1 - x0,
              height: y1 - y0,
              pixelWidth: cropW,
              pixelHeight: cropH,
            });
          }
        }
      }
    } catch {
      // Vector diagram extraction fallback: if canvas or rendering fails, keep raster placements
    }
  }

  return placements;
}

function detectVectorDiagrams(
  operatorList: { fnArray: number[]; argsArray: unknown[] },
  ops: {
    save: number;
    restore: number;
    transform: number;
    constructPath?: number;
  },
  viewport: { width: number; height: number },
): VectorCluster[] {
  if (!ops.constructPath) {
    return [];
  }
  const viewW = viewport.width;
  const viewH = viewport.height;
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const boxes: VectorCluster[] = [];

  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const fn = operatorList.fnArray[i];
    const args = operatorList.argsArray[i];

    if (fn === ops.save) {
      stack.push([...matrix]);
    } else if (fn === ops.restore) {
      if (stack.length > 0) matrix = stack.pop()!;
    } else if (fn === ops.transform) {
      const next = numericMatrix(args);
      if (next) {
        matrix = multiply(matrix, next);
      }
    } else if (fn === ops.constructPath) {
      const minMax =
        Array.isArray(args) && args.length >= 3
          ? (args[2] as Record<string, number> | undefined)
          : undefined;
      if (minMax && typeof minMax['0'] === 'number') {
        const x0 = minMax['0'],
          y0 = minMax['1'],
          x1 = minMax['2'],
          y1 = minMax['3'];
        const p1x = matrix[0] * x0 + matrix[2] * y0 + matrix[4];
        const p1y = matrix[1] * x0 + matrix[3] * y0 + matrix[5];
        const p2x = matrix[0] * x1 + matrix[2] * y1 + matrix[4];
        const p2y = matrix[1] * x1 + matrix[3] * y1 + matrix[5];
        const bx0 = Math.min(p1x, p2x);
        const by0 = Math.min(p1y, p2y);
        const bx1 = Math.max(p1x, p2x);
        const by1 = Math.max(p1y, p2y);
        const w = bx1 - bx0;
        const h = by1 - by0;

        const isBorder = w >= viewW * 0.85 && h >= viewH * 0.85;
        const isMarginBarcode =
          (bx0 <= 65 || bx1 >= viewW - 65) && h > viewH * 0.7;
        const isFullWidthRule = w >= viewW * 0.6 && h <= 2;
        const isSmall = w <= 3 && h <= 3;

        if (!isBorder && !isMarginBarcode && !isFullWidthRule && !isSmall) {
          boxes.push({ x0: bx0, y0: by0, x1: bx1, y1: by1, count: 1 });
        }
      }
    }
  }

  if (boxes.length === 0) {
    return [];
  }

  // Iterative clustering: merge any two clusters if gapX <= 75 and gapY <= 50
  const clusters = [...boxes];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const c1 = clusters[i];
        const c2 = clusters[j];
        const gapX = Math.max(
          0,
          Math.max(c1.x0, c2.x0) - Math.min(c1.x1, c2.x1),
        );
        const gapY = Math.max(
          0,
          Math.max(c1.y0, c2.y0) - Math.min(c1.y1, c2.y1),
        );
        if (gapX <= 75 && gapY <= 50) {
          c1.x0 = Math.min(c1.x0, c2.x0);
          c1.y0 = Math.min(c1.y0, c2.y0);
          c1.x1 = Math.max(c1.x1, c2.x1);
          c1.y1 = Math.max(c1.y1, c2.y1);
          c1.count += c2.count;
          clusters.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return clusters.filter(
    (c) => c.x1 - c.x0 >= 30 && c.y1 - c.y0 >= 25 && c.count >= 2,
  );
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
