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

function vector(oneAt: number): number[] {
  const values = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  values[oneAt] = 1;
  return values;
}

function angled(axis: number, theta: number): number[] {
  const values = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  values[axis] = Math.cos(theta);
  values[axis + 1] = Math.sin(theta);
  return values;
}

function question(
  subject: string,
  difficulty: Difficulty,
  examYear: number,
): CreateQuestionInput {
  return {
    questionText: "Robert'); DROP TABLE questions; --",
    subject,
    topic: 'Integration',
    subtopic: null,
    examYear,
    examType: 'board',
    difficulty,
    questionType: QuestionType.SHORT,
    sourceDocument: null,
    fileUrl: null,
    pageReference: null,
    figureUrls: [],
  };
}

describe('QuestionsRepository integration', () => {
  jest.setTimeout(60000);

  const databaseUrl = databaseUrlFromEnvFile();
  if (databaseName(databaseUrl) !== EXPECTED_DATABASE) {
    throw new Error('Refusing integration test: database is not edusearch_ai');
  }

  const previousUrl = process.env.DATABASE_URL;
  let prisma: PrismaService;
  let repository: QuestionsRepository;
  const createdIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaService();
    await prisma.$connect();
    const rows = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT current_database() AS name
    `;
    if (rows[0]?.name !== EXPECTED_DATABASE) {
      throw new Error(
        'Refusing integration test: connected database is not edusearch_ai',
      );
    }
    repository = new QuestionsRepository(prisma);
  });

  afterAll(async () => {
    if (repository && createdIds.length > 0) {
      await repository.deleteByIds(createdIds);
    }
    await prisma?.$disconnect();
    if (previousUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousUrl;
    }
  });

  it('stores a vector, ranks the closer question first, and keeps user text as data', async () => {
    const subject = `Physics-${crypto.randomUUID()}`;
    const closer = await repository.insert(
      question(subject, Difficulty.MEDIUM, 2024),
      vector(100),
      'text-embedding-3-small',
    );
    const farther = await repository.insert(
      question(subject, Difficulty.EASY, 2020),
      vector(101),
      'text-embedding-3-small',
    );
    createdIds.push(closer.id, farther.id);

    expect(closer.embeddingStatus).toBe('READY');
    expect(closer.questionText).toBe("Robert'); DROP TABLE questions; --");
    expect(closer).not.toHaveProperty('embedding');

    const ranked = await repository.search(vector(100), {
      subject,
      examYear: null,
      difficulty: null,
      limit: 5,
    });
    expect(ranked.map((row) => row.id)).toEqual([closer.id, farther.id]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[0]).not.toHaveProperty('embedding');

    const filtered = await repository.search(vector(100), {
      subject,
      examYear: 2024,
      difficulty: Difficulty.MEDIUM,
      limit: 5,
    });
    expect(filtered.map((row) => row.id)).toEqual([closer.id]);

    const empty = await repository.search(vector(100), {
      subject,
      examYear: 1999,
      difficulty: Difficulty.HARD,
      limit: 5,
    });
    expect(empty).toEqual([]);

    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'questions'
    `;
    expect(tables).toHaveLength(1);
  });

  it('ranks a relevant subject above unrelated subjects and applies exact filters', async () => {
    const physics = 'SeedPhysics';
    const chemistry = 'SeedChemistry';
    const history = 'SeedHistory';
    const samples = [
      {
        text: "State Newton's second law of motion.",
        subject: physics,
        topic: 'Laws of Motion',
        difficulty: Difficulty.MEDIUM,
        examYear: 2024,
        vector: angled(0, 0.2),
      },
      {
        text: 'Define acceleration.',
        subject: physics,
        topic: 'Motion',
        difficulty: Difficulty.EASY,
        examYear: 2024,
        vector: angled(0, 0.5),
      },
      {
        text: 'What is momentum?',
        subject: physics,
        topic: 'Momentum',
        difficulty: Difficulty.MEDIUM,
        examYear: 2023,
        vector: angled(0, 0.8),
      },
      {
        text: "State Ohm's law.",
        subject: physics,
        topic: 'Electricity',
        difficulty: Difficulty.HARD,
        examYear: 2022,
        vector: angled(0, 1.1),
      },
      {
        text: 'State the periodic law.',
        subject: chemistry,
        topic: 'Periodic table',
        difficulty: Difficulty.MEDIUM,
        examYear: 2024,
        vector: angled(2, 0.2),
      },
      {
        text: 'What is an acid?',
        subject: chemistry,
        topic: 'Acids',
        difficulty: Difficulty.EASY,
        examYear: 2021,
        vector: angled(2, 0.7),
      },
      {
        text: 'What caused the French Revolution?',
        subject: history,
        topic: 'Revolutions',
        difficulty: Difficulty.MEDIUM,
        examYear: 2024,
        vector: angled(4, 0.2),
      },
      {
        text: 'Name one Mughal emperor.',
        subject: history,
        topic: 'Mughal empire',
        difficulty: Difficulty.EASY,
        examYear: 2019,
        vector: angled(4, 0.7),
      },
    ];

    const saved: Array<{ id: string }> = [];
    for (const sample of samples) {
      const row = await repository.insert(
        {
          questionText: sample.text,
          subject: sample.subject,
          topic: sample.topic,
          subtopic: null,
          examYear: sample.examYear,
          examType: 'board',
          difficulty: sample.difficulty,
          questionType: QuestionType.SHORT,
          sourceDocument: null,
          fileUrl: null,
          pageReference: null,
          figureUrls: [],
        },
        sample.vector,
        'text-embedding-3-small',
      );
      saved.push(row);
      createdIds.push(row.id);
    }

    const physicsQuery = await repository.search(vector(0), {
      subject: null,
      examYear: null,
      difficulty: null,
      limit: 4,
    });
    expect(physicsQuery.map((row) => row.questionText)).toEqual([
      "State Newton's second law of motion.",
      'Define acceleration.',
      'What is momentum?',
      "State Ohm's law.",
    ]);
    expect(physicsQuery[0].score).toBeGreaterThan(physicsQuery[1].score);
    expect(physicsQuery[1].score).toBeGreaterThan(physicsQuery[2].score);
    expect(physicsQuery[2].score).toBeGreaterThan(physicsQuery[3].score);
    expect(physicsQuery.every((row) => row.subject === physics)).toBe(true);
    expect(physicsQuery[0]).not.toHaveProperty('embedding');

    const historyQuery = await repository.search(vector(4), {
      subject: null,
      examYear: null,
      difficulty: null,
      limit: 2,
    });
    expect(historyQuery.map((row) => row.questionText)).toEqual([
      'What caused the French Revolution?',
      'Name one Mughal emperor.',
    ]);
    expect(historyQuery[0].score).toBeGreaterThan(historyQuery[1].score);

    const filtered = await repository.search(vector(0), {
      subject: physics,
      examYear: 2024,
      difficulty: Difficulty.MEDIUM,
      limit: 5,
    });
    expect(filtered.map((row) => row.id)).toEqual([saved[0].id]);

    const empty = await repository.search(vector(0), {
      subject: physics,
      examYear: 1999,
      difficulty: Difficulty.HARD,
      limit: 5,
    });
    expect(empty).toEqual([]);
  });

  it('matches a duplicate only for the same source document, page, and normalized text', async () => {
    const source = `physics-sample.pdf#sha256:${'a'.repeat(64)}`;
    const otherSource = `chemistry-sample.pdf#sha256:${'b'.repeat(64)}`;
    const saved = await repository.insert(
      {
        questionText: 'State  Newton\nsecond   law',
        subject: `Dup-${crypto.randomUUID()}`,
        topic: 'Laws',
        subtopic: null,
        examYear: 2024,
        examType: 'board',
        difficulty: Difficulty.MEDIUM,
        questionType: QuestionType.SHORT,
        sourceDocument: source,
        fileUrl: null,
        pageReference: '12',
        figureUrls: [],
      },
      vector(120),
      'text-embedding-3-small',
    );
    createdIds.push(saved.id);

    await expect(
      repository.findReadyDuplicate(source, '12', 'state newton second law'),
    ).resolves.toBe(true);
    await expect(
      repository.findReadyDuplicate(source, '13', 'state newton second law'),
    ).resolves.toBe(false);
    await expect(
      repository.findReadyDuplicate(
        otherSource,
        '12',
        'state newton second law',
      ),
    ).resolves.toBe(false);
  });
});
