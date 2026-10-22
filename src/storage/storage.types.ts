/** Cloud now; swap to `s3` when the client uploads to S3 directly. */
export type StorageProvider = 'cloudinary' | 's3' | 'none';

export type StoredObject = {
  provider: Exclude<StorageProvider, 'none'>;
  url: string;
  publicId: string;
  bytes: number;
  contentType: string;
};

export type UploadPdfInput = {
  buffer: Buffer;
  filename: string;
  /** Stable folder key (e.g. PDF sha256) so re-approve overwrites the same object. */
  fileHash: string;
};

export type UploadImageInput = {
  buffer: Buffer;
  /** e.g. `${fileHash}/${page}-${index}` */
  publicId: string;
  filename?: string;
};

/**
 * Object storage port. Cloudinary is the current backend.
 * A later S3 adapter (or client-side S3 upload + URL handoff) should implement this.
 */
export interface ObjectStorage {
  readonly provider: StorageProvider;
  uploadPdf(input: UploadPdfInput): Promise<StoredObject>;
  uploadImage(input: UploadImageInput): Promise<StoredObject>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
