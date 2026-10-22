export type StorageProviderSetting = 'auto' | 'cloudinary' | 's3' | 'none';

export type AppEnv = {
  DATABASE_URL: string;
  PORT: number;
  OPENAI_EMBEDDING_MODEL: string;
  OPENAI_API_KEY?: string;
  /** Explicit browser origins allowed cross-origin (comma-separated env). */
  CORS_ORIGINS: string[];
  /**
   * Object storage for paper PDFs / figures.
   * `auto` uses Cloudinary when credentials are set; `s3` reserved for client upload later.
   */
  STORAGE_PROVIDER: StorageProviderSetting;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  /**
   * Experimental: also let the model route a chat's first message when the
   * rules cannot classify it. Off unless set to true.
   */
  CHAT_FIRST_TURN_DECISION: boolean;
};

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const databaseUrl = readString(config.DATABASE_URL);
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Set a PostgreSQL connection string before starting the application.',
    );
  }

  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new Error(
      'DATABASE_URL must be a PostgreSQL connection string (postgresql://...).',
    );
  }

  let port = 3000;
  const portValue = config.PORT;
  if (portValue !== undefined && portValue !== '') {
    port = Number(portValue);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('PORT must be an integer between 1 and 65535.');
    }
  }

  const env: AppEnv = {
    DATABASE_URL: databaseUrl,
    PORT: port,
    OPENAI_EMBEDDING_MODEL:
      readString(config.OPENAI_EMBEDDING_MODEL) ?? 'text-embedding-3-small',
    CORS_ORIGINS: parseCorsOrigins(config.CORS_ORIGINS),
    STORAGE_PROVIDER: parseStorageProvider(config.STORAGE_PROVIDER),
    CHAT_FIRST_TURN_DECISION: parseFlag(
      config.CHAT_FIRST_TURN_DECISION,
      'CHAT_FIRST_TURN_DECISION',
    ),
  };

  const apiKey = readString(config.OPENAI_API_KEY);
  if (apiKey) {
    env.OPENAI_API_KEY = apiKey;
  }

  const cloudName = readString(config.CLOUDINARY_CLOUD_NAME);
  const cloudKey = readString(config.CLOUDINARY_API_KEY);
  const cloudSecret = readString(config.CLOUDINARY_API_SECRET);
  if (cloudName) {
    env.CLOUDINARY_CLOUD_NAME = cloudName;
  }
  if (cloudKey) {
    env.CLOUDINARY_API_KEY = cloudKey;
  }
  if (cloudSecret) {
    env.CLOUDINARY_API_SECRET = cloudSecret;
  }

  if (env.STORAGE_PROVIDER === 'cloudinary') {
    if (!cloudName || !cloudKey || !cloudSecret) {
      throw new Error(
        'STORAGE_PROVIDER=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      );
    }
  }

  return env;
}

/** CHAT_FIRST_TURN_DECISION alone; startup validation rejects bad values. */
export function firstTurnDecisionEnabled(
  config: Record<string, unknown> = process.env,
): boolean {
  return parseFlag(config.CHAT_FIRST_TURN_DECISION, 'CHAT_FIRST_TURN_DECISION');
}

function parseFlag(value: unknown, name: string): boolean {
  const raw = readString(value)?.toLowerCase();
  if (!raw || raw === 'false' || raw === '0') {
    return false;
  }
  if (raw === 'true' || raw === '1') {
    return true;
  }
  throw new Error(`${name} must be true or false.`);
}

function parseStorageProvider(value: unknown): StorageProviderSetting {
  const raw = readString(value)?.toLowerCase();
  if (!raw || raw === 'auto') {
    return 'auto';
  }
  if (raw === 'cloudinary' || raw === 's3' || raw === 'none') {
    return raw;
  }
  throw new Error(
    'STORAGE_PROVIDER must be one of auto, cloudinary, s3, none.',
  );
}

function parseCorsOrigins(value: unknown): string[] {
  const raw = readString(value);
  if (!raw) {
    return [];
  }

  const origins: string[] = [];
  for (const part of raw.split(',')) {
    const origin = part.trim();
    if (!origin) {
      continue;
    }
    try {
      const url = new URL(origin);
      if (url.origin !== origin) {
        throw new Error('not an origin');
      }
    } catch {
      throw new Error(
        `CORS_ORIGINS entries must be full origins like https://app.example.com (got "${origin}").`,
      );
    }
    origins.push(origin);
  }
  return origins;
}
