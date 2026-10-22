import { sanitizeDatabaseError } from './sanitize-database-error';

describe('sanitizeDatabaseError', () => {
  it('removes connection strings and password parameters', () => {
    const error = new Error(
      'connection failed postgresql://postgres:supersecret@localhost:5432/edusearch_ai password=supersecret',
    );

    const sanitized = sanitizeDatabaseError(error);

    expect(sanitized).not.toContain('supersecret');
    expect(sanitized).toContain('postgresql://[redacted]');
    expect(sanitized).toContain('password=[redacted]');
  });

  it('sanitizes a nested cause', () => {
    const error = new Error('query failed', {
      cause: new Error('postgresql://postgres:nestedsecret@localhost/db'),
    });

    expect(sanitizeDatabaseError(error)).not.toContain('nestedsecret');
  });
});
