import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Difficulty } from '../generated/prisma/enums';
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EmbeddingService,
} from './embedding.service';
import {
  validateCreateQuestion,
  validateSearchQuestion,
} from './question.validation';
import { fuseByReciprocalRank, RankedDocument } from './reciprocal-rank';
import {
  LexicalHit,
  QuestionsRepository,
  SearchHit,
  StoredQuestion,
} from './questions.repository';
import { QueryRewriteService } from './query-rewrite.service';
import { lastYears, TIME_PERIOD_YEARS, timePeriodLabel } from './time-period';

export const HYBRID_CANDIDATE_LIMIT = 20;

type Counted<T> = { value: T; count: number };

export type FilterOptions = {
  subjects: Counted<string>[];
  years: Counted<number>[];
  difficulties: Counted<Difficulty>[];
  timePeriods: Array<{
    label: string;
    yearFrom: number;
    yearTo: number;
    count: number;
  }>;
  total: number;
};

export type BranchHit = RankedDocument & {
  rank: number;
};

export type HybridHit = RankedDocument & {
  rank: number;
  vectorRank: number | null;
  lexicalRank: number | null;
};

export type HybridSearchResponse = {
  vector: BranchHit[];
  lexical: BranchHit[];
  hybrid: HybridHit[];
};

export type RewrittenSearchResponse = {
  originalQuery: string;
  rewrittenQuery: string;
  rewritten: boolean;
  original: SearchHit[];
  rewrittenResults: SearchHit[];
};

@Injectable()
export class QuestionsService {
  constructor(
    private readonly embeddings: EmbeddingService,
    private readonly questions: QuestionsRepository,
    private readonly rewrite: QueryRewriteService,
  ) {}

  async create(body: unknown): Promise<StoredQuestion> {
    const input = validateCreateQuestion(body);
    const embedding = await this.embeddings.embed(input.questionText);
    assertEmbedding(embedding);
    return this.questions.insert(input, embedding, EMBEDDING_MODEL);
  }

  async search(body: unknown): Promise<{ results: SearchHit[] }> {
    const input = validateSearchQuestion(body);
    const embedding = await this.embeddings.embed(input.query);
    assertEmbedding(embedding);
    const results = await this.questions.search(embedding, {
      subject: input.subject,
      examYear: input.examYear,
      yearFrom: input.yearFrom,
      yearTo: input.yearTo,
      difficulty: input.difficulty,
      limit: input.limit,
    });
    return { results };
  }

  async findReadyByIds(ids: string[]): Promise<SearchHit[]> {
    return this.questions.findReadyByIds(ids);
  }

  async subjectsMentioning(topic: string): Promise<string[]> {
    return this.questions.subjectsMentioning(topic);
  }

  async sampleReadyQuestions(
    limit = 8,
  ): Promise<Array<{ questionText: string; subject: string }>> {
    return this.questions.sampleReadyQuestions(limit);
  }

  async listForAdmin(query: {
    subject?: string | null;
    embeddingStatus?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<{
    total: number;
    items: Awaited<ReturnType<QuestionsRepository['listForAdmin']>>['items'];
  }> {
    const subject =
      typeof query.subject === 'string' && query.subject.trim()
        ? query.subject.trim()
        : null;
    const statusRaw =
      typeof query.embeddingStatus === 'string'
        ? query.embeddingStatus.trim().toUpperCase()
        : '';
    const embeddingStatus =
      statusRaw === 'PENDING' || statusRaw === 'READY' || statusRaw === 'FAILED'
        ? statusRaw
        : null;
    const limit = clampInt(query.limit, 50, 1, 200);
    const offset = clampInt(query.offset, 0, 0, 100_000);
    return this.questions.listForAdmin({
      subject,
      embeddingStatus,
      limit,
      offset,
    });
  }

  async filters(now = new Date()): Promise<FilterOptions> {
    const rows = await this.questions.filterOptions();
    const subjects = new Map<string, number>();
    const years = new Map<number, number>();
    const difficulties = new Map<Difficulty, number>();
    for (const row of rows) {
      subjects.set(row.subject, (subjects.get(row.subject) ?? 0) + row.count);
      if (row.examYear !== null) {
        years.set(row.examYear, (years.get(row.examYear) ?? 0) + row.count);
      }
      difficulties.set(
        row.difficulty,
        (difficulties.get(row.difficulty) ?? 0) + row.count,
      );
    }

    return {
      subjects: [...subjects]
        .map(([value, count]) => ({ value, count }))
        .sort((left, right) => left.value.localeCompare(right.value)),
      years: [...years]
        .map(([value, count]) => ({ value, count }))
        .sort((left, right) => right.value - left.value),
      difficulties: Object.values(Difficulty)
        .filter((value) => difficulties.has(value))
        .map((value) => ({ value, count: difficulties.get(value) ?? 0 })),
      timePeriods: TIME_PERIOD_YEARS.map((span) => {
        const range = lastYears(span, now);
        const count = rows
          .filter(
            (row) =>
              row.examYear !== null &&
              row.examYear >= range.yearFrom &&
              row.examYear <= range.yearTo,
          )
          .reduce((sum, row) => sum + row.count, 0);
        return { label: timePeriodLabel(span), ...range, count };
      }),
      total: rows.reduce((sum, row) => sum + row.count, 0),
    };
  }

  async hybridSearch(body: unknown): Promise<HybridSearchResponse> {
    const input = validateSearchQuestion(body);
    const embedding = await this.embeddings.embed(input.query);
    assertEmbedding(embedding);
    const filters = {
      subject: input.subject,
      examYear: input.examYear,
      yearFrom: input.yearFrom,
      yearTo: input.yearTo,
      difficulty: input.difficulty,
      limit: Math.max(input.limit, HYBRID_CANDIDATE_LIMIT),
    };
    const [vectorHits, lexicalHits] = await Promise.all([
      this.questions.search(embedding, filters),
      this.questions.searchLexical(input.query, filters),
    ]);
    const vector = vectorHits.map(toRankedDocument);
    const lexical = lexicalHits.map(toRankedDocument);
    return {
      vector: withBranchRank(vector).slice(0, input.limit),
      lexical: withBranchRank(lexical).slice(0, input.limit),
      hybrid: fuseByReciprocalRank(vector, lexical)
        .slice(0, input.limit)
        .map((item, index) => ({
          id: item.id,
          questionText: item.questionText,
          pageReference: item.pageReference,
          rank: index + 1,
          vectorRank: item.vectorRank,
          lexicalRank: item.lexicalRank,
        })),
    };
  }

  // Experimental: compare original vs rewritten query retrieval. Production
  // search and answer still embed the student text as typed.
  async rewrittenSearch(body: unknown): Promise<RewrittenSearchResponse> {
    const input = validateSearchQuestion(body);
    const rewrite = await this.rewrite.rewrite(input.query);
    const filters = {
      subject: input.subject,
      examYear: input.examYear,
      yearFrom: input.yearFrom,
      yearTo: input.yearTo,
      difficulty: input.difficulty,
      limit: input.limit,
    };

    if (!rewrite.rewritten) {
      const embedding = await this.embeddings.embed(input.query);
      assertEmbedding(embedding);
      const results = await this.questions.search(embedding, filters);
      return {
        originalQuery: input.query,
        rewrittenQuery: input.query,
        rewritten: false,
        original: results,
        rewrittenResults: results,
      };
    }

    const [originalEmbedding, rewrittenEmbedding] = await Promise.all([
      this.embeddings.embed(input.query),
      this.embeddings.embed(rewrite.rewrittenQuery),
    ]);
    assertEmbedding(originalEmbedding);
    assertEmbedding(rewrittenEmbedding);
    const [original, rewrittenResults] = await Promise.all([
      this.questions.search(originalEmbedding, filters),
      this.questions.search(rewrittenEmbedding, filters),
    ]);
    return {
      originalQuery: input.query,
      rewrittenQuery: rewrite.rewrittenQuery,
      rewritten: true,
      original,
      rewrittenResults,
    };
  }
}

function toRankedDocument(hit: SearchHit | LexicalHit): RankedDocument {
  return {
    id: hit.id,
    questionText: hit.questionText,
    pageReference: hit.pageReference,
  };
}

function withBranchRank(items: RankedDocument[]): BranchHit[] {
  return items.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}

function assertEmbedding(values: number[]): void {
  if (
    values.length !== EMBEDDING_DIMENSIONS ||
    values.some((value) => typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw new ServiceUnavailableException('Embedding response was invalid.');
  }
}

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
