import { QueryRewriteService, REWRITE_MODEL } from './query-rewrite.service';

describe('QueryRewriteService', () => {
  const service = new QueryRewriteService();
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

  it('returns a successful rewrite when tokens are preserved', async () => {
    jest.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rewrittenQuery:
                    'series LCR circuit with 10 V across each element',
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      service.rewrite('that LCR one where 10 volt is across each'),
    ).resolves.toEqual({
      rewrittenQuery: 'series LCR circuit with 10 V across each element',
      rewritten: true,
    });

    const request = jest.mocked(fetch).mock.calls[0][1];
    const rawBody =
      request && typeof request.body === 'string' ? request.body : '';
    const body = JSON.parse(rawBody) as {
      model: string;
      response_format: { json_schema: { strict: boolean; name: string } };
    };
    expect(body.model).toBe(REWRITE_MODEL);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe('query_rewrite');
  });

  it('falls back to the original query when the rewrite changes a number', async () => {
    jest.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rewrittenQuery: 'series LCR circuit with 12 V across each',
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      service.rewrite('that LCR one where 10 volt is across each'),
    ).resolves.toEqual({
      rewrittenQuery: 'that LCR one where 10 volt is across each',
      rewritten: false,
    });
  });

  it('falls back when OpenAI is unavailable', async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(service.rewrite('series LCR')).resolves.toEqual({
      rewrittenQuery: 'series LCR',
      rewritten: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
