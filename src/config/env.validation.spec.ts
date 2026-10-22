import { firstTurnDecisionEnabled, validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('requires a PostgreSQL connection string', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL is required/);
  });

  it('rejects a non-PostgreSQL connection string without echoing it', () => {
    const databaseUrl = 'mysql://user:supersecret@localhost:3306/db';

    expect(() => validateEnv({ DATABASE_URL: databaseUrl })).toThrow(
      /must be a PostgreSQL connection string/,
    );

    try {
      validateEnv({ DATABASE_URL: databaseUrl });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('supersecret');
      expect((error as Error).message).not.toContain(databaseUrl);
    }
  });

  it('defaults the port, embedding model, and empty CORS origins', () => {
    expect(
      validateEnv({
        DATABASE_URL:
          'postgresql://postgres:secret@localhost:5432/edusearch_ai',
      }),
    ).toEqual({
      DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/edusearch_ai',
      PORT: 3000,
      OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
      CORS_ORIGINS: [],
      STORAGE_PROVIDER: 'auto',
      CHAT_FIRST_TURN_DECISION: false,
    });
  });

  it('parses CORS_ORIGINS', () => {
    expect(
      validateEnv({
        DATABASE_URL:
          'postgresql://postgres:secret@localhost:5432/edusearch_ai',
        CORS_ORIGINS: ' https://app.example.com , http://localhost:3000 ',
      }),
    ).toMatchObject({
      CORS_ORIGINS: ['https://app.example.com', 'http://localhost:3000'],
    });
  });

  it('rejects invalid CORS_ORIGINS entries', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL:
          'postgresql://postgres:secret@localhost:5432/edusearch_ai',
        CORS_ORIGINS: 'app.example.com',
      }),
    ).toThrow(/CORS_ORIGINS entries must be full origins/);
  });

  it('rejects an invalid port', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL:
          'postgresql://postgres:secret@localhost:5432/edusearch_ai',
        PORT: '0',
      }),
    ).toThrow(/PORT must be an integer/);
  });

  it('keeps a configured embedding model and ignores a blank API key', () => {
    expect(
      validateEnv({
        DATABASE_URL:
          'postgresql://postgres:secret@localhost:5432/edusearch_ai',
        PORT: '3001',
        OPENAI_API_KEY: '   ',
        OPENAI_EMBEDDING_MODEL: 'text-embedding-3-large',
      }),
    ).toEqual({
      DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/edusearch_ai',
      PORT: 3001,
      OPENAI_EMBEDDING_MODEL: 'text-embedding-3-large',
      CORS_ORIGINS: [],
      STORAGE_PROVIDER: 'auto',
      CHAT_FIRST_TURN_DECISION: false,
    });
  });

  it('accepts Cloudinary settings when STORAGE_PROVIDER=cloudinary', () => {
    expect(
      validateEnv({
        DATABASE_URL:
          'postgresql://postgres:secret@localhost:5432/edusearch_ai',
        STORAGE_PROVIDER: 'cloudinary',
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
      }),
    ).toMatchObject({
      STORAGE_PROVIDER: 'cloudinary',
      CLOUDINARY_CLOUD_NAME: 'demo',
    });
  });

  it('rejects STORAGE_PROVIDER=cloudinary without credentials', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL:
          'postgresql://postgres:secret@localhost:5432/edusearch_ai',
        STORAGE_PROVIDER: 'cloudinary',
      }),
    ).toThrow(/requires CLOUDINARY_/);
  });
});

describe('CHAT_FIRST_TURN_DECISION', () => {
  const base = {
    DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/edusearch_ai',
  };

  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['0', false],
    ['true', true],
    ['TRUE', true],
    ['1', true],
  ])('reads %p as %p', (value, expected) => {
    expect(
      validateEnv({ ...base, CHAT_FIRST_TURN_DECISION: value })
        .CHAT_FIRST_TURN_DECISION,
    ).toBe(expected);
    expect(firstTurnDecisionEnabled({ CHAT_FIRST_TURN_DECISION: value })).toBe(
      expected,
    );
  });

  it('rejects anything else at startup', () => {
    expect(() =>
      validateEnv({ ...base, CHAT_FIRST_TURN_DECISION: 'yes' }),
    ).toThrow('CHAT_FIRST_TURN_DECISION must be true or false.');
  });
});
