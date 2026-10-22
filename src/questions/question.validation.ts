import { BadRequestException } from '@nestjs/common';
import { Difficulty, QuestionType } from '../generated/prisma/enums';
import { uniqueFigureUrls } from './question-figures';

/** Long HSC / board stems can exceed 4k; keep a hard ceiling for DB safety. */
const QUESTION_TEXT_MAX = 12000;
const SHORT_TEXT_MAX = 200;
const EXAM_TYPE_MAX = 100;
const SOURCE_MAX = 500;
const FILE_URL_MAX = 1000;
const PAGE_MAX = 50;
const QUERY_MAX = 1000;
const YEAR_MIN = 1950;
const YEAR_MAX = 2100;
const DEFAULT_LIMIT = 5;
const QUESTION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Question ids are UUIDs; anything else never reaches a query. */
export function isQuestionId(value: unknown): value is string {
  return typeof value === 'string' && QUESTION_ID.test(value);
}

export type CreateQuestionInput = {
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
};

export type SearchQuestionInput = {
  query: string;
  subject: string | null;
  examYear: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  difficulty: Difficulty | null;
  limit: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new BadRequestException(
      `${field} must be at most ${maxLength} characters.`,
    );
  }
  return trimmed;
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new BadRequestException(
      `${field} must be at most ${maxLength} characters.`,
    );
  }
  return trimmed;
}

function optionalYear(value: unknown, field = 'examYear'): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new BadRequestException(
      `${field} must be an integer from ${YEAR_MIN} to ${YEAR_MAX}.`,
    );
  }
  if (value < YEAR_MIN || value > YEAR_MAX) {
    throw new BadRequestException(
      `${field} must be an integer from ${YEAR_MIN} to ${YEAR_MAX}.`,
    );
  }
  return value;
}

function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BadRequestException(
      `${field} must be one of ${allowed.join(', ')}.`,
    );
  }
  return value as T;
}

export function validateCreateQuestion(body: unknown): CreateQuestionInput {
  if (!isRecord(body)) {
    throw new BadRequestException('Request body must be an object.');
  }

  return {
    questionText: requiredText(
      body.questionText,
      'questionText',
      QUESTION_TEXT_MAX,
    ),
    subject: requiredText(body.subject, 'subject', SHORT_TEXT_MAX),
    topic: requiredText(body.topic, 'topic', SHORT_TEXT_MAX),
    subtopic: optionalText(body.subtopic, 'subtopic', SHORT_TEXT_MAX),
    examYear: optionalYear(body.examYear),
    examType: optionalText(body.examType, 'examType', EXAM_TYPE_MAX),
    difficulty: enumValue(
      body.difficulty,
      'difficulty',
      Object.values(Difficulty),
    ),
    questionType: enumValue(
      body.questionType,
      'questionType',
      Object.values(QuestionType),
    ),
    sourceDocument: optionalText(
      body.sourceDocument,
      'sourceDocument',
      SOURCE_MAX,
    ),
    fileUrl: optionalText(body.fileUrl, 'fileUrl', FILE_URL_MAX),
    pageReference: optionalText(body.pageReference, 'pageReference', PAGE_MAX),
    figureUrls: uniqueFigureUrls(
      Array.isArray(body.figureUrls)
        ? body.figureUrls.filter(
            (item): item is string =>
              typeof item === 'string' && item.trim().length <= 1000,
          )
        : [],
    ),
  };
}

export function validateSearchQuestion(body: unknown): SearchQuestionInput {
  if (!isRecord(body)) {
    throw new BadRequestException('Request body must be an object.');
  }

  let limit = DEFAULT_LIMIT;
  if (body.limit !== undefined) {
    if (
      typeof body.limit !== 'number' ||
      !Number.isInteger(body.limit) ||
      body.limit < 1 ||
      body.limit > 20
    ) {
      throw new BadRequestException('limit must be an integer from 1 to 20.');
    }
    limit = body.limit;
  }

  const difficulty =
    body.difficulty === undefined || body.difficulty === null
      ? null
      : enumValue(body.difficulty, 'difficulty', Object.values(Difficulty));

  const yearFrom = optionalYear(body.yearFrom, 'yearFrom');
  const yearTo = optionalYear(body.yearTo, 'yearTo');
  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
    throw new BadRequestException('yearFrom must not be after yearTo.');
  }

  return {
    query: requiredText(body.query, 'query', QUERY_MAX),
    subject: optionalText(body.subject, 'subject', SHORT_TEXT_MAX),
    examYear: optionalYear(body.examYear),
    yearFrom,
    yearTo,
    difficulty,
    limit,
  };
}
