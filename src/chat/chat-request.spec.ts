import { BadRequestException } from '@nestjs/common';
import { parseChatRequest } from './chat-request';

function userMessage(...parts: unknown[]) {
  return { id: 'u1', role: 'user', parts };
}

function rejection(body: unknown): string {
  try {
    parseChatRequest(body);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).message;
  }
  throw new Error('expected a rejection');
}

describe('parseChatRequest', () => {
  it('reads the latest user message from a useChat body', () => {
    const query = parseChatRequest({
      id: 'chat-1',
      trigger: 'submit-message',
      messages: [
        userMessage({ type: 'text', text: 'What is inertia?' }),
        {
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Earlier reply' }],
        },
        userMessage(
          { type: 'step-start' },
          { type: 'text', text: '  Explain the LCR circuit  ' },
        ),
      ],
    });

    expect(query).toEqual({
      query: 'Explain the LCR circuit',
      priorTurns: [
        { role: 'user', text: 'What is inertia?' },
        { role: 'assistant', text: 'Earlier reply' },
      ],
      subject: null,
      examYear: null,
      yearFrom: null,
      yearTo: null,
      difficulty: null,
    });
  });

  it('maps spec filters, turns timePeriod into a year range and ignores paperTag', () => {
    const thisYear = new Date().getFullYear();
    const query = parseChatRequest({
      messages: [userMessage({ type: 'text', text: 'Hardest questions' })],
      paperTag: 'NEET exam paper',
      filters: {
        subject: ' Physics ',
        timePeriod: 'Last 5 Years',
        difficulty: 'Hard',
        year: 2024,
      },
    });

    expect(query).toEqual({
      query: 'Hardest questions',
      priorTurns: [],
      subject: 'Physics',
      examYear: 2024,
      yearFrom: thisYear - 4,
      yearTo: thisYear,
      difficulty: 'HARD',
    });
  });

  it('treats empty filter values as no filter', () => {
    expect(
      parseChatRequest({
        messages: [userMessage({ type: 'text', text: 'Ohm law' })],
        filters: {
          subject: '',
          difficulty: '',
          year: null,
          timePeriod: 'All years',
        },
      }),
    ).toMatchObject({
      subject: null,
      examYear: null,
      yearFrom: null,
      yearTo: null,
      difficulty: null,
    });
  });

  it.each([
    [undefined, 'Invalid message structure'],
    [[], 'Invalid message structure'],
    [{ messages: 'hi' }, 'Invalid message structure'],
    [{ messages: [] }, 'Invalid message structure'],
    [
      { messages: [{ id: 'a', role: 'assistant', parts: [] }] },
      'Invalid message structure',
    ],
    [{ messages: [userMessage('text')] }, 'Invalid message structure'],
    [
      { messages: [userMessage({ type: 'text', text: '   ' })] },
      'Message text is required.',
    ],
  ])('rejects malformed body %#', (body, message) => {
    expect(rejection(body)).toBe(message);
  });

  it('rejects file parts instead of ignoring them', () => {
    expect(
      rejection({
        messages: [
          userMessage(
            { type: 'text', text: 'Solve this' },
            { type: 'file', mediaType: 'image/png', url: 'data:,' },
          ),
        ],
      }),
    ).toBe('File attachments are not supported yet.');
  });

  it.each([
    [
      { difficulty: 'Impossible' },
      'filters.difficulty must be Easy, Medium or Hard.',
    ],
    [
      { year: '2024' },
      'filters.year must be a whole number from 1950 to 2100.',
    ],
    [{ year: 1800 }, 'filters.year must be a whole number from 1950 to 2100.'],
    [{ subject: 7 }, 'filters.subject must be a string.'],
    [{ timePeriod: 5 }, 'filters.timePeriod must be a string.'],
    [
      { timePeriod: 'Recently' },
      'filters.timePeriod must look like "Last 5 Years" or "All years".',
    ],
  ])('rejects invalid filter %#', (filters, message) => {
    expect(
      rejection({
        messages: [userMessage({ type: 'text', text: 'Ohm law' })],
        filters,
      }),
    ).toBe(message);
  });

  it('rejects filters that are not an object', () => {
    expect(
      rejection({
        messages: [userMessage({ type: 'text', text: 'Ohm law' })],
        filters: ['Physics'],
      }),
    ).toBe('filters must be an object.');
  });

  it('applies the search query length limit', () => {
    expect(
      rejection({
        messages: [userMessage({ type: 'text', text: 'a'.repeat(1001) })],
      }),
    ).toBe('query must be at most 1000 characters.');
  });
});

describe('parseChatRequest — earlier turns', () => {
  const cited = '3f1c2a9e-8b7d-4c6e-9a5f-1b2c3d4e5f60';

  function withAssistant(assistant: Record<string, unknown>) {
    return parseChatRequest({
      messages: [
        userMessage({ type: 'text', text: 'What is inertia?' }),
        { id: 'a1', role: 'assistant', ...assistant },
        userMessage({ type: 'text', text: 'make it shorter' }),
      ],
    }).priorTurns[1];
  }

  it('keeps cited question ids and the routing label of an assistant turn', () => {
    const turn = withAssistant({
      metadata: { status: 'answered', kind: 'concept_explanation' },
      parts: [
        { type: 'text', text: 'Inertia is resistance to change.' },
        { type: 'source-document', sourceId: cited, title: 'Physics' },
        { type: 'source-document', sourceId: cited, title: 'Physics' },
      ],
    });
    expect(turn).toEqual({
      role: 'assistant',
      text: 'Inertia is resistance to change.',
      sourceIds: [cited],
      kind: 'concept_explanation',
    });
  });

  it('drops source ids that are not question ids and caps how many are kept', () => {
    const many = Array.from(
      { length: 7 },
      (_, index) => `3f1c2a9e-8b7d-4c6e-9a5f-1b2c3d4e5f6${index}`,
    );
    const turn = withAssistant({
      metadata: { kind: 'DROP TABLE' },
      parts: [
        { type: 'text', text: 'Answer' },
        { type: 'source-document', sourceId: "1' OR '1'='1" },
        { type: 'source-document', sourceId: 42 },
        ...many.map((sourceId) => ({ type: 'source-document', sourceId })),
      ],
    });
    expect(turn.sourceIds).toEqual(many.slice(0, 5));
    expect(turn.kind).toBeUndefined();
  });

  it('reads our own reply Markdown back as plain text', () => {
    const turn = withAssistant({
      parts: [
        {
          type: 'text',
          text: [
            '> Speed of light is 3 × 10$^{8}$ m/s\\.',
            '**Related question from your papers**',
            '*Physics · Optics*',
            '> State the speed of light.',
          ].join('\n\n'),
        },
      ],
    });
    expect(turn.text).toBe('Speed of light is 3 × 10^{8} m/s.');
  });

  it('clips a very long earlier turn', () => {
    const turn = withAssistant({
      parts: [{ type: 'text', text: 'x'.repeat(5000) }],
    });
    expect(turn.text).toHaveLength(2000);
  });

  it('keeps the subject we reported, including an explicit null', () => {
    const parts = [{ type: 'text', text: 'Answer' }];
    expect(
      withAssistant({ metadata: { activeSubject: 'Physics' }, parts })
        .activeSubject,
    ).toBe('Physics');
    expect(
      withAssistant({ metadata: { activeSubject: null }, parts }),
    ).toHaveProperty('activeSubject', null);
    expect(
      withAssistant({ metadata: { activeSubject: 42 }, parts }),
    ).not.toHaveProperty('activeSubject');
    expect(withAssistant({ parts })).not.toHaveProperty('activeSubject');
  });
});
