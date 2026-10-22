import { Module } from '@nestjs/common';
import { CloudinaryStorage } from './cloudinary.storage';
import { NoopStorage } from './noop.storage';
import { OBJECT_STORAGE } from './storage.types';
import { validateEnv } from '../config/env.validation';

function cloudinaryConfigured(): boolean {
  try {
    const env = validateEnv(process.env);
    return Boolean(
      env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET,
    );
  } catch {
    return false;
  }
}

@Module({
  providers: [
    CloudinaryStorage,
    NoopStorage,
    {
      provide: OBJECT_STORAGE,
      useFactory: (cloudinary: CloudinaryStorage, noop: NoopStorage) => {
        const env = (() => {
          try {
            return validateEnv(process.env);
          } catch {
            return null;
          }
        })();
        const provider = env?.STORAGE_PROVIDER ?? 'auto';
        if (provider === 'none') {
          return noop;
        }
        if (provider === 's3') {
          // Client-side S3 upload lands later; keep Cloudinary until then.
          return cloudinaryConfigured() ? cloudinary : noop;
        }
        if (provider === 'cloudinary' || provider === 'auto') {
          return cloudinaryConfigured() ? cloudinary : noop;
        }
        return noop;
      },
      inject: [CloudinaryStorage, NoopStorage],
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
