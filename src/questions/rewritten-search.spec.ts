import { Difficulty } from '../generated/prisma/enums';
import { EMBEDDING_DIMENSIONS } from './embedding.service';
import { QuestionsService } from './questions.service';
import { QuestionsRepository } from './questions.repository';
import { QueryRewriteService } from './query-rewrite.service';

describe('rewritten search', () => {
  const embed = jest.fn();
  const search = jest.fn();
  const rewrite = jest.fn();
  const service = new QuestionsService(
    { embed },
    { search } as unknown as QuestionsRepository,
    { rewrite } as unknown as QueryRewriteService,
  );
  const originalVector = Array.from(
    { length: EMBEDDING_DIMENSIONS },
    () => 0.1,
  );
  const rewrittenVector = Array.from(
    { length: EMBEDDING_DIMENSIONS },
    () => 0.2,
  );

  beforeEach(() => {
    embed.mockReset();
    search.mockReset();
    rewrite.mockReset();
  });

  it('embeds both queries and searches twice when the rewrite succeeds', async () => {
    rewrite.mockResolvedValue({
      rewrittenQuery: 'series LCR circuit with 10 V across each element',
      rewritten: true,
    });
    embed
      .mockResolvedValueOnce(originalVector)
      .mockResolvedValueOnce(rewrittenVector);
    search
      .mockResolvedValueOnce([stored('original-top', 0.4)])
      .mockResolvedValueOnce([stored('rewritten-top', 0.9)]);

    const response = await service.rewrittenSearch({
      query: 'that LCR one where 10 volt is across each',
      subject: 'Physics',
      difficulty: Difficulty.MEDIUM,
      limit: 5,
    });

    const filters = {
      subject: 'Physics',
      examYear: null,
      yearFrom: null,
      yearTo: null,
      difficulty: Difficulty.MEDIUM,
      limit: 5,
    };
    expect(rewrite).toHaveBeenCalledWith(
      'that LCR one where 10 volt is across each',
    );
    expect(embed).toHaveBeenCalledTimes(2);
    expect(embed).toHaveBeenNthCalledWith(
      1,
      'that LCR one where 10 volt is across each',
    );
    expect(embed).toHaveBeenNthCalledWith(
      2,
      'series LCR circuit with 10 V across each element',
    );
    expect(search).toHaveBeenNthCalledWith(1, originalVector, filters);
    expect(search).toHaveBeenNthCalledWith(2, rewrittenVector, filters);
    expect(response).toEqual({
      originalQuery: 'that LCR one where 10 volt is across each',
      rewrittenQuery: 'series LCR circuit with 10 V across each element',
      rewritten: true,
      original: [stored('original-top', 0.4)],
      rewrittenResults: [stored('rewritten-top', 0.9)],
    });
  });

  it('embeds once and reuses the same hits when rewrite falls back', async () => {
    rewrite.mockResolvedValue({
      rewrittenQuery: 'that LCR one where 10 volt is across each',
      rewritten: false,
    });
    embed.mockResolvedValue(originalVector);
    search.mockResolvedValue([stored('only', 0.5)]);

    const response = await service.rewrittenSearch({
      query: 'that LCR one where 10 volt is across each',
      limit: 3,
    });

    expect(embed).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(response.rewritten).toBe(false);
    expect(response.rewrittenQuery).toBe(
      'that LCR one where 10 volt is across each',
    );
    expect(response.original).toEqual(response.rewrittenResults);
  });
});

function stored(id: string, score: number) {
  return {
    id,
    questionText: id,
    subject: 'Physics',
    topic: 'topic',
    subtopic: null,
    examYear: 2024,
    examType: 'board',
    difficulty: Difficulty.MEDIUM,
    questionType: 'SHORT',
    sourceDocument: 'sample.pdf',
    fileUrl: null,
    pageReference: '1',
    figureUrls: [],
    score,
  };
}
