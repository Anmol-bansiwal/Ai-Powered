import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, sep } from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MAX_PDF_PAGES } from './pdf-text';

const MAX_FIGURE_INDEX = 40;

export function writeFigureFile(
  fileHash: string,
  page: number,
  index: number,
  png: Buffer,
): void {
  const path = figurePath(fileHash, page, index);
  mkdirSync(join(figureDirectory(), fileHash), { recursive: true });
  writeFileSync(path, png);
}

export function readFigureFile(
  fileHash: string,
  page: number,
  index: number,
): Buffer {
  try {
    return readFileSync(figurePath(fileHash, page, index));
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new NotFoundException('Figure was not found.');
  }
}

function figureDirectory(): string {
  return join(tmpdir(), 'edusearch-ai', 'figures');
}

function figurePath(fileHash: string, page: number, index: number): string {
  if (!/^[a-f0-9]{64}$/.test(fileHash)) {
    throw new BadRequestException('Figure reference is not valid.');
  }
  if (!Number.isInteger(page) || page < 1 || page > MAX_PDF_PAGES) {
    throw new BadRequestException('Figure reference is not valid.');
  }
  if (!Number.isInteger(index) || index < 1 || index > MAX_FIGURE_INDEX) {
    throw new BadRequestException('Figure reference is not valid.');
  }
  const root = resolve(figureDirectory());
  const path = resolve(root, fileHash, `${page}-${index}.png`);
  if (!path.startsWith(`${root}${sep}`)) {
    throw new BadRequestException('Figure reference is not valid.');
  }
  return path;
}
