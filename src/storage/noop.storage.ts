import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  ObjectStorage,
  StoredObject,
  UploadImageInput,
  UploadPdfInput,
} from './storage.types';

/**
 * Used when Cloudinary (or future S3) credentials are not configured.
 * Extract/approve still work; cloud URLs are simply omitted.
 */
@Injectable()
export class NoopStorage implements ObjectStorage {
  readonly provider = 'none' as const;

  async uploadPdf(_input: UploadPdfInput): Promise<StoredObject> {
    throw new ServiceUnavailableException(
      'Object storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    );
  }

  async uploadImage(_input: UploadImageInput): Promise<StoredObject> {
    throw new ServiceUnavailableException(
      'Object storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    );
  }
}
