import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { CHAT_PACING, UNAVAILABLE_TEXT } from './../src/chat/chat.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { AnswerModelService } from './../src/questions/answer-model.service';
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingService,
} from './../src/questions/embedding.service';
import { QuestionsRepository } from './../src/questions/questions.repository';

const LIGHT = {
  id: 'light',
  questionText: 'The speed of light is 3.0 × 10^{8} m/s in vacuum.',
  subject: 'Physics',
  topic: 'Optics',
  subtopic: null,
  examYear: 2024,
  examType: 'board',
  difficulty: 'MEDIUM',
  questionType: 'SHORT',
  sourceDocument: 'physics.pdf#hash',
  pageReference: '4',
  score: 0.7,
};

function chatBody(text: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'chat-1',
    trigger: 'submit-message',
    messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text }] }],
    ...extra,
  };
}

function events(body: string): unknown[] {
  return body
    .split('\n\n')
    .filter((block) => block.startsWith('data: '))
    .map((block) => block.slice('data: '.length))
    .map((data) => (data === '[DONE]' ? data : (JSON.parse(data) as unknown)));
}

function finishOf(parts: unknown[]): unknown {
  return parts.find((part) => (part as { type?: string }).type === 'finish');
}

describe('Chat (e2e)', () => {
  let app: INestApplication<App>;
  const embed = jest.fn();
  const repositorySearch = jest.fn();
  const proposeQuotes = jest.fn();
  const findReadyByIds = jest.fn();
  const decide = jest.fn();
  const transform = jest.fn();

  beforeEach(async () => {
    embed.mockReset();
    repositorySearch.mockReset();
    proposeQuotes.mockReset();
    findReadyByIds.mockReset();
    decide.mockReset();
    transform.mockReset();
    process.env.DATABASE_URL =
      'postgresql://test:test@127.0.0.1:5432/edusearch_ai_test?schema=public';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      })
      .overrideProvider(EmbeddingService)
      .useValue({ embed })
      .overrideProvider(QuestionsRepository)
      .useValue({
        search: repositorySearch,
        searchLexical: jest.fn(),
        insert: jest.fn(),
        findReadyDuplicate: jest.fn(),
        deleteByIds: jest.fn(),
        findReadyByIds,
      })
      .overrideProvider(AnswerModelService)
      .useValue({
        proposeQuotes,
        explain: jest.fn().mockResolvedValue(null),
        decide,
        transform,
      })
      .overrideProvider(CHAT_PACING)
      .useValue({ wordsPerDelta: 3, delayMs: 0 })
      .compile();

    app = moduleFixture.createNestApplication({ logger: false });
    await app.init();
    embed.mockResolvedValue(
      Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1),
    );
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /api/chat streams a UI message stream with the SDK header', async () => {
    repositorySearch.mockResolvedValue([LIGHT]);
    proposeQuotes.mockResolvedValue({
      complete: true,
      quotes: [
        {
          id: 'light',
          quote: 'The speed of light is 3.0 × 10^{8} m/s',
          kind: 'answer',
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .post('/api/chat')
      .send(
        chatBody('What speed of light does the paper state?', {
          paperTag: 'cbse',
          filters: { subject: 'Physics', difficulty: 'Medium', year: 2024 },
        }),
      )
      .expect(200)
      .expect('content-type', /text\/event-stream/)
      .expect('x-vercel-ai-ui-message-stream', 'v1');

    expect(repositorySearch).toHaveBeenCalledWith(expect.any(Array), {
      subject: 'Physics',
      examYear: 2024,
      yearFrom: null,
      yearTo: null,
      difficulty: 'MEDIUM',
      limit: 5,
    });
    const parts = events(response.text);
    expect(parts[0]).toMatchObject({ type: 'start' });
    expect(parts.at(-1)).toBe('[DONE]');
    const text = parts
      .filter(
        (part): part is { type: 'text-delta'; delta: string } =>
          (part as { type?: string }).type === 'text-delta',
      )
      .map((part) => part.delta)
      .join('');
    expect(text).toContain('> The speed of light is 3.0 × 10$^{8}$ m/s');
    expect(text).toContain('Related question from your papers');
    expect(text).toContain('Physics · Optics · Page 4 · physics.pdf');
    expect(finishOf(parts)).toMatchObject({
      finishReason: 'stop',
      messageMetadata: { status: 'answered' },
    });
  });

  it('POST /api/chat reworks the previous answer from the useChat history', async () => {
    const cited = '3f1c2a9e-8b7d-4c6e-9a5f-1b2c3d4e5f60';
    findReadyByIds.mockResolvedValue([{ ...LIGHT, id: cited }]);
    decide.mockResolvedValue({
      action: 'transform_previous',
      transformation: 'shorten',
      standaloneQuery: null,
      subject: null,
      clarifyQuestion: null,
    });
    transform.mockResolvedValue('Light travels at 3 × 10^{8} m/s.');

    const response = await request(app.getHttpServer())
      .post('/api/chat')
      .send({
        id: 'chat-1',
        trigger: 'submit-message',
        messages: [
          {
            id: 'u1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: 'What speed of light does the paper state?',
              },
            ],
          },
          {
            id: 'a1',
            role: 'assistant',
            metadata: { status: 'answered', kind: 'question_search' },
            parts: [
              {
                type: 'text',
                text: '> The speed of light is 3.0 × 10$^{8}$ m/s\n\n**Related question from your papers**\n\n*Physics · Optics*',
              },
              {
                type: 'source-document',
                sourceId: cited,
                mediaType: 'text/plain',
                title: 'Physics · Optics',
              },
            ],
          },
          {
            id: 'u2',
            role: 'user',
            parts: [
              { type: 'text', text: 'give me more brief answer about this' },
            ],
          },
        ],
      })
      .expect(200);

    expect(repositorySearch).not.toHaveBeenCalled();
    expect(findReadyByIds).toHaveBeenCalledWith([cited]);
    expect(transform).toHaveBeenCalledWith(
      'shorten',
      'The speed of light is 3.0 × 10^{8} m/s',
      [{ id: cited, questionText: LIGHT.questionText }],
    );
    const parts = events(response.text);
    const text = parts
      .filter(
        (part): part is { type: 'text-delta'; delta: string } =>
          (part as { type?: string }).type === 'text-delta',
      )
      .map((part) => part.delta)
      .join('');
    expect(text).toContain('**AI-rewritten explanation**');
    expect(text).toContain('Light travels at 3 × 10$^{8}$ m/s.');
    expect(text).toContain('**Based on these paper sources**');
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'source-document', sourceId: cited }),
    );
    expect(finishOf(parts)).toMatchObject({
      finishReason: 'stop',
      messageMetadata: { status: 'answered', answerOrigin: 'transformed' },
    });
  });

  it('POST /api/chat answers an off-topic message without calling the answer model', async () => {
    repositorySearch.mockResolvedValue([{ ...LIGHT, score: 0.2 }]);

    const response = await request(app.getHttpServer())
      .post('/api/chat')
      .send(chatBody('Who wrote Hamlet?'))
      .expect(200);

    expect(proposeQuotes).not.toHaveBeenCalled();
    expect(finishOf(events(response.text))).toMatchObject({
      finishReason: 'stop',
      messageMetadata: { status: 'out_of_scope' },
    });
  });

  it('POST /api/chat reports a model outage inside the stream', async () => {
    repositorySearch.mockResolvedValue([LIGHT]);
    proposeQuotes.mockRejectedValue(
      new ServiceUnavailableException('Answer request failed.'),
    );

    const response = await request(app.getHttpServer())
      .post('/api/chat')
      .send(chatBody('What speed of light does the paper state?'))
      .expect(200);

    const parts = events(response.text);
    expect(parts[0]).toMatchObject({ type: 'start' });
    expect(parts.slice(1)).toEqual([
      { type: 'start-step' },
      { type: 'error', errorText: UNAVAILABLE_TEXT },
      '[DONE]',
    ]);
  });

  it('POST /api/chat rejects a body without messages as JSON before streaming', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/chat')
      .send({ query: 'What is inertia?' })
      .expect(400)
      .expect('content-type', /application\/json/);

    expect(response.body).toEqual({ error: 'Invalid message structure' });
    expect(embed).not.toHaveBeenCalled();
  });

  it('POST /api/chat rejects an invalid filter without calling OpenAI', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/chat')
      .send(chatBody('Ohm law', { filters: { difficulty: 'Extreme' } }))
      .expect(400);

    expect(response.body).toEqual({
      error: 'filters.difficulty must be Easy, Medium or Hard.',
    });
    expect(embed).not.toHaveBeenCalled();
  });

  it('POST /api/chat rejects malformed JSON with the standard Nest 400 body', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/chat')
      .set('Content-Type', 'application/json')
      .send('{"messages": [')
      .expect(400)
      .expect('content-type', /application\/json/);

    expect(response.body).toMatchObject({ statusCode: 400 });
    expect(embed).not.toHaveBeenCalled();
  });
});
