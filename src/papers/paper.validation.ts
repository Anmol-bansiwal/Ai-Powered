import { BadRequestException } from '@nestjs/common';
import { Difficulty, QuestionType } from '../generated/prisma/enums';
import { uniqueFigureUrls } from '../questions/question-figures';

const MAX_QUESTIONS = 100;

export type ApprovedQuestion = {
  questionText: string;
  pageReference: string;
  subject?: string | null;
  topic?: string | null;
  subtopic: string | null;
  difficulty?: Difficulty | null;
  questionType?: QuestionType | null;
  figureUrls: string[];
};

export type ApprovedPaper = {
  subject: string;
  topic: string;
  subtopic: string | null;
  examYear: number | null;
  examType: string | null;
  difficulty: Difficulty;
  questionType: QuestionType;
  questions: ApprovedQuestion[];
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
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new BadRequestException(
      `${field} must be at most ${maxLength} characters.`,
    );
  }
  return trimmed.length === 0 ? null : trimmed;
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

export function validateApprovedPaper(body: unknown): ApprovedPaper {
  if (!isRecord(body)) {
    throw new BadRequestException('Draft must be an object.');
  }
  if (!Array.isArray(body.questions) || body.questions.length === 0) {
    throw new BadRequestException('At least one question is required.');
  }
  if (body.questions.length > MAX_QUESTIONS) {
    throw new BadRequestException(
      `A paper can approve at most ${MAX_QUESTIONS} questions.`,
    );
  }

  let examYear: number | null = null;
  if (body.examYear !== undefined && body.examYear !== null) {
    if (
      typeof body.examYear !== 'number' ||
      !Number.isInteger(body.examYear) ||
      body.examYear < 1950 ||
      body.examYear > 2100
    ) {
      throw new BadRequestException(
        'examYear must be an integer from 1950 to 2100.',
      );
    }
    examYear = body.examYear;
  }

  return {
    subject: requiredText(body.subject, 'subject', 200),
    topic: requiredText(body.topic, 'topic', 200),
    subtopic: optionalText(body.subtopic, 'subtopic', 200),
    examYear,
    examType: optionalText(body.examType, 'examType', 100),
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
    questions: body.questions.map((question, index) => {
      if (!isRecord(question)) {
        throw new BadRequestException(
          `Question ${index + 1} must be an object.`,
        );
      }
      return {
        questionText: requiredText(
          question.questionText,
          'questionText',
          12000,
        ),
        pageReference: requiredText(
          question.pageReference,
          'pageReference',
          50,
        ),
        subject: optionalText(question.subject, 'subject', 200),
        topic: optionalText(question.topic, 'topic', 200),
        subtopic: optionalText(question.subtopic, 'subtopic', 200),
        difficulty:
          question.difficulty !== undefined && question.difficulty !== null
            ? enumValue(
                question.difficulty,
                'difficulty',
                Object.values(Difficulty),
              )
            : null,
        questionType:
          question.questionType !== undefined && question.questionType !== null
            ? enumValue(
                question.questionType,
                'questionType',
                Object.values(QuestionType),
              )
            : null,
        figureUrls: uniqueFigureUrls(
          Array.isArray(question.figureUrls)
            ? question.figureUrls.filter(
                (item): item is string =>
                  typeof item === 'string' && item.trim().length <= 1000,
              )
            : [],
        ),
      };
    }),
  };
}
