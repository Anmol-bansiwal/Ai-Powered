import { ServiceUnavailableException } from '@nestjs/common';
import { EMBEDDING_DIMENSIONS, EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  const service = new EmbeddingService();
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL =
      'postgresql://postgres:secret@127.0.0.1:5432/edusearch_ai';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
    jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('does not call OpenAI when the configured model is not text-embedding-3-small', async () => {
    process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-large';

    await expect(service.embed('force')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not call OpenAI when the API key is missing', async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(service.embed('force')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls the embeddings endpoint once and returns a 1536-dimension vector', async () => {
    const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.01);
    jest.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding }] }), {
        status: 200,
      }),
    );

    await expect(service.embed('force')).resolves.toEqual(embedding);
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = jest.mocked(fetch).mock.calls[0][1];
    const rawBody =
      request && typeof request.body === 'string' ? request.body : '';
    expect(JSON.parse(rawBody)).toEqual({
      model: 'text-embedding-3-small',
      input: 'force',
    });
  });

  it('rejects an invalid vector and does not retry', async () => {
    jest.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }), {
        status: 200,
      }),
    );

    await expect(service.embed('force')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a server error once, then rejects', async () => {
    jest.mocked(fetch).mockResolvedValue(new Response('nope', { status: 500 }));

    await expect(service.embed('force')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a rejected request', async () => {
    jest.mocked(fetch).mockResolvedValue(new Response('nope', { status: 401 }));

    await expect(service.embed('force')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
