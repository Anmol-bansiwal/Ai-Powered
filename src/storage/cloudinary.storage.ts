import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { validateEnv } from '../config/env.validation';
import type {
  ObjectStorage,
  StoredObject,
  UploadImageInput,
  UploadPdfInput,
} from './storage.types';

const PAPER_FOLDER = 'edusearch/papers';
const FIGURE_FOLDER = 'edusearch/figures';

@Injectable()
export class CloudinaryStorage implements ObjectStorage {
  readonly provider = 'cloudinary' as const;
  private readonly logger = new Logger(CloudinaryStorage.name);
  private configured = false;

  private ensureConfigured(): void {
    if (this.configured) {
      return;
    }
    const env = validateEnv(process.env);
    if (
      !env.CLOUDINARY_CLOUD_NAME ||
      !env.CLOUDINARY_API_KEY ||
      !env.CLOUDINARY_API_SECRET
    ) {
      throw new ServiceUnavailableException(
        'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      );
    }
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    this.configured = true;
  }

  async uploadPdf(input: UploadPdfInput): Promise<StoredObject> {
    this.ensureConfigured();
    try {
      const result = await this.uploadStream(input.buffer, {
        resource_type: 'raw',
        folder: PAPER_FOLDER,
        public_id: input.fileHash,
        overwrite: true,
        invalidate: true,
        context: `filename=${sanitizeContext(input.filename)}`,
      });
      return toStored(
        'cloudinary',
        result,
        'application/pdf',
        input.buffer.length,
      );
    } catch (error) {
      this.logger.error(error);
      throw new ServiceUnavailableException(
        'Failed to upload PDF to Cloudinary.',
      );
    }
  }

  async uploadImage(input: UploadImageInput): Promise<StoredObject> {
    this.ensureConfigured();
    try {
      const result = await this.uploadStream(input.buffer, {
        resource_type: 'image',
        folder: FIGURE_FOLDER,
        public_id: input.publicId,
        overwrite: true,
        invalidate: true,
      });
      return toStored('cloudinary', result, 'image/png', input.buffer.length);
    } catch (error) {
      this.logger.error(error);
      throw new ServiceUnavailableException(
        'Failed to upload image to Cloudinary.',
      );
    }
  }

  private uploadStream(
    buffer: Buffer,
    options: Record<string, unknown>,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Cloudinary returned no result.'));
            return;
          }
          resolve(result);
        },
      );
      Readable.from(buffer).pipe(stream);
    });
  }
}

function toStored(
  provider: 'cloudinary',
  result: UploadApiResponse,
  contentType: string,
  bytes: number,
): StoredObject {
  const url = result.secure_url || result.url;
  if (!url || !result.public_id) {
    throw new ServiceUnavailableException(
      'Cloudinary upload response was incomplete.',
    );
  }
  return {
    provider,
    url,
    publicId: result.public_id,
    bytes: result.bytes ?? bytes,
    contentType,
  };
}

function sanitizeContext(value: string): string {
  return value.replace(/[|=]/g, '_').slice(0, 120);
}
