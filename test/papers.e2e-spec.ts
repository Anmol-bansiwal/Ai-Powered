import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from './../src/papers/pdf-text';
import { buildTextPdf } from './../src/papers/text-pdf.fixture';
import { PrismaService } from './../src/prisma/prisma.service';
import { EmbeddingService } from './../src/questions/embedding.service';
import { CreateQuestionInput } from './../src/questions/question.validation';
import { QuestionsRepository } from './../src/questions/questions.repository';

describe('Papers (e2e)', () => {
  let app: INestApplication<App>;
  const embed = jest.fn();
  const findReadyDuplicate = jest.fn();
  const insert = jest.fn();
  const deleteByIds = jest.fn();
  const savedKeys = new Set<string>();

  beforeEach(async () => {
    embed.mockReset();
    findReadyDuplicate.mockReset();
    insert.mockReset();
    deleteByIds.mockReset();
    savedKeys.clear();
    process.env.DATABASE_URL =
      'postgresql://test:test@127.0.0.1:5432/edusearch_ai_test?schema=public';
    embed.mockResolvedValue(Array.from({ length: 1536 }, () => 0.1));
    findReadyDuplicate.mockImplementation(
      (source: string, page: string, text: string) =>
        Promise.resolve(savedKeys.has(`${source}|${page}|${text}`)),
    );
    insert.mockImplementation((input: CreateQuestionInput) => {
      const text = input.questionText.trim().replace(/\s+/g, ' ').toLowerCase();
      savedKeys.add(`${input.sourceDocument}|${input.pageReference}|${text}`);
      return Promise.resolve({
        id: '22222222-2222-4222-8222-222222222222',
        ...input,
        embeddingStatus: 'READY',
        createdAt: '2026-10-13T00:00:00.000Z',
      });
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
        $executeRaw: jest.fn(),
      })
      .overrideProvider(EmbeddingService)
      .useValue({ embed })
      .overrideProvider(QuestionsRepository)
      .useValue({ findReadyDuplicate, insert, deleteByIds })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const samplePdf = () =>
    buildTextPdf([['1. State Newton second law.', '(a) Write the formula.']]);

  const draft = () => ({
    subject: 'Physics',
    topic: 'Laws of Motion',
    examYear: 2024,
    examType: 'board',
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    fileHash: 'do-not-trust',
    questions: [
      {
        questionText: 'State Newton second law.',
        pageReference: '96',
        subtopic: 'Second law',
      },
    ],
  });

  it('extracts draft questions without OpenAI or a database write', async () => {
    const response = await request(app.getHttpServer())
      .post('/papers/extract')
      .attach('file', samplePdf(), 'physics-sample.pdf')
      .expect(200);

    const body = response.body as {
      sourceDocument: string;
      questions: Array<{
        questionText: string;
        pageReference: string;
        figures: unknown[];
      }>;
    };
    expect(body.sourceDocument).toBe('physics-sample.pdf');
    expect(body.questions[0].pageReference).toBe('1');
    expect(body.questions[0].questionText).toContain('(a) Write the formula.');
    expect(body.questions[0].figures).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects a non-PDF upload', () => {
    return request(app.getHttpServer())
      .post('/papers/extract')
      .attach('file', Buffer.from('hello'), 'notes.txt')
      .expect(400)
      .expect(() => {
        expect(embed).not.toHaveBeenCalled();
      });
  });

  it('rejects an oversize PDF', () => {
    return request(app.getHttpServer())
      .post('/papers/extract')
      .attach(
        'file',
        Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_PDF_BYTES)]),
        'big.pdf',
      )
      .expect(413)
      .expect((response) => {
        const body = response.body as { message?: string };
        expect(body.message).toBe('PDF must be at most 10 MB.');
      });
  });

  it('rejects a PDF over the page limit', () => {
    const pages = Array.from({ length: MAX_PDF_PAGES + 1 }, (_, index) => [
      `Page ${index + 1}`,
    ]);
    return request(app.getHttpServer())
      .post('/papers/extract')
      .attach('file', buildTextPdf(pages), 'long.pdf')
      .expect(422);
  });

  it('rejects a PDF with no extractable text', () => {
    return request(app.getHttpServer())
      .post('/papers/extract')
      .attach('file', buildTextPdf([[]]), 'blank.pdf')
      .expect(422);
  });

  it('rejects an invalid approval draft before embedding', () => {
    return request(app.getHttpServer())
      .post('/papers/approve')
      .attach('file', samplePdf(), 'physics-sample.pdf')
      .field('draft', JSON.stringify({ subject: 'Physics' }))
      .expect(400)
      .expect(() => {
        expect(embed).not.toHaveBeenCalled();
        expect(insert).not.toHaveBeenCalled();
      });
  });

  it('does not save or embed a duplicate approval', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/papers/approve')
      .attach('file', samplePdf(), 'physics-sample.pdf')
      .field('draft', JSON.stringify(draft()))
      .expect(201);

    const second = await request(server)
      .post('/papers/approve')
      .attach('file', samplePdf(), 'physics-sample.pdf')
      .field('draft', JSON.stringify(draft()))
      .expect(200);

    const body = second.body as { saved: unknown[]; skipped: unknown[] };
    expect(body.saved).toEqual([]);
    expect(body.skipped).toHaveLength(1);
    expect(embed).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(deleteByIds).not.toHaveBeenCalled();
  });

  it('saves the same text from a different PDF', async () => {
    const server = app.getHttpServer();
    const other = buildTextPdf([['Different page text.']]);
    await request(server)
      .post('/papers/approve')
      .attach('file', samplePdf(), 'physics-sample.pdf')
      .field('draft', JSON.stringify(draft()))
      .expect(201);
    await request(server)
      .post('/papers/approve')
      .attach('file', other, 'chemistry-sample.pdf')
      .field('draft', JSON.stringify(draft()))
      .expect(201);

    const first = insert.mock.calls[0] as [{ sourceDocument: string }];
    const second = insert.mock.calls[1] as [{ sourceDocument: string }];
    expect(first[0].sourceDocument).toContain('physics-sample.pdf#sha256:');
    expect(second[0].sourceDocument).toContain('chemistry-sample.pdf#sha256:');
    expect(first[0].sourceDocument).not.toBe(second[0].sourceDocument);
    expect(first[0].sourceDocument).not.toContain('do-not-trust');
    expect(embed).toHaveBeenCalledTimes(2);
  });

  it('returns 503 when embedding fails and does not insert', async () => {
    embed.mockRejectedValue(
      new ServiceUnavailableException('Embedding failed.'),
    );

    const response = await request(app.getHttpServer())
      .post('/papers/approve')
      .attach('file', samplePdf(), 'physics-sample.pdf')
      .field('draft', JSON.stringify(draft()))
      .expect(503);

    const body = response.body as {
      saved: unknown[];
      failed: Array<{ message: string }>;
    };
    expect(body.saved).toEqual([]);
    expect(body.failed[0].message).toBe('Embedding failed.');
    expect(insert).not.toHaveBeenCalled();
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('keeps the saved question when a later embedding fails', async () => {
    embed
      .mockResolvedValueOnce(Array.from({ length: 1536 }, () => 0.1))
      .mockRejectedValueOnce(
        new ServiceUnavailableException('Embedding failed.'),
      );
    const twoQuestions = {
      ...draft(),
      questions: [
        { questionText: 'First question text.', pageReference: '1' },
        { questionText: 'Second question text.', pageReference: '2' },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/papers/approve')
      .attach('file', samplePdf(), 'physics-sample.pdf')
      .field('draft', JSON.stringify(twoQuestions))
      .expect(201);

    const body = response.body as {
      saved: Array<{ id: string }>;
      failed: Array<{ questionText: string }>;
    };
    expect(body.saved).toHaveLength(1);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].questionText).toBe('Second question text.');
    expect(insert).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledTimes(2);
    expect(deleteByIds).not.toHaveBeenCalled();
  });

  it('serves the review page without calling OpenAI', async () => {
    const response = await request(app.getHttpServer())
      .get('/papers/review')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('does not interpret');
    expect(response.text).toContain('Needs manual review');
    expect(embed).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not serve a figure from an invalid or missing reference', async () => {
    await request(app.getHttpServer())
      .get('/papers/figures/not-a-hash/1/1')
      .expect(400);
    await request(app.getHttpServer())
      .get(`/papers/figures/${'ab'.repeat(32)}/1/1`)
      .expect(404);
    expect(embed).not.toHaveBeenCalled();
  });
});
