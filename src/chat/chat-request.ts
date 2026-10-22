import { BadRequestException } from '@nestjs/common';
import { Difficulty } from '../generated/prisma/enums';
import {
  isQuestionId,
  validateSearchQuestion,
} from '../questions/question.validation';
import { parseTimePeriod } from '../questions/time-period';
import { plainAnswerText } from './chat-markdown';

const YEAR_MIN = 1950;
const YEAR_MAX = 2100;
const PRIOR_TURN_LIMIT = 8;
const PRIOR_TURN_MAX_CHARS = 2000;
const SOURCES_PER_TURN = 5;
const KIND = /^[a-z_]{1,40}$/;
const SUBJECT_MAX_CHARS = 200;

export type ChatTurn = {
  role: 'user' | 'assistant';
  text: string;
  /** Question ids an assistant turn cited. Client data: re-checked in the DB. */
  sourceIds?: string[];
  /** Routing label we sent with an assistant turn, if the client kept it. */
  kind?: string;
  /** Subject we reported for an assistant turn; checked against the bank. */
  activeSubject?: string | null;
};

export type ChatQuery = {
  query: string;
  /** Earlier turns (newest last), for follow-up understanding only. */
  priorTurns: ChatTurn[];
  subject: string | null;
  examYear: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  difficulty: Difficulty | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Latest user message is searched; earlier turns inform subject/follow-up
// understanding only. paperTag is accepted but not applied.
export function parseChatRequest(body: unknown): ChatQuery {
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    throw new BadRequestException('Invalid message structure');
  }
  const messages: unknown[] = body.messages;
  const lastUserIndex = messages.findLastIndex(
    (item) => isRecord(item) && item.role === 'user',
  );
  if (lastUserIndex < 0) {
    throw new BadRequestException('Invalid message structure');
  }
  const message = messages[lastUserIndex];
  if (!isRecord(message) || !Array.isArray(message.parts)) {
    throw new BadRequestException('Invalid message structure');
  }

  const texts: string[] = [];
  for (const part of message.parts) {
    if (!isRecord(part)) {
      throw new BadRequestException('Invalid message structure');
    }
    if (part.type === 'file') {
      throw new BadRequestException('File attachments are not supported yet.');
    }
    if (part.type === 'text' && typeof part.text === 'string') {
      texts.push(part.text);
    }
  }
  const query = texts.join('\n').trim();
  if (query === '') {
    throw new BadRequestException('Message text is required.');
  }

  const priorTurns = readPriorTurns(messages.slice(0, lastUserIndex));

  const filters = readFilters(body.filters);
  const input = validateSearchQuestion({ query, ...filters });
  return {
    query: input.query,
    priorTurns,
    subject: input.subject,
    examYear: input.examYear,
    yearFrom: input.yearFrom,
    yearTo: input.yearTo,
    difficulty: input.difficulty,
  };
}

function readPriorTurns(messages: unknown[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const item of messages) {
    if (!isRecord(item)) {
      continue;
    }
    if (item.role !== 'user' && item.role !== 'assistant') {
      continue;
    }
    if (!Array.isArray(item.parts)) {
      continue;
    }
    const texts: string[] = [];
    const sourceIds: string[] = [];
    for (const part of item.parts) {
      if (!isRecord(part)) {
        continue;
      }
      if (
        part.type === 'text' &&
        typeof part.text === 'string' &&
        part.text.trim()
      ) {
        texts.push(part.text);
      }
      if (
        item.role === 'assistant' &&
        part.type === 'source-document' &&
        isQuestionId(part.sourceId) &&
        !sourceIds.includes(part.sourceId) &&
        sourceIds.length < SOURCES_PER_TURN
      ) {
        sourceIds.push(part.sourceId);
      }
    }
    const joined = texts.join('\n');
    const text = (
      item.role === 'assistant' ? plainAnswerText(joined) : joined.trim()
    ).slice(0, PRIOR_TURN_MAX_CHARS);
    if (!text) {
      continue;
    }
    const metadata =
      item.role === 'assistant' && isRecord(item.metadata)
        ? item.metadata
        : null;
    const kind =
      typeof metadata?.kind === 'string' && KIND.test(metadata.kind)
        ? metadata.kind
        : null;
    const subject = metadata?.activeSubject;
    const hasSubject =
      subject === null ||
      (typeof subject === 'string' && subject.length <= SUBJECT_MAX_CHARS);
    turns.push({
      role: item.role,
      text,
      ...(sourceIds.length > 0 ? { sourceIds } : {}),
      ...(kind ? { kind } : {}),
      ...(hasSubject ? { activeSubject: subject } : {}),
    });
  }
  // Keep a short window for follow-ups.
  return turns.slice(-PRIOR_TURN_LIMIT);
}

function readFilters(value: unknown): Omit<ChatQuery, 'query' | 'priorTurns'> {
  if (value === undefined || value === null) {
    return {
      subject: null,
      examYear: null,
      yearFrom: null,
      yearTo: null,
      difficulty: null,
    };
  }
  if (!isRecord(value)) {
    throw new BadRequestException('filters must be an object.');
  }
  const range = readTimePeriod(value.timePeriod);
  return {
    subject: readSubject(value.subject),
    examYear: readYear(value.year),
    yearFrom: range?.yearFrom ?? null,
    yearTo: range?.yearTo ?? null,
    difficulty: readDifficulty(value.difficulty),
  };
}

function readTimePeriod(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException('filters.timePeriod must be a string.');
  }
  return parseTimePeriod(value);
}

function readSubject(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException('filters.subject must be a string.');
  }
  return value.trim() === '' ? null : value.trim();
}

function readYear(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < YEAR_MIN ||
    value > YEAR_MAX
  ) {
    throw new BadRequestException(
      `filters.year must be a whole number from ${YEAR_MIN} to ${YEAR_MAX}.`,
    );
  }
  return value;
}

function readDifficulty(value: unknown): Difficulty | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  const match = Object.values(Difficulty).find((level) => level === upper);
  if (!match) {
    throw new BadRequestException(
      'filters.difficulty must be Easy, Medium or Hard.',
    );
  }
  return match;
}
