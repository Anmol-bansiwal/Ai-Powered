import { ServiceUnavailableException } from '@nestjs/common';
import { NoopStorage } from './noop.storage';

describe('NoopStorage', () => {
  const storage = new NoopStorage();

  it('reports provider none', () => {
    expect(storage.provider).toBe('none');
  });

  it('rejects PDF upload until Cloudinary or S3 is configured', async () => {
    await expect(
      storage.uploadPdf({
        buffer: Buffer.from('%PDF'),
        filename: 'a.pdf',
        fileHash: 'abc',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
