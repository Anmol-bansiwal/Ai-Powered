import { Difficulty, QuestionType } from '../generated/prisma/enums';
import {
  INSUFFICIENT_ANSWER,
  OUT_OF_SCOPE_ANSWER,
} from '../questions/quote-check';
import { SearchHit } from '../questions/questions.repository';
import {
  AI_NOTE,
  chatReply,
  deltasOf,
  quoteBlock,
  plainAnswerText,
  sourceOf,
} from './chat-markdown';

function hit(overrides: Partial<SearchHit>): SearchHit {
  return {
    id: 'q1',
    questionText: 'Question text',
    subject: 'Physics',
    topic: 'Topic',
    subtopic: null,
    examYear: 2024,
    examType: 'board',
    difficulty: Difficulty.MEDIUM,
    questionType: QuestionType.SHORT,
    sourceDocument: 'cbse-physics-xii-2024-25-sqp.pdf#abc123',
    fileUrl: null,
    pageReference: '2',
    figureUrls: [],
    score: 0.7,
    ...overrides,
  };
}

describe('quoteBlock', () => {
  it('turns stored scripts into inline KaTeX and keeps the base outside', () => {
    expect(quoteBlock('rate of 10^{8} V/s and CH_{3}COCH_{3}')).toBe(
      '> rate of 10$^{8}$ V/s and CH$_{3}$COCH$_{3}$',
    );
  });

  it('uses an ASCII minus inside the script so KaTeX parses it', () => {
    expect(quoteBlock('8.85 × 10^{−3} A, °C^{–1}, ms^{-2}')).toBe(
      '> 8.85 × 10$^{-3}$ A, °C$^{-1}$, ms$^{-2}$',
    );
  });

  it('keeps each stored line as its own line', () => {
    expect(quoteBlock('2. The charge is\n(a) 7 μC (b) 8 mC\n\n(c) 2 mC')).toBe(
      '> 2\\. The charge is\\\n> (a) 7 μC (b) 8 mC\\\n> (c) 2 mC',
    );
  });

  it('escapes Markdown characters so stored text is shown as written', () => {
    expect(quoteBlock('VA < VB, cost $5 * 2 [x] # _a_ & ~b~')).toBe(
      '> VA \\< VB, cost \\$5 \\* 2 \\[x\\] \\# \\_a\\_ \\& \\~b\\~',
    );
    expect(quoteBlock('- not a list\n+ nor this\n=== nor a heading')).toBe(
      '> \\- not a list\\\n> \\+ nor this\\\n> \\=== nor a heading',
    );
  });

  it('leaves braces that are not simple scripts as escaped text', () => {
    expect(quoteBlock('x^{a b} and y_{}')).toBe('> x^{a b} and y\\_{}');
  });
});

describe('sourceOf', () => {
  it('names the subject, topic, page and file without the hash', () => {
    expect(sourceOf(hit({}), 'q1')).toEqual({
      id: 'q1',
      title: 'Physics · Topic · Page 2',
      filename: 'cbse-physics-xii-2024-25-sqp.pdf',
      questionText: hit({}).questionText,
      figureUrls: [],
    });
  });

  it('omits missing page and file', () => {
    expect(
      sourceOf(
        hit({ examYear: null, pageReference: null, sourceDocument: null }),
        'q1',
      ),
    ).toEqual({
      id: 'q1',
      title: 'Physics · Topic',
      filename: null,
      questionText: hit({}).questionText,
      figureUrls: [],
    });
  });
});

describe('chatReply', () => {
  const light = hit({
    id: 'light',
    questionText: 'The speed of light is 3.0 × 10^{8} m/s in vacuum.',
    pageReference: '4',
  });

  it('formats an answered reply as quotes plus an in-chat source card', () => {
    const reply = chatReply({
      response: {
        status: 'answered',
        answer: 'The speed of light is 3.0 × 10^{8} m/s',
        explanation: null,
        sources: [
          {
            id: 'light',
            questionText: light.questionText,
            pageReference: '4',
            score: 0.7,
          },
        ],
      },
      related: [light],
    });

    expect(reply.markdown).toBe(
      [
        '> The speed of light is 3.0 × 10$^{8}$ m/s',
        '**Related question from your papers**',
        '*Physics · Topic · Page 4 · cbse-physics-xii-2024-25-sqp.pdf*',
        '> The speed of light is 3.0 × 10$^{8}$ m/s in vacuum.',
        '_From your exam archive_',
      ].join('\n\n'),
    );
    expect(reply.sources).toEqual([
      {
        id: 'light',
        title: 'Physics · Topic · Page 4',
        filename: 'cbse-physics-xii-2024-25-sqp.pdf',
        questionText: light.questionText,
        figureUrls: [],
      },
    ]);
  });

  it('lists the related stored questions when the answer is insufficient', () => {
    const reply = chatReply({
      response: {
        status: 'insufficient',
        answer: INSUFFICIENT_ANSWER,
        explanation: null,
        sources: [
          {
            id: 'light',
            questionText: light.questionText,
            pageReference: '4',
            score: 0.7,
          },
        ],
      },
      related: [light],
    });

    expect(reply.markdown).toBe(
      [
        INSUFFICIENT_ANSWER,
        '**Related question from your papers**',
        '*Physics · Topic · Page 4 · cbse-physics-xii-2024-25-sqp.pdf*',
        '> The speed of light is 3.0 × 10$^{8}$ m/s in vacuum.',
        '_From your exam archive_',
      ].join('\n\n'),
    );
    expect(reply.sources.map((source) => source.id)).toEqual(['light']);
  });

  it('leads with a labelled AI explanation when one is available', () => {
    const reply = chatReply({
      response: {
        status: 'insufficient',
        answer: INSUFFICIENT_ANSWER,
        explanation: 'Light travels at 3 × 10^{8} m/s.\nIt is a *constant*.',
        sources: [
          {
            id: 'light',
            questionText: light.questionText,
            pageReference: '4',
            score: 0.7,
          },
        ],
      },
      related: [light],
    });

    expect(reply.markdown).toBe(
      [
        'Light travels at 3 × 10$^{8}$ m/s.',
        'It is a \\*constant\\*.',
        `_${AI_NOTE}_`,
        '**Related question from your papers**',
        '*Physics · Topic · Page 4 · cbse-physics-xii-2024-25-sqp.pdf*',
        '> The speed of light is 3.0 × 10$^{8}$ m/s in vacuum.',
        '_From your exam archive_',
      ].join('\n\n'),
    );
  });

  it('omits an exam cover that does not share the student topic', () => {
    const cover = hit({
      id: 'cover',
      questionText:
        'GENERAL INSTRUCTIONS. Office Use Only. Candidate number. Reading time 10 minutes. Writing time 3 hours.',
      subject: 'Mathematics',
      topic: 'Instructions',
      score: 0.62,
    });
    const reply = chatReply({
      response: {
        status: 'insufficient',
        answer: INSUFFICIENT_ANSWER,
        explanation: null,
        sources: [
          {
            id: 'cover',
            questionText: cover.questionText,
            pageReference: '1',
            score: 0.62,
          },
        ],
      },
      related: [cover],
      understanding: {
        original: 'explain black holes',
        corrected: 'explain black holes',
        intent: 'academic',
      },
    });

    expect(reply.markdown).toBe(INSUFFICIENT_ANSWER);
    expect(reply.markdown).not.toMatch(/Related question from your papers/);
    expect(reply.sources).toEqual([]);
  });

  it('keeps a paper card when the retrieved question matches the topic', () => {
    const inertia = hit({
      id: 'inertia',
      questionText:
        'Define inertia as the tendency of a body to resist a change in its state of motion.',
      subject: 'Physics',
      topic: 'Forces',
      score: 0.71,
    });
    const reply = chatReply({
      response: {
        status: 'insufficient',
        answer: INSUFFICIENT_ANSWER,
        explanation: null,
        sources: [
          {
            id: 'inertia',
            questionText: inertia.questionText,
            pageReference: '2',
            score: 0.71,
          },
        ],
      },
      related: [inertia],
      understanding: {
        original: 'explain inertia',
        corrected: 'explain inertia',
        intent: 'academic',
      },
    });

    expect(reply.markdown).toMatch(/Related question from your papers/);
    expect(reply.sources.map((source) => source.id)).toEqual(['inertia']);
  });

  it('returns only the refusal when the question is out of scope', () => {
    expect(
      chatReply({
        response: {
          status: 'out_of_scope',
          answer: OUT_OF_SCOPE_ANSWER,
          explanation: null,
          sources: [],
        },
        related: [],
      }),
    ).toEqual({ markdown: OUT_OF_SCOPE_ANSWER, sources: [] });
  });
});

describe('deltasOf', () => {
  it('rebuilds the exact text and never splits a KaTeX piece', () => {
    const markdown = '> rate of 10$^{8}$ V/s\\\n> next  line\n\n**Sources**';
    const deltas = deltasOf(markdown, 2);

    expect(deltas.join('')).toBe(markdown);
    expect(
      deltas.every((delta) => (delta.match(/\$/g) ?? []).length % 2 === 0),
    ).toBe(true);
    expect(deltas[0]).toBe('> rate ');
  });

  it('returns no deltas for empty text', () => {
    expect(deltasOf('', 3)).toEqual([]);
  });
});

describe('chatReply — reworked answer', () => {
  const source = hit({
    id: 'q1',
    questionText: 'Define inertia.',
    topic: 'Forces',
  });

  function reworked(transformation: 'shorten' | 'example') {
    return chatReply({
      response: {
        status: 'answered',
        answer: 'Inertia: a body resists changes to its motion.',
        explanation: null,
        sources: [
          {
            id: 'q1',
            questionText: 'Define inertia.',
            pageReference: '2',
            score: 0,
          },
        ],
        answerOrigin: 'transformed',
        transformation,
      },
      related: [source],
      understanding: {
        original: 'make it shorter',
        corrected: 'make it shorter',
        intent: 'academic',
      },
    });
  }

  it('labels a shorter answer as rewritten and lists what it was based on', () => {
    const reply = reworked('shorten');

    expect(reply.markdown).toContain('**AI-rewritten explanation**');
    expect(reply.markdown).toContain('**Based on these paper sources**');
    expect(reply.markdown).not.toMatch(/^> Inertia:/m);
    expect(reply.sources.map((item) => item.id)).toEqual(['q1']);
  });

  it('labels an example as general knowledge, not as paper-based', () => {
    const reply = reworked('example');

    expect(reply.markdown).toContain(`**${AI_NOTE}**`);
    expect(reply.markdown).not.toContain('Based on these paper sources');
    expect(reply.markdown).toContain('Related question from your papers');
  });

  it('reads back as plain text on the next turn', () => {
    expect(plainAnswerText(reworked('shorten').markdown)).toBe(
      'Inertia: a body resists changes to its motion.',
    );
    expect(plainAnswerText(reworked('example').markdown)).toBe(
      'Inertia: a body resists changes to its motion.',
    );
  });
});
