import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AnswerModelService } from './../src/questions/answer-model.service';
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingService,
} from './../src/questions/embedding.service';
import { QueryRewriteService } from './../src/questions/query-rewrite.service';
import { QuestionsRepository } from './../src/questions/questions.repository';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Questions (e2e)', () => {
  let app: INestApplication<App>;
  const embed = jest.fn();
  const repositorySearch = jest.fn();
  const repositoryLexical = jest.fn();
  const proposeQuotes = jest.fn();
  const explain = jest.fn();
  const filterOptions = jest.fn();
  const rewrite = jest.fn();

  beforeEach(async () => {
    embed.mockReset();
    repositorySearch.mockReset();
    repositoryLexical.mockReset();
    proposeQuotes.mockReset();
    explain.mockReset();
    explain.mockResolvedValue(null);
    filterOptions.mockReset();
    rewrite.mockReset();
    rewrite.mockResolvedValue({ rewrittenQuery: '', rewritten: false });
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
        searchLexical: repositoryLexical,
        filterOptions,
        insert: jest.fn(),
        findReadyDuplicate: jest.fn(),
        deleteByIds: jest.fn(),
      })
      .overrideProvider(AnswerModelService)
      .useValue({ proposeQuotes, explain })
      .overrideProvider(QueryRewriteService)
      .useValue({ rewrite })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('POST /questions rejects invalid input without calling OpenAI', () => {
    return request(app.getHttpServer())
      .post('/questions')
      .send({ subject: 'Physics' })
      .expect(400)
      .expect((response) => {
        const body = response.body as { message?: string };
        expect(embed).not.toHaveBeenCalled();
        expect(String(body.message)).toContain('questionText');
      });
  });

  it('POST /questions/answer rejects an empty query without calling OpenAI', () => {
    return request(app.getHttpServer())
      .post('/questions/answer')
      .send({ query: '   ' })
      .expect(400)
      .expect(() => {
        expect(embed).not.toHaveBeenCalled();
        expect(proposeQuotes).not.toHaveBeenCalled();
      });
  });

  it('POST /questions/answer rejects a body that is not an object', () => {
    return request(app.getHttpServer())
      .post('/questions/answer')
      .send(['What is inertia?'])
      .expect(400)
      .expect((response) => {
        const body = response.body as { message?: string };
        expect(String(body.message)).toContain(
          'Request body must be an object.',
        );
        expect(embed).not.toHaveBeenCalled();
        expect(proposeQuotes).not.toHaveBeenCalled();
      });
  });

  it('POST /questions/answer rejects an invalid limit without calling OpenAI', () => {
    return request(app.getHttpServer())
      .post('/questions/answer')
      .send({ query: 'What is inertia?', limit: 0 })
      .expect(400)
      .expect((response) => {
        const body = response.body as { message?: string };
        expect(String(body.message)).toContain(
          'limit must be an integer from 1 to 20.',
        );
        expect(embed).not.toHaveBeenCalled();
        expect(proposeQuotes).not.toHaveBeenCalled();
      });
  });

  it('POST /questions/answer returns 503 when the answer model fails', async () => {
    embed.mockResolvedValue(
      Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1),
    );
    repositorySearch.mockResolvedValue([
      {
        id: 'newton',
        questionText: "State Newton's second law of motion.",
        subject: 'Physics',
        topic: 'Laws of Motion',
        subtopic: 'Second law',
        examYear: 2024,
        examType: 'board',
        difficulty: 'MEDIUM',
        questionType: 'SHORT',
        sourceDocument: 'physics-sample.pdf',
        pageReference: '96',
        score: 0.8,
      },
    ]);
    proposeQuotes.mockRejectedValue(
      new ServiceUnavailableException('Answer request failed.'),
    );

    const response = await request(app.getHttpServer())
      .post('/questions/answer')
      .send({ query: "What is Newton's second law?" })
      .expect(503);

    expect(JSON.stringify(response.body)).not.toContain('F = ma');
    expect(proposeQuotes).toHaveBeenCalledTimes(1);
  });

  it('POST /questions/answer returns insufficient when the stem does not state the law', async () => {
    embed.mockResolvedValue(
      Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1),
    );
    repositorySearch.mockResolvedValue([
      {
        id: 'newton',
        questionText: "State Newton's second law of motion.",
        subject: 'Physics',
        topic: 'Laws of Motion',
        subtopic: 'Second law',
        examYear: 2024,
        examType: 'board',
        difficulty: 'MEDIUM',
        questionType: 'SHORT',
        sourceDocument: 'physics-sample.pdf',
        pageReference: '96',
        score: 0.8,
      },
    ]);
    proposeQuotes.mockResolvedValue({
      complete: true,
      quotes: [
        {
          id: 'newton',
          quote: "Newton's second law is F = ma.",
          pageNumber: '1',
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .post('/questions/answer')
      .send({ query: "What is Newton's second law?" })
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'insufficient',
      sources: [{ id: 'newton', pageReference: '96', score: 0.8 }],
    });
    expect(JSON.stringify(response.body)).not.toContain('F = ma');
    expect(proposeQuotes).toHaveBeenCalledTimes(1);
    expect(repositoryLexical).not.toHaveBeenCalled();
  });

  it('GET /questions/filters lists stored subjects and years without calling OpenAI', async () => {
    filterOptions.mockResolvedValue([
      { subject: 'Physics', examYear: 2024, difficulty: 'MEDIUM', count: 3 },
    ]);

    const response = await request(app.getHttpServer())
      .get('/questions/filters')
      .expect(200);

    expect(response.body).toMatchObject({
      subjects: [{ value: 'Physics', count: 3 }],
      years: [{ value: 2024, count: 3 }],
      difficulties: [{ value: 'MEDIUM', count: 3 }],
      total: 3,
    });
    expect(
      (response.body as { timePeriods: unknown[] }).timePeriods,
    ).toHaveLength(3);
    expect(embed).not.toHaveBeenCalled();
  });

  it('POST /questions/answer returns an AI explanation separately from the verified answer', async () => {
    embed.mockResolvedValue(
      Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1),
    );
    repositorySearch.mockResolvedValue([
      {
        id: 'newton',
        questionText: "State Newton's second law of motion.",
        subject: 'Physics',
        topic: 'Mechanics',
        subtopic: null,
        examYear: 2024,
        examType: 'board',
        difficulty: 'MEDIUM',
        questionType: 'SHORT',
        sourceDocument: 'physics.pdf',
        pageReference: '96',
        score: 0.8,
      },
    ]);
    proposeQuotes.mockResolvedValue({ complete: false, quotes: [] });
    explain.mockResolvedValue('Force equals rate of change of momentum.');

    const response = await request(app.getHttpServer())
      .post('/questions/answer')
      .send({ query: "What is Newton's second law?", yearFrom: 2023 })
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'insufficient',
      explanation: 'Force equals rate of change of momentum.',
    });
    expect(repositorySearch).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ yearFrom: 2023, yearTo: null }),
    );
  });

  it('POST /questions/search rejects an empty query without calling OpenAI', () => {
    return request(app.getHttpServer())
      .post('/questions/search')
      .send({ query: '   ' })
      .expect(400)
      .expect(() => {
        expect(embed).not.toHaveBeenCalled();
        expect(repositoryLexical).not.toHaveBeenCalled();
      });
  });

  it('POST /questions/search stays on the vector branch', async () => {
    embed.mockResolvedValue(
      Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1),
    );
    repositorySearch.mockResolvedValue([]);

    await request(app.getHttpServer())
      .post('/questions/search')
      .send({ query: 'inertia' })
      .expect(200)
      .expect({ results: [] });

    expect(repositoryLexical).not.toHaveBeenCalled();
  });

  it('POST /questions/search/rewritten compares original and rewritten rankings', async () => {
    rewrite.mockResolvedValue({
      rewrittenQuery: 'series LCR circuit with 10 V across each element',
      rewritten: true,
    });
    const originalVector = Array.from(
      { length: EMBEDDING_DIMENSIONS },
      () => 0.1,
    );
    const rewrittenVector = Array.from(
      { length: EMBEDDING_DIMENSIONS },
      () => 0.2,
    );
    embed
      .mockResolvedValueOnce(originalVector)
      .mockResolvedValueOnce(rewrittenVector);
    const hit = {
      id: 'lcr',
      questionText: 'In a series LCR circuit, the voltage across each is 10 V.',
      subject: 'Physics',
      topic: 'AC',
      subtopic: null,
      examYear: 2024,
      examType: 'board',
      difficulty: 'MEDIUM',
      questionType: 'MCQ',
      sourceDocument: 'physics-sample.pdf',
      pageReference: '2',
      score: 0.88,
    };
    repositorySearch
      .mockResolvedValueOnce([{ ...hit, score: 0.4 }])
      .mockResolvedValueOnce([hit]);

    const response = await request(app.getHttpServer())
      .post('/questions/search/rewritten')
      .send({ query: 'that LCR one where 10 volt is across each', limit: 5 })
      .expect(200);

    expect(rewrite).toHaveBeenCalledWith(
      'that LCR one where 10 volt is across each',
    );
    expect(embed).toHaveBeenNthCalledWith(
      1,
      'that LCR one where 10 volt is across each',
    );
    expect(embed).toHaveBeenNthCalledWith(
      2,
      'series LCR circuit with 10 V across each element',
    );
    expect(response.body).toEqual({
      originalQuery: 'that LCR one where 10 volt is across each',
      rewrittenQuery: 'series LCR circuit with 10 V across each element',
      rewritten: true,
      original: [{ ...hit, score: 0.4 }],
      rewrittenResults: [hit],
    });
  });

  it('POST /questions/search/hybrid returns both branches and an empty lexical list', async () => {
    embed.mockResolvedValue(
      Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1),
    );
    repositorySearch.mockResolvedValue([
      {
        id: 'newton',
        questionText: "State Newton's second law of motion.",
        subject: 'Physics',
        topic: 'Laws of Motion',
        subtopic: 'Second law',
        examYear: 2024,
        examType: 'board',
        difficulty: 'MEDIUM',
        questionType: 'SHORT',
        sourceDocument: 'physics-sample.pdf',
        pageReference: '96',
        score: 0.8,
      },
    ]);
    repositoryLexical.mockResolvedValue([]);

    const response = await request(app.getHttpServer())
      .post('/questions/search/hybrid')
      .send({ query: 'capital of France' })
      .expect(200);

    expect(embed).toHaveBeenCalledWith('capital of France');
    expect(repositoryLexical).toHaveBeenCalledWith(
      'capital of France',
      expect.objectContaining({ limit: 20 }),
    );
    expect(response.body).toEqual({
      vector: [
        {
          id: 'newton',
          questionText: "State Newton's second law of motion.",
          pageReference: '96',
          rank: 1,
        },
      ],
      lexical: [],
      hybrid: [
        {
          id: 'newton',
          questionText: "State Newton's second law of motion.",
          pageReference: '96',
          rank: 1,
          vectorRank: 1,
          lexicalRank: null,
        },
      ],
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
