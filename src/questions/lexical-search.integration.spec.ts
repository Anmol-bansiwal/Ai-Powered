import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Difficulty, QuestionType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { EMBEDDING_DIMENSIONS } from './embedding.service';
import { CreateQuestionInput } from './question.validation';
import { QuestionsRepository } from './questions.repository';

const EXPECTED_DATABASE = 'edusearch_ai';

function databaseUrlFromEnvFile(): string {
  const contents = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  const match = contents.match(/^DATABASE_URL=(.*)$/m);
  if (!match) {
    throw new Error('DATABASE_URL is missing from .env');
  }
  return match[1].trim().replace(/^"|"$/g, '');
}

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

describe('lexical search', () => {
  jest.setTimeout(60000);

  const databaseUrl = databaseUrlFromEnvFile();
  if (databaseName(databaseUrl) !== EXPECTED_DATABASE) {
    throw new Error('Refusing lexical test: database is not edusearch_ai');
  }

  const previousUrl = process.env.DATABASE_URL;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaService();
    await prisma.$connect();
    const rows = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT current_database() AS name
    `;
    if (rows[0]?.name !== EXPECTED_DATABASE) {
      throw new Error(
        'Refusing lexical test: connected database is not edusearch_ai',
      );
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    if (previousUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousUrl;
    }
  });

  it('keeps 1.5, 8 N, 10 Ω, LCR, D1, and D2 searchable', async () => {
    const cases: Array<[string, string]> = [
      ['glass sphere of refractive index 1.5', '1.5'],
      ['a box pushed with a net force of 8 N', '8 N'],
      ['a resistor of 10 Ω', '10 Ω'],
      ['a series LCR circuit', 'LCR'],
      ['diodes D1 and D2 in the centre tap', 'D1'],
      ['diodes D1 and D2 in the centre tap', 'D2'],
    ];

    for (const [document, query] of cases) {
      const rows = await prisma.$queryRaw<Array<{ matched: boolean }>>`
        SELECT to_tsvector(
          'simple',
          ${document} || ' ' || '' || ' ' || ''
        ) @@ websearch_to_tsquery('simple', ${query}) AS matched
      `;
      expect({ document, query, matched: rows[0]?.matched }).toEqual({
        document,
        query,
        matched: true,
      });
    }
  });

  it('applies filters to its own fixture rows and leaves no rows behind', async () => {
    const subject = `Lexical fixture ${randomUUID()}`;
    let fixtureIds: string[] = [];

    await expect(
      prisma.$transaction(
        async (tx) => {
          const scoped = new QuestionsRepository(
            tx as unknown as PrismaService,
          );
          const insert = (
            questionText: string,
            overrides: Partial<CreateQuestionInput> = {},
          ) =>
            scoped.insert(
              {
                questionText,
                subject,
                topic: 'Fixture',
                subtopic: null,
                examYear: 2024,
                examType: 'fixture',
                difficulty: Difficulty.MEDIUM,
                questionType: QuestionType.SHORT,
                sourceDocument: null,
                fileUrl: null,
                pageReference: null,
                figureUrls: [],
                ...overrides,
              },
              FIXTURE_EMBEDDING,
              'fixture',
            );

          const lcr = await insert(
            'A series LCR circuit is driven by an ac source.',
          );
          const sphere = await insert(
            'A glass sphere of refractive index 1.5 is in air.',
          );
          const box = await insert('A box is pushed with a net force of 8 N.');
          const hard = await insert('An LCR circuit at resonance.', {
            difficulty: Difficulty.HARD,
          });
          const olderYear = await insert('An LCR circuit with a capacitor.', {
            examYear: 2023,
          });
          const pending = randomUUID();
          await tx.$executeRaw`
            INSERT INTO questions (
              id, question_text, subject, topic, exam_year, difficulty, question_type,
              embedding_status
            ) VALUES (
              CAST(${pending} AS uuid), 'A pending LCR question.', ${subject}, 'Fixture',
              2024, 'MEDIUM', 'SHORT', 'PENDING'
            )
          `;
          fixtureIds = [
            lcr.id,
            sphere.id,
            box.id,
            hard.id,
            olderYear.id,
            pending,
          ];

          const filters = {
            subject,
            examYear: 2024,
            difficulty: Difficulty.MEDIUM,
            limit: 20,
          };
          const ids = async (query: string, overrides = {}) =>
            (
              await scoped.searchLexical(query, { ...filters, ...overrides })
            ).map((row) => row.id);

          expect(await ids('LCR')).toEqual([lcr.id]);
          expect(await ids('1.5')).toEqual([sphere.id]);
          expect(await ids('8 N')).toEqual([box.id]);
          expect(await ids('LCR', { difficulty: Difficulty.HARD })).toEqual([
            hard.id,
          ]);
          expect(await ids('LCR', { examYear: 2023 })).toEqual([olderYear.id]);
          expect(await ids('LCR', { subject: `${subject} other` })).toEqual([]);
          expect(await ids('capital of France')).toEqual([]);

          throw new RollbackFixtures();
        },
        { timeout: 30000 },
      ),
    ).rejects.toBeInstanceOf(RollbackFixtures);

    expect(fixtureIds).toHaveLength(6);
    const leftover = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM questions
      WHERE id = ANY(CAST(${fixtureIds} AS uuid[])) OR subject = ${subject}
    `;
    expect(leftover[0]?.count).toBe(0);
  });
});

class RollbackFixtures extends Error {}

const FIXTURE_EMBEDDING = Array.from(
  { length: EMBEDDING_DIMENSIONS },
  (_, index) => (index === 0 ? 1 : 0),
);
