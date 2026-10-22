import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { readUIMessageStream, type UIMessageChunk } from 'ai';
import { Difficulty, QuestionType } from '../generated/prisma/enums';
import { AnswersService } from '../questions/answers.service';
import { OUT_OF_SCOPE_ANSWER } from '../questions/quote-check';
import { SearchHit } from '../questions/questions.repository';
import { ChatQuery } from './chat-request';
import { ChatService, FAILED_TEXT, UNAVAILABLE_TEXT } from './chat.service';

const QUERY: ChatQuery = {
  query: 'What speed of light does the paper state?',
  priorTurns: [],
  subject: 'Physics',
  examYear: null,
  yearFrom: null,
  yearTo: null,
  difficulty: null,
};

const LIGHT: SearchHit = {
  id: 'light',
  questionText: 'The speed of light is 3.0 × 10^{8} m/s in vacuum.',
  subject: 'Physics',
  topic: 'Optics',
  subtopic: null,
  examYear: 2024,
  examType: 'board',
  difficulty: Difficulty.MEDIUM,
  questionType: QuestionType.SHORT,
  sourceDocument: 'physics.pdf#hash',
  fileUrl: null,
  pageReference: '4',
  figureUrls: [],
  score: 0.7,
};

async function collect(
  stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return chunks;
    }
    chunks.push(value);
  }
}

describe('ChatService', () => {
  const answerWithHits = jest.fn();
  const service = new ChatService(
    { answerWithHits } as unknown as AnswersService,
    { wordsPerDelta: 3, delayMs: 0 },
  );

  let logError: jest.SpyInstance;

  beforeEach(() => {
    answerWithHits.mockReset();
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('streams a verified answer in the UI message chunk order', async () => {
    answerWithHits.mockResolvedValue({
      response: {
        status: 'answered',
        answer: 'The speed of light is 3.0 × 10^{8} m/s',
        sources: [
          {
            id: 'light',
            questionText: LIGHT.questionText,
            pageReference: '4',
            score: 0.7,
          },
        ],
      },
      related: [LIGHT],
    });

    const chunks = await collect(
      service.stream(QUERY, new AbortController().signal),
    );

    expect(answerWithHits).toHaveBeenCalledWith(QUERY);
    const types = chunks.map((chunk) => chunk.type);
    expect(types.slice(0, 3)).toEqual(['start', 'start-step', 'text-start']);
    expect(types.slice(-4)).toEqual([
      'text-end',
      'source-document',
      'finish-step',
      'finish',
    ]);
    expect(
      types.filter((type) => type === 'text-delta').length,
    ).toBeGreaterThan(1);
    expect(chunks).toContainEqual({
      type: 'source-document',
      sourceId: 'light',
      mediaType: 'text/plain',
      title: 'Physics · Optics · Page 4',
      filename: 'physics.pdf',
      providerMetadata: {
        edusearch: {
          questionText: LIGHT.questionText,
          figureUrls: [],
          fromPaper: true,
        },
      },
    });
    expect(chunks.at(-1)).toEqual({
      type: 'finish',
      finishReason: 'stop',
      messageMetadata: {
        status: 'answered',
        activeSubject: null,
        kind: null,
        answerOrigin: null,
      },
    });
  });

  it('includes activeSubject in finish metadata after subject selection', async () => {
    answerWithHits.mockResolvedValue({
      response: {
        status: 'guidance',
        answer: 'Happy to help with Physics.',
        explanation: null,
        sources: [],
      },
      related: [],
      understanding: {
        original: 'physics',
        corrected: 'Physics',
        intent: 'clarify',
        kind: 'subject_selection',
        activeSubject: 'Physics',
      },
    });

    const chunks = await collect(
      service.stream(
        { ...QUERY, query: 'physics', subject: null },
        new AbortController().signal,
      ),
    );

    expect(chunks.at(-1)).toEqual({
      type: 'finish',
      finishReason: 'stop',
      messageMetadata: {
        status: 'guidance',
        activeSubject: 'Physics',
        kind: 'subject_selection',
        answerOrigin: null,
      },
    });
  });

  it('produces the message useChat would render', async () => {
    answerWithHits.mockResolvedValue({
      response: {
        status: 'out_of_scope',
        answer: OUT_OF_SCOPE_ANSWER,
        sources: [],
      },
      related: [],
      understanding: {
        original: 'Who wrote Hamlet?',
        corrected: 'Who wrote Hamlet?',
        intent: 'clarify',
        kind: 'out_of_scope',
        activeSubject: null,
      },
    });

    let message: unknown;
    for await (const update of readUIMessageStream({
      stream: service.stream(QUERY, new AbortController().signal),
    })) {
      message = update;
    }

    expect(message).toMatchObject({
      role: 'assistant',
      metadata: {
        status: 'out_of_scope',
        activeSubject: null,
        kind: 'out_of_scope',
      },
      parts: [
        { type: 'step-start' },
        { type: 'text', text: OUT_OF_SCOPE_ANSWER, state: 'done' },
      ],
    });
  });

  it('sends a generic error chunk when the answer model is unavailable', async () => {
    answerWithHits.mockRejectedValue(
      new ServiceUnavailableException('Answer request failed.'),
    );

    const chunks = await collect(
      service.stream(QUERY, new AbortController().signal),
    );

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'start',
      'start-step',
      'error',
    ]);
    expect(chunks.at(-1)).toEqual({
      type: 'error',
      errorText: UNAVAILABLE_TEXT,
    });
  });

  it('does not expose internal error details', async () => {
    answerWithHits.mockRejectedValue(
      new Error('connect failed postgresql://user:secret@db:5432/edusearch_ai'),
    );

    const chunks = await collect(
      service.stream(QUERY, new AbortController().signal),
    );

    expect(chunks.at(-1)).toEqual({ type: 'error', errorText: FAILED_TEXT });
    expect(JSON.stringify(chunks)).not.toContain('secret');
    expect(logError).toHaveBeenCalledWith(
      'connect failed postgresql://[redacted]',
    );
  });

  it('stops sending text once the client has disconnected', async () => {
    const disconnected = new AbortController();
    answerWithHits.mockImplementation(() => {
      disconnected.abort();
      return Promise.resolve({
        response: {
          status: 'out_of_scope',
          answer: OUT_OF_SCOPE_ANSWER,
          sources: [],
        },
        related: [],
      });
    });

    const chunks = await collect(service.stream(QUERY, disconnected.signal));

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'start',
      'start-step',
      'text-start',
    ]);
  });
});
