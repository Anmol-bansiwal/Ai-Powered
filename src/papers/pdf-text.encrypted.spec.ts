import { extractTextItems } from 'unpdf';
import { extractPdfPages } from './pdf-text';

jest.mock('unpdf', () => ({
  extractTextItems: jest.fn(),
}));

describe('encrypted PDFs', () => {
  it('rejects a password-protected PDF without leaking parser details', async () => {
    const error = new Error('No password given: internal parser detail');
    error.name = 'PasswordException';
    jest.mocked(extractTextItems).mockRejectedValue(error);

    await expect(
      extractPdfPages(Buffer.from('%PDF-1.4 encrypted')),
    ).rejects.toThrow('This PDF is encrypted and cannot be read.');
  });
});
