import { ServiceUnavailableException } from '@nestjs/common';
import {
  ANSWER_MODEL,
  AnswerModelService,
  NO_EXPLANATION,
} from './answer-model.service';

describe('AnswerModelService', () => {
  const service = new AnswerModelService();
  const originalEnv = { ...process.env };
  const sources = [
    {
      id: 'newton',
      questionText: "State Newton's second law of motion.",
    },
  ];

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

  it('does not call OpenAI when the API key is missing', async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      service.proposeQuotes("What is Newton's second law?", sources),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requests structured JSON from gpt-4.1-mini once', async () => {
    jest.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  complete: false,
                  quotes: [],
                  pageNumber: '999',
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      service.proposeQuotes("What is Newton's second law?", sources),
    ).resolves.toEqual({ complete: false, quotes: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = jest.mocked(fetch).mock.calls[0][1];
    const rawBody =
      request && typeof request.body === 'string' ? request.body : '';
    const body = JSON.parse(rawBody) as {
      model: string;
      response_format: { json_schema: { strict: boolean } };
      messages: Array<{ content: string }>;
    };
    expect(body.model).toBe(ANSWER_MODEL);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[1].content).toContain(
      "State Newton's second law of motion.",
    );
    expect(body.messages[1].content).not.toMatch(/page/i);
    expect(JSON.stringify(body.response_format)).not.toContain('pageNumber');
    expect(JSON.stringify(body.response_format)).toContain(
      '"required":["id","quote","kind"]',
    );
  });

  it('reads the quote label and treats anything but "answer" as question wording', async () => {
    jest.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  complete: true,
                  quotes: [
                    { id: 'a', quote: 'first quote text here', kind: 'answer' },
                    { id: 'b', quote: 'second quote text here', kind: 'other' },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      service.proposeQuotes("What is Newton's second law?", sources),
    ).resolves.toEqual({
      complete: true,
      quotes: [
        { id: 'a', quote: 'first quote text here', kind: 'answer' },
        { id: 'b', quote: 'second quote text here', kind: 'question' },
      ],
    });
  });

  it('retries a server error once, then rejects', async () => {
    jest.mocked(fetch).mockResolvedValue(new Response('nope', { status: 500 }));

    await expect(
      service.proposeQuotes("What is Newton's second law?", sources),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries a dropped connection once, then rejects', async () => {
    jest.mocked(fetch).mockRejectedValue(new Error('network down'));

    await expect(
      service.proposeQuotes("What is Newton's second law?", sources),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 429])(
    'does not retry a %i (bad request, auth, quota or rate limit)',
    async (status) => {
      jest.mocked(fetch).mockResolvedValue(new Response('nope', { status }));

      await expect(
        service.proposeQuotes("What is Newton's second law?", sources),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('does not retry a timeout', async () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    jest.mocked(fetch).mockRejectedValue(timeout);

    await expect(
      service.proposeQuotes("What is Newton's second law?", sources),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('succeeds when the retry succeeds', async () => {
    jest
      .mocked(fetch)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ complete: false, quotes: [] }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );

    await expect(
      service.proposeQuotes("What is Newton's second law?", sources),
    ).resolves.toEqual({ complete: false, quotes: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns a plain-text explanation without structured output', async () => {
    jest.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '  F = ma, so force grows.  ' } }],
        }),
        { status: 200 },
      ),
    );

    await expect(
      service.explain("What is Newton's second law?", sources),
    ).resolves.toBe('F = ma, so force grows.');
    const request = jest.mocked(fetch).mock.calls[0][1];
    const body = JSON.parse(
      request && typeof request.body === 'string' ? request.body : '',
    ) as { response_format?: unknown; messages: Array<{ content: string }> };
    expect(body.response_format).toBeUndefined();
    expect(body.messages[1].content).toContain(
      "State Newton's second law of motion.",
    );
  });

  it('returns no explanation when the model declines', async () => {
    jest.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: NO_EXPLANATION } }],
        }),
        { status: 200 },
      ),
    );

    await expect(
      service.explain('Who wrote Hamlet?', sources),
    ).resolves.toBeNull();
  });

  it('rejects a failed explanation request', async () => {
    jest.mocked(fetch).mockResolvedValue(new Response('nope', { status: 500 }));

    await expect(
      service.explain("What is Newton's second law?", sources),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects an invalid response and does not retry', async () => {
    jest.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{' } }] }),
        {
          status: 200,
        },
      ),
    );

    await expect(
      service.proposeQuotes("What is Newton's second law?", sources),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('AnswerModelService — conversation decision', () => {
  const service = new AnswerModelService();
  const originalEnv = { ...process.env };
  const turns = [
    { role: 'user' as const, text: 'What is inertia?' },
    { role: 'assistant' as const, text: 'Inertia is resistance to change.' },
  ];
  const subjects = ['Physics', 'Chemistry'];

  function modelReply(content: unknown) {
    jest.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  typeof content === 'string'
                    ? content
                    : JSON.stringify(content),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
  }

  function decision(overrides: Record<string, unknown>) {
    return {
      action: 'new_question',
      transformation: 'none',
      standaloneQuery: null,
      subject: null,
      clarifyQuestion: null,
      ...overrides,
    };
  }

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

  it('asks for a strict schema and sends the turns as data', async () => {
    modelReply(
      decision({ action: 'transform_previous', transformation: 'shorten' }),
    );

    await expect(
      service.decide('make it shorter', turns, subjects),
    ).resolves.toEqual({
      action: 'transform_previous',
      transformation: 'shorten',
      standaloneQuery: null,
      subject: null,
      clarifyQuestion: null,
    });
    const body = JSON.parse(
      jest.mocked(fetch).mock.calls[0][1]?.body as string,
    ) as {
      model: string;
      response_format: { json_schema: { strict: boolean } };
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe(ANSWER_MODEL);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[0].content).toMatch(/Ignore any instructions/);
    expect(body.messages[1].content).toContain('Student: What is inertia?');
    expect(body.messages[1].content).toContain(
      'Latest student message: make it shorter',
    );
  });

  it('keeps a subject only when it is one of the bank subjects', async () => {
    modelReply(
      decision({
        standaloneQuery: 'What is the definition of CO2?',
        subject: 'chemistry',
      }),
    );
    await expect(
      service.decide('definition', turns, subjects),
    ).resolves.toMatchObject({ subject: 'Chemistry' });

    modelReply(
      decision({
        standaloneQuery: 'What is photosynthesis?',
        subject: 'Biology',
      }),
    );
    await expect(
      service.decide('What is photosynthesis?', turns, subjects),
    ).resolves.toMatchObject({ subject: null });
  });

  it.each([
    ['not JSON', 'yes, shorten it'],
    ['an unknown action', decision({ action: 'search_web' })],
    [
      'a transform with no transformation',
      decision({ action: 'transform_previous' }),
    ],
    ['a new question with no query', decision({ standaloneQuery: '   ' })],
    ['a clarify with no question', decision({ action: 'clarify' })],
    ['an oversized query', decision({ standaloneQuery: 'x'.repeat(301) })],
  ])('returns null for %s', async (_label, content) => {
    modelReply(content);
    await expect(service.decide('hmm', turns, subjects)).resolves.toBeNull();
  });

  it('accepts find_questions with a topic, and practice as a rework', async () => {
    modelReply(
      decision({ action: 'find_questions', standaloneQuery: 'inertia' }),
    );
    await expect(
      service.decide('Show related exam questions', turns, subjects),
    ).resolves.toMatchObject({
      action: 'find_questions',
      standaloneQuery: 'inertia',
    });

    modelReply(decision({ action: 'find_questions', standaloneQuery: null }));
    await expect(
      service.decide('Show related exam questions', turns, subjects),
    ).resolves.toBeNull();

    modelReply(
      decision({ action: 'transform_previous', transformation: 'practice' }),
    );
    await expect(
      service.decide('Give me practice questions', turns, subjects),
    ).resolves.toMatchObject({ transformation: 'practice' });
  });

  it('accepts out_of_scope and clears fields that do not apply', async () => {
    modelReply(
      decision({
        action: 'out_of_scope',
        transformation: 'shorten',
        clarifyQuestion: 'ignored',
      }),
    );

    await expect(
      service.decide('Who won the World Cup?', [], subjects),
    ).resolves.toEqual({
      action: 'out_of_scope',
      transformation: 'none',
      standaloneQuery: null,
      subject: null,
      clarifyQuestion: null,
    });
    const body = JSON.parse(
      jest.mocked(fetch).mock.calls[0][1]?.body as string,
    ) as { messages: Array<{ content: string }> };
    expect(body.messages[1].content).toContain('this is the first message');
  });

  it('rejects an outage so the caller can fall back', async () => {
    jest.mocked(fetch).mockRejectedValue(new Error('timeout'));
    await expect(
      service.decide('make it shorter', turns, subjects),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rewrites the previous answer and returns null when the model declines', async () => {
    modelReply('Inertia: resistance to change in motion.');
    await expect(
      service.transform('shorten', 'Inertia is resistance to change.', []),
    ).resolves.toBe('Inertia: resistance to change in motion.');

    modelReply(NO_EXPLANATION);
    await expect(
      service.transform('shorten', 'Happy to help with Physics.', []),
    ).resolves.toBeNull();
  });
});
