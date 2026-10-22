import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Difficulty, QuestionType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeDatabaseError } from '../prisma/sanitize-database-error';
import { EMBEDDING_DIMENSIONS } from './embedding.service';
import { uniqueFigureUrls } from './question-figures';
import { CreateQuestionInput, isQuestionId } from './question.validation';

const EXPECTED_DATABASE = 'edusearch_ai';

export type StoredQuestion = {
  id: string;
  questionText: string;
  subject: string;
  topic: string;
  subtopic: string | null;
  examYear: number | null;
  examType: string | null;
  difficulty: Difficulty;
  questionType: QuestionType;
  sourceDocument: string | null;
  fileUrl: string | null;
  pageReference: string | null;
  figureUrls: string[];
  embeddingStatus: 'READY';
  createdAt: string;
};

export type SearchFilters = {
  subject: string | null;
  examYear: number | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  difficulty: Difficulty | null;
  limit: number;
};

export type FilterOptionRow = {
  subject: string;
  examYear: number | null;
  difficulty: Difficulty;
  count: number;
};

export type SearchHit = {
  id: string;
  questionText: string;
  subject: string;
  topic: string;
  subtopic: string | null;
  examYear: number | null;
  examType: string | null;
  difficulty: Difficulty;
  questionType: QuestionType;
  sourceDocument: string | null;
  fileUrl: string | null;
  pageReference: string | null;
  figureUrls: string[];
  score: number;
};

export type LexicalHit = {
  id: string;
  questionText: string;
  pageReference: string | null;
};

export type AdminQuestionRow = {
  id: string;
  questionText: string;
  subject: string;
  topic: string;
  subtopic: string | null;
  examYear: number | null;
  examType: string | null;
  difficulty: string;
  questionType: string;
  sourceDocument: string | null;
  fileUrl: string | null;
  pageReference: string | null;
  figureUrls: string[];
  embeddingStatus: string;
  createdAt: string;
  updatedAt: string;
};

type QuestionRow = {
  id: string;
  questionText: string;
  subject: string;
  topic: string;
  subtopic: string | null;
  examYear: number | null;
  examType: string | null;
  difficulty: string;
  questionType: string;
  sourceDocument: string | null;
  fileUrl: string | null;
  pageReference: string | null;
  figureUrls?: string[] | null;
  embeddingStatus: string;
  createdAt: Date | string;
  score?: number | string;
};

@Injectable()
export class QuestionsRepository {
  private readonly logger = new Logger(QuestionsRepository.name);
  private databaseConfirmed = false;

  constructor(private readonly prisma: PrismaService) {}

  async insert(
    input: CreateQuestionInput,
    embedding: number[],
    model: string,
  ): Promise<StoredQuestion> {
    const vector = toVectorParameter(embedding);
    const questionId = crypto.randomUUID();
    const figureUrls = uniqueFigureUrls(input.figureUrls);
    await this.assertDatabase();
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<QuestionRow[]>`
          INSERT INTO questions (
            id,
            question_text,
            subject,
            topic,
            subtopic,
            exam_year,
            exam_type,
            difficulty,
            question_type,
            source_document,
            file_url,
            page_reference,
            embedding_status,
            embedding_model,
            embedding
          ) VALUES (
            CAST(${questionId} AS uuid),
            ${input.questionText},
            ${input.subject},
            ${input.topic},
            ${input.subtopic},
            ${input.examYear},
            ${input.examType},
            CAST(${input.difficulty} AS "Difficulty"),
            CAST(${input.questionType} AS "QuestionType"),
            ${input.sourceDocument},
            ${input.fileUrl},
            ${input.pageReference},
            'READY',
            ${model},
            CAST(${vector} AS vector)
          )
          RETURNING
            id,
            question_text AS "questionText",
            subject,
            topic,
            subtopic,
            exam_year AS "examYear",
            exam_type AS "examType",
            difficulty,
            question_type AS "questionType",
            source_document AS "sourceDocument",
            file_url AS "fileUrl",
            page_reference AS "pageReference",
            embedding_status AS "embeddingStatus",
            created_at AS "createdAt"
        `;
        const created = rows[0];
        if (!created) {
          throw new ServiceUnavailableException('Question could not be saved.');
        }
        for (let index = 0; index < figureUrls.length; index += 1) {
          const url = figureUrls[index];
          await tx.$executeRaw`
            INSERT INTO question_figures (
              id,
              question_id,
              url,
              page_reference,
              sort_order
            ) VALUES (
              CAST(${crypto.randomUUID()} AS uuid),
              CAST(${created.id} AS uuid),
              ${url},
              ${input.pageReference},
              ${index}
            )
            ON CONFLICT (question_id, url) DO NOTHING
          `;
        }
        return { ...created, figureUrls };
      });
      return mapStoredQuestion(row);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logDatabaseError(error);
      throw new ServiceUnavailableException('Question could not be saved.');
    }
  }

  async search(
    embedding: number[],
    filters: SearchFilters,
  ): Promise<SearchHit[]> {
    const vector = toVectorParameter(embedding);
    const yearFrom = filters.yearFrom ?? null;
    const yearTo = filters.yearTo ?? null;
    await this.assertDatabase();
    try {
      const rows = await this.prisma.$queryRaw<QuestionRow[]>`
        SELECT
          id,
          question_text AS "questionText",
          subject,
          topic,
          subtopic,
          exam_year AS "examYear",
          exam_type AS "examType",
          difficulty,
          question_type AS "questionType",
          source_document AS "sourceDocument",
          file_url AS "fileUrl",
          page_reference AS "pageReference",
          COALESCE(
            (
              SELECT array_agg(qf.url ORDER BY qf.sort_order, qf.created_at)
              FROM question_figures qf
              WHERE qf.question_id = questions.id
            ),
            '{}'::text[]
          ) AS "figureUrls",
          1 - (embedding <=> CAST(${vector} AS vector)) AS score
        FROM questions
        WHERE embedding_status = 'READY'
          AND embedding IS NOT NULL
          AND (CAST(${filters.subject} AS text) IS NULL OR subject = ${filters.subject})
          AND (CAST(${filters.examYear} AS integer) IS NULL OR exam_year = ${filters.examYear})
          AND (CAST(${yearFrom} AS integer) IS NULL OR exam_year >= ${yearFrom})
          AND (CAST(${yearTo} AS integer) IS NULL OR exam_year <= ${yearTo})
          AND (
            CAST(${filters.difficulty} AS text) IS NULL
            OR difficulty = CAST(${filters.difficulty} AS "Difficulty")
          )
        ORDER BY embedding <=> CAST(${vector} AS vector)
        LIMIT CAST(${filters.limit} AS integer)
      `;
      return rows.map(mapSearchHit);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logDatabaseError(error);
      throw new ServiceUnavailableException('Question search failed.');
    }
  }

  /**
   * Ready questions by id, in the order given. Used to re-check sources a
   * client sends back with chat history; unknown ids are simply missing.
   * score is 0 because these rows were not ranked by a search.
   */
  async findReadyByIds(ids: string[]): Promise<SearchHit[]> {
    const wanted = ids.filter(isQuestionId);
    if (wanted.length === 0) {
      return [];
    }
    await this.assertDatabase();
    try {
      const rows = await this.prisma.$queryRaw<QuestionRow[]>`
        SELECT
          id,
          question_text AS "questionText",
          subject,
          topic,
          subtopic,
          exam_year AS "examYear",
          exam_type AS "examType",
          difficulty,
          question_type AS "questionType",
          source_document AS "sourceDocument",
          file_url AS "fileUrl",
          page_reference AS "pageReference",
          COALESCE(
            (
              SELECT array_agg(qf.url ORDER BY qf.sort_order, qf.created_at)
              FROM question_figures qf
              WHERE qf.question_id = questions.id
            ),
            '{}'::text[]
          ) AS "figureUrls",
          0 AS score
        FROM questions
        WHERE embedding_status = 'READY'
          AND id = ANY(CAST(${wanted} AS uuid[]))
      `;
      const byId = new Map(rows.map((row) => [row.id, mapSearchHit(row)]));
      return wanted.flatMap((id) => byId.get(id) ?? []);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logDatabaseError(error);
      throw new ServiceUnavailableException('Question search failed.');
    }
  }

  /**
   * Subjects whose ready questions mention a topic, most questions first.
   * Same 'simple' text index as searchLexical, over text, topic and subtopic.
   */
  async subjectsMentioning(topic: string): Promise<string[]> {
    await this.assertDatabase();
    try {
      const rows = await this.prisma.$queryRaw<Array<{ subject: string }>>`
        SELECT subject
        FROM questions
        WHERE embedding_status = 'READY'
          AND to_tsvector(
            'simple',
            question_text || ' ' || coalesce(topic, '') || ' ' || coalesce(subtopic, '')
          ) @@ plainto_tsquery('simple', ${topic})
        GROUP BY subject
        ORDER BY COUNT(*) DESC, subject ASC
      `;
      return rows.map((row) => row.subject);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logDatabaseError(error);
      throw new ServiceUnavailableException('Question search failed.');
    }
  }

  /**
   * PostgreSQL full-text rank with the simple dictionary and ts_rank_cd.
   * This is lexical ranking, not BM25. The original query is passed through
   * unchanged so decimals and labels such as 1.5, D1, and LCR stay intact.
   * Row order is the rank used by reciprocal rank fusion.
   */
  async searchLexical(
    query: string,
    filters: SearchFilters,
  ): Promise<LexicalHit[]> {
    const yearFrom = filters.yearFrom ?? null;
    const yearTo = filters.yearTo ?? null;
    await this.assertDatabase();
    try {
      const rows = await this.prisma.$queryRaw<LexicalHit[]>`
        SELECT
          id,
          question_text AS "questionText",
          page_reference AS "pageReference"
        FROM (
          SELECT
            id,
            question_text,
            page_reference,
            to_tsvector(
              'simple',
              question_text || ' ' || coalesce(topic, '') || ' ' || coalesce(subtopic, '')
            ) AS document
          FROM questions
          WHERE embedding_status = 'READY'
            AND embedding IS NOT NULL
            AND (CAST(${filters.subject} AS text) IS NULL OR subject = ${filters.subject})
            AND (CAST(${filters.examYear} AS integer) IS NULL OR exam_year = ${filters.examYear})
            AND (CAST(${yearFrom} AS integer) IS NULL OR exam_year >= ${yearFrom})
            AND (CAST(${yearTo} AS integer) IS NULL OR exam_year <= ${yearTo})
            AND (
              CAST(${filters.difficulty} AS text) IS NULL
              OR difficulty = CAST(${filters.difficulty} AS "Difficulty")
            )
        ) AS candidates
        WHERE document @@ websearch_to_tsquery('simple', ${query})
        ORDER BY ts_rank_cd(
          document,
          websearch_to_tsquery('simple', ${query})
        ) DESC, id ASC
        LIMIT CAST(${filters.limit} AS integer)
      `;
      return rows;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logDatabaseError(error);
      throw new ServiceUnavailableException('Question search failed.');
    }
  }

  async filterOptions(): Promise<FilterOptionRow[]> {
    await this.assertDatabase();
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          subject: string;
          examYear: number | null;
          difficulty: string;
          count: bigint | number;
        }>
      >`
        SELECT
          subject,
          exam_year AS "examYear",
          difficulty::text AS difficulty,
          COUNT(*) AS count
        FROM questions
        WHERE embedding_status = 'READY'
          AND embedding IS NOT NULL
        GROUP BY subject, exam_year, difficulty
      `;
      return rows.flatMap((row) =>
        isDifficulty(row.difficulty)
          ? [
              {
                subject: row.subject,
                examYear: row.examYear,
                difficulty: row.difficulty,
                count: Number(row.count),
              },
            ]
          : [],
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logDatabaseError(error);
      throw new ServiceUnavailableException(
        'Filter options could not be loaded.',
      );
    }
  }

  /**
   * READY questions for AI guidance tips.
   * Mixes subjects (not only the newest uploads) so greetings do not look Chemistry-only
   * when Physics is also in the bank.
   */
  async sampleReadyQuestions(
    limit = 8,
  ): Promise<Array<{ questionText: string; subject: string }>> {
    await this.assertDatabase();
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ questionText: string; subject: string }>
      >`
        SELECT question_text AS "questionText", subject
        FROM (
          SELECT
            question_text,
            subject,
            ROW_NUMBER() OVER (
              PARTITION BY subject
              ORDER BY created_at DESC
            ) AS rn
          FROM questions
          WHERE embedding_status = 'READY'
        ) AS ranked
        WHERE rn <= GREATEST(2, CEIL(${limit}::numeric / NULLIF(
          (SELECT COUNT(DISTINCT subject)::numeric FROM questions WHERE embedding_status = 'READY'),
          0
        )))
        ORDER BY subject ASC, rn ASC
        LIMIT ${limit}
      `;
      return rows.map((row) => ({
        questionText: row.questionText,
        subject: row.subject,
      }));
    } catch (error) {
      this.logDatabaseError(error);
      throw new ServiceUnavailableException(
        'Question samples could not be loaded.',
      );
    }
  }

  /**
   * Admin list — all rows (any embedding status), newest first.
   */
  async listForAdmin(input: {
    subject: string | null;
    embeddingStatus: 'PENDING' | 'READY' | 'FAILED' | null;
    limit: number;
    offset: number;
  }): Promise<{ total: number; items: AdminQuestionRow[] }> {
    await this.assertDatabase();
    try {
      const totals = await this.prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM questions
        WHERE (CAST(${input.subject} AS text) IS NULL OR subject = ${input.subject})
          AND (
            CAST(${input.embeddingStatus} AS text) IS NULL
            OR embedding_status = CAST(${input.embeddingStatus} AS "EmbeddingStatus")
          )
      `;
      const rows = await this.prisma.$queryRaw<
        Array<
          Omit<AdminQuestionRow, 'createdAt' | 'updatedAt'> & {
            createdAt: Date | string;
            updatedAt: Date | string;
          }
        >
      >`
        SELECT
          id,
          question_text AS "questionText",
          subject,
          topic,
          subtopic,
          exam_year AS "examYear",
          exam_type AS "examType",
          difficulty::text AS difficulty,
          question_type::text AS "questionType",
          source_document AS "sourceDocument",
          file_url AS "fileUrl",
          page_reference AS "pageReference",
          COALESCE(
            (
              SELECT array_agg(qf.url ORDER BY qf.sort_order, qf.created_at)
              FROM question_figures qf
              WHERE qf.question_id = questions.id
            ),
            '{}'::text[]
          ) AS "figureUrls",
          embedding_status::text AS "embeddingStatus",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM questions
        WHERE (CAST(${input.subject} AS text) IS NULL OR subject = ${input.subject})
          AND (
            CAST(${input.embeddingStatus} AS text) IS NULL
            OR embedding_status = CAST(${input.embeddingStatus} AS "EmbeddingStatus")
          )
        ORDER BY created_at DESC
        LIMIT CAST(${input.limit} AS integer)
        OFFSET CAST(${input.offset} AS integer)
      `;
      return {
        total: totals[0]?.total ?? 0,
        items: rows.map((row) => ({
          ...row,
          figureUrls: Array.isArray(row.figureUrls) ? row.figureUrls : [],
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        })),
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logDatabaseError(error);
      throw new ServiceUnavailableException('Question list failed.');
    }
  }

  async findReadyDuplicate(
    sourceDocument: string,
    pageReference: string,
    normalizedText: string,
  ): Promise<boolean> {
    await this.assertDatabase();
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM questions
      WHERE source_document = ${sourceDocument}
        AND page_reference = ${pageReference}
        AND lower(regexp_replace(btrim(question_text), '\\s+', ' ', 'g')) = ${normalizedText}
      LIMIT 1
    `;
    return rows.length > 0;
  }

  async deleteByIds(ids: string[]): Promise<void> {
    await this.assertDatabase();
    for (const id of ids) {
      await this.prisma.$executeRaw`
        DELETE FROM questions WHERE id = CAST(${id} AS uuid)
      `;
    }
  }

  private async assertDatabase(): Promise<void> {
    if (this.databaseConfirmed) {
      return;
    }
    const rows = await this.prisma.$queryRaw<Array<{ name: string }>>`
      SELECT current_database() AS name
    `;
    if (rows[0]?.name !== EXPECTED_DATABASE) {
      throw new ServiceUnavailableException(
        'Question storage is only available for the edusearch_ai database.',
      );
    }
    this.databaseConfirmed = true;
  }

  private logDatabaseError(error: unknown): void {
    this.logger.error(`Question query failed. ${sanitizeDatabaseError(error)}`);
  }
}

export function toVectorParameter(values: number[]): string {
  if (
    values.length !== EMBEDDING_DIMENSIONS ||
    values.some((value) => typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw new ServiceUnavailableException('Embedding response was invalid.');
  }
  return `[${values.join(',')}]`;
}

function mapStoredQuestion(row: QuestionRow | undefined): StoredQuestion {
  if (!row || row.embeddingStatus !== 'READY') {
    throw new ServiceUnavailableException('Question could not be saved.');
  }
  return {
    ...mapCommon(row),
    embeddingStatus: 'READY',
    createdAt: toIso(row.createdAt),
  };
}

function mapSearchHit(row: QuestionRow): SearchHit {
  const score = Number(row.score);
  if (!Number.isFinite(score)) {
    throw new ServiceUnavailableException('Question search failed.');
  }
  return {
    ...mapCommon(row),
    score,
  };
}

function mapCommon(row: QuestionRow): Omit<SearchHit, 'score'> {
  if (!isDifficulty(row.difficulty) || !isQuestionType(row.questionType)) {
    throw new ServiceUnavailableException('Question search failed.');
  }
  return {
    id: row.id,
    questionText: row.questionText,
    subject: row.subject,
    topic: row.topic,
    subtopic: row.subtopic,
    examYear: row.examYear,
    examType: row.examType,
    difficulty: row.difficulty,
    questionType: row.questionType,
    sourceDocument: row.sourceDocument,
    fileUrl: row.fileUrl ?? null,
    pageReference: row.pageReference,
    figureUrls: Array.isArray(row.figureUrls) ? row.figureUrls : [],
  };
}

function isDifficulty(value: string): value is Difficulty {
  return Object.values(Difficulty).includes(value as Difficulty);
}

function isQuestionType(value: string): value is QuestionType {
  return Object.values(QuestionType).includes(value as QuestionType);
}

function toIso(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}
