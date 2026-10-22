import { BadRequestException } from '@nestjs/common';
import { Difficulty, QuestionType } from '../generated/prisma/enums';
import {
  validateCreateQuestion,
  validateSearchQuestion,
} from './question.validation';

const validQuestion = {
  questionText: "State Newton's second law of motion.",
  subject: 'Physics',
  topic: 'Laws of Motion',
  subtopic: 'Second law',
  examYear: 2024,
  examType: 'board',
  difficulty: Difficulty.MEDIUM,
  questionType: QuestionType.SHORT,
  sourceDocument: 'physics-sample.pdf',
  pageReference: '96',
};

describe('question validation', () => {
  it('accepts a question and trims text fields', () => {
    expect(
      validateCreateQuestion({
        ...validQuestion,
        subject: '  Physics  ',
        subtopic: '   ',
      }),
    ).toMatchObject({
      subject: 'Physics',
      subtopic: null,
      difficulty: 'MEDIUM',
      questionType: 'SHORT',
    });
  });

  it('rejects an empty question before any other work', () => {
    expect(() =>
      validateCreateQuestion({ ...validQuestion, questionText: '   ' }),
    ).toThrow(BadRequestException);
  });

  it('rejects a difficulty that is not a generated enum value', () => {
    expect(() =>
      validateCreateQuestion({ ...validQuestion, difficulty: 'VERY_HARD' }),
    ).toThrow(/difficulty must be one of EASY, MEDIUM, HARD/);
  });

  it('rejects a non-integer exam year', () => {
    expect(() =>
      validateCreateQuestion({ ...validQuestion, examYear: 2024.5 }),
    ).toThrow(/examYear/);
  });

  it('defaults the search limit and allows omitted filters', () => {
    expect(validateSearchQuestion({ query: 'force and acceleration' })).toEqual(
      {
        query: 'force and acceleration',
        subject: null,
        examYear: null,
        yearFrom: null,
        yearTo: null,
        difficulty: null,
        limit: 5,
      },
    );
  });

  it('accepts a year range for the time period filter', () => {
    expect(
      validateSearchQuestion({ query: 'optics', yearFrom: 2022, yearTo: 2024 }),
    ).toMatchObject({ yearFrom: 2022, yearTo: 2024 });
  });

  it('rejects a year range that runs backwards', () => {
    expect(() =>
      validateSearchQuestion({ query: 'optics', yearFrom: 2024, yearTo: 2022 }),
    ).toThrow('yearFrom must not be after yearTo.');
  });

  it('names the year range field that is invalid', () => {
    expect(() =>
      validateSearchQuestion({ query: 'optics', yearTo: '2024' }),
    ).toThrow('yearTo must be an integer from 1950 to 2100.');
  });

  it('rejects an empty search query', () => {
    expect(() => validateSearchQuestion({ query: ' ' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a limit outside 1 to 20', () => {
    expect(() => validateSearchQuestion({ query: 'force', limit: 21 })).toThrow(
      /limit must be an integer from 1 to 20/,
    );
  });
});
