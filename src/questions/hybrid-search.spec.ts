import { BadRequestException } from '@nestjs/common';
import { Difficulty } from '../generated/prisma/enums';
import { EMBEDDING_DIMENSIONS } from './embedding.service';
import { HYBRID_CANDIDATE_LIMIT, QuestionsService } from './questions.service';
import { QuestionsRepository } from './questions.repository';

describe('hybrid search', () => {
  const embed = jest.fn();
  const search = jest.fn();
  const searchLexical = jest.fn();
  const rewrite = { rewrite: jest.fn() };
  const service = new QuestionsService(
    { embed },
    {
      search,
      searchLexical,
    } as unknown as QuestionsRepository,
    rewrite as never,
  );
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.2);

  beforeEach(() => {
    embed.mockReset();
    search.mockReset();
    searchLexical.mockReset();
    embed.mockResolvedValue(vector);
  });

  it('sends the original query and the same filters to both branches', async () => {
    search.mockResolvedValue([stored('vector-only', 0.2)]);
    searchLexical.mockResolvedValue([
      {
        id: 'lexical-only',
        questionText: '10 Ω through D1 and D2',
        pageReference: '4',
      },
    ]);

    const response = await service.hybridSearch({
      query: 'series LCR circuit 10 Ω',
      subject: 'Physics',
      examYear: 2024,
      difficulty: Difficulty.MEDIUM,
      limit: 5,
    });

    const filters = {
      subject: 'Physics',
      examYear: 2024,
      yearFrom: null,
      yearTo: null,
      difficulty: Difficulty.MEDIUM,
      limit: HYBRID_CANDIDATE_LIMIT,
    };
    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledWith('series LCR circuit 10 Ω');
    expect(search).toHaveBeenCalledWith(vector, filters);
    expect(searchLexical).toHaveBeenCalledWith(
      'series LCR circuit 10 Ω',
      filters,
    );
    expect(response.vector.map((item) => item.rank)).toEqual([1]);
    expect(response.lexical[0]).toMatchObject({
      id: 'lexical-only',
      pageReference: '4',
      rank: 1,
    });
    expect(response.hybrid.map((item) => item.id)).toEqual([
      'vector-only',
      'lexical-only',
    ]);
    expect(response.vector[0]).not.toHaveProperty('score');
    expect(response.hybrid[0]).toMatchObject({
      vectorRank: 1,
      lexicalRank: null,
    });
  });

  it('keeps vector hits when the lexical branch matches nothing', async () => {
    search.mockResolvedValue([stored('only', 0.99)]);
    searchLexical.mockResolvedValue([]);

    const response = await service.hybridSearch({ query: '1.5' });

    expect(response.lexical).toEqual([]);
    expect(response.hybrid).toEqual([
      {
        id: 'only',
        questionText: 'only text',
        pageReference: '2',
        rank: 1,
        vectorRank: 1,
        lexicalRank: null,
      },
    ]);
  });

  it('ranks a shared hit by reciprocal rank, not by the larger cosine score', async () => {
    search.mockResolvedValue([stored('a', 0.1), stored('b', 0.99)]);
    searchLexical.mockResolvedValue([
      { id: 'b', questionText: 'b text', pageReference: '2' },
      { id: 'a', questionText: 'a text', pageReference: '2' },
    ]);

    const response = await service.hybridSearch({ query: '8 N', limit: 1 });

    expect(response.hybrid[0].id).toBe('a');
    expect(response.hybrid[0]).toMatchObject({
      vectorRank: 1,
      lexicalRank: 2,
    });
    expect(response.vector.map((item) => item.id)).toEqual(['a']);
  });

  it('does not embed or search when the query is empty', async () => {
    await expect(service.hybridSearch({ query: ' ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(embed).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(searchLexical).not.toHaveBeenCalled();
  });
});

function stored(id: string, score: number) {
  return {
    id,
    questionText: `${id} text`,
    subject: 'Physics',
    topic: 'Forces',
    subtopic: null,
    examYear: 2024,
    examType: 'board',
    difficulty: Difficulty.MEDIUM,
    questionType: 'SHORT' as const,
    sourceDocument: null,
    fileUrl: null,
    pageReference: '2',
    figureUrls: [],
    score,
  };
}
