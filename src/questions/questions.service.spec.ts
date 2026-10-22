import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Difficulty, QuestionType } from '../generated/prisma/enums';
import { EMBEDDING_DIMENSIONS } from './embedding.service';
import { QuestionsService } from './questions.service';
import { QuestionsRepository } from './questions.repository';

describe('QuestionsService', () => {
  const embed = jest.fn();
  const insert = jest.fn();
  const search = jest.fn();
  const searchLexical = jest.fn();
  const filterOptions = jest.fn();
  const rewrite = { rewrite: jest.fn() };
  const service = new QuestionsService(
    { embed },
    {
      insert,
      search,
      searchLexical,
      filterOptions,
    } as unknown as QuestionsRepository,
    rewrite as never,
  );
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);

  const body = {
    questionText: 'State Newton second law.',
    subject: 'Physics',
    topic: 'Laws of Motion',
    difficulty: Difficulty.MEDIUM,
    questionType: QuestionType.SHORT,
  };

  beforeEach(() => {
    embed.mockReset();
    insert.mockReset();
    search.mockReset();
    searchLexical.mockReset();
  });

  it('does not call OpenAI or insert a row when validation fails', async () => {
    await expect(
      service.create({ ...body, questionText: ' ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(embed).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('embeds the question once and inserts only after a valid vector', async () => {
    embed.mockResolvedValue(vector);
    insert.mockResolvedValue({ id: 'question-1', embeddingStatus: 'READY' });

    await expect(service.create(body)).resolves.toMatchObject({
      id: 'question-1',
      embeddingStatus: 'READY',
    });
    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledWith(body.questionText);
    expect(insert).toHaveBeenCalledTimes(1);
    const insertCall = insert.mock.calls[0] as [unknown, number[], string];
    expect(insertCall[1]).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(insertCall[2]).toBe('text-embedding-3-small');
  });

  it('does not insert when embedding fails', async () => {
    embed.mockRejectedValue(
      new ServiceUnavailableException('Embedding request failed.'),
    );

    await expect(service.create(body)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(insert).not.toHaveBeenCalled();
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('does not insert when the vector length is not 1536', async () => {
    embed.mockResolvedValue([1, 2, 3]);

    await expect(service.create(body)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(insert).not.toHaveBeenCalled();
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('returns an empty result list without treating it as an error', async () => {
    embed.mockResolvedValue(vector);
    search.mockResolvedValue([]);

    await expect(
      service.search({ query: 'force', subject: 'Chemistry' }),
    ).resolves.toEqual({ results: [] });
    expect(embed).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(vector, {
      subject: 'Chemistry',
      examYear: null,
      yearFrom: null,
      yearTo: null,
      difficulty: null,
      limit: 5,
    });
    expect(searchLexical).not.toHaveBeenCalled();
  });

  it('passes a year range to the repository', async () => {
    embed.mockResolvedValue(vector);
    search.mockResolvedValue([]);

    await service.search({ query: 'optics', yearFrom: 2022, yearTo: 2024 });

    expect(search).toHaveBeenCalledWith(
      vector,
      expect.objectContaining({ yearFrom: 2022, yearTo: 2024 }),
    );
  });

  it('builds dropdown options with counts from the stored questions', async () => {
    filterOptions.mockResolvedValue([
      {
        subject: 'Physics',
        examYear: 2024,
        difficulty: Difficulty.MEDIUM,
        count: 10,
      },
      {
        subject: 'Physics',
        examYear: 2023,
        difficulty: Difficulty.HARD,
        count: 4,
      },
      {
        subject: 'Chemistry',
        examYear: 2024,
        difficulty: Difficulty.MEDIUM,
        count: 6,
      },
      {
        subject: 'Chemistry',
        examYear: null,
        difficulty: Difficulty.EASY,
        count: 1,
      },
    ]);

    const options = await service.filters(new Date('2026-10-15T00:00:00Z'));

    expect(embed).not.toHaveBeenCalled();
    expect(options).toEqual({
      subjects: [
        { value: 'Chemistry', count: 7 },
        { value: 'Physics', count: 14 },
      ],
      years: [
        { value: 2024, count: 16 },
        { value: 2023, count: 4 },
      ],
      difficulties: [
        { value: 'EASY', count: 1 },
        { value: 'MEDIUM', count: 16 },
        { value: 'HARD', count: 4 },
      ],
      timePeriods: [
        { label: 'Last 3 Years', yearFrom: 2024, yearTo: 2026, count: 16 },
        { label: 'Last 5 Years', yearFrom: 2022, yearTo: 2026, count: 20 },
        { label: 'Last 10 Years', yearFrom: 2017, yearTo: 2026, count: 20 },
      ],
      total: 21,
    });
  });

  it('does not embed an empty search query', async () => {
    await expect(service.search({ query: ' ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(embed).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });
});
