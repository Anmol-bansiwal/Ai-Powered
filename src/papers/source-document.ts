import { createHash } from 'crypto';

const HASH_MARKER = '#sha256:';
const MAX_SOURCE_LENGTH = 500;

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sanitizeFilename(originalName: string | undefined): string {
  const base = (originalName ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/[^\w.\- ()[\]]+/g, '')
    .trim();
  const filename = base && base.length > 0 ? base : 'upload.pdf';
  return filename.slice(0, 200);
}

// The hash lives in the existing source_document text. No new column is required.
// Same file + page + normalized text is a duplicate. A different file hash is not.
export function sourceDocumentKey(filename: string, fileHash: string): string {
  const key = `${filename}${HASH_MARKER}${fileHash}`;
  if (key.length > MAX_SOURCE_LENGTH) {
    throw new Error('Filename is too long.');
  }
  return key;
}

export function normalizeQuestionText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
