import { Difficulty, QuestionType } from '../generated/prisma/enums';
import { AnswerModelService } from './answer-model.service';
import { AnswersService } from './answers.service';
import { QueryUnderstandingService } from './query-understanding.service';
import { SearchHit } from './questions.repository';
import { QuestionsService } from './questions.service';

/**
 * Real student messages. These lock the route; they are not production rules.
 */
describe('chat routing regression', () => {
  const understand = new QueryUnderstandingService();
  const bank = ['Physics', 'Chemistry', 'Mathematics'];

  it('routes hello and how are u??? as greetings', () => {
    expect(understand.understand('hello', { bankSubjects: bank }).intent).toBe(
      'greeting',
    );
    const casual = understand.understand('how are u???', {
      bankSubjects: bank,
    });
    expect(casual.original).toBe('how are u???');
    expect(casual.intent).toBe('greeting');
    expect(casual.kind).toBe('greeting');
  });

  it('asks for a rephrase on keyboard mash', () => {
    const result = understand.understand('gydrxg', { bankSubjects: bank });
    expect(result.kind).toBe('unintelligible');
    expect(result.intent).toBe('clarify');
    expect(result.activeSubject).toBeNull();
  });

  it('asks before accepting a short subject prefix', () => {
    const result = understand.understand('phy', { bankSubjects: bank });
    expect(result.kind).toBe('subject_suggestion');
    expect(result.guidanceMessage).toMatch(/Did you mean Physics/i);
  });

  it('accepts physcis as Physics from the catalogue, not a typo dictionary', () => {
    const result = understand.understand('physcis', { bankSubjects: bank });
    expect(result.kind).toBe('subject_selection');
    expect(result.activeSubject).toBe('Physics');
    expect(result.corrected).toBe('Physics');
  });

  it('reads mass in phy as Physics plus the topic', () => {
    const result = understand.understand('mass in phy', { bankSubjects: bank });
    expect(result.activeSubject).toBe('Physics');
    expect(result.activeSubject).not.toBe('Mathematics');
    expect(result.guidanceMessage ?? result.corrected).toMatch(/mass/i);
  });

  it('sends how does inertia work? to academic retrieval', () => {
    const result = understand.understand('how does inertia work?', {
      bankSubjects: bank,
    });
    expect(result.intent).toBe('academic');
    expect(result.kind).not.toBe('greeting');
  });

  it('explains it from the previous inertia turn', () => {
    const result = understand.understand('explain it', {
      bankSubjects: bank,
      priorTurns: [
        { role: 'user', text: 'how does inertia work?' },
        {
          role: 'assistant',
          text: 'Inertia is resistance to a change in motion.',
        },
      ],
    });
    expect(result.kind).toBe('follow_up');
    expect(result.intent).toBe('academic');
    expect(result.corrected).toMatch(/resistance to a change in motion/i);
  });

  it('names a bare topic like magnitude and asks only for its subject', () => {
    const result = understand.understand('magnitude', { bankSubjects: bank });
    expect(result.intent).toBe('clarify');
    expect(result.topic).toBe('magnitude');
    expect(result.activeSubject).toBeNull();
    expect(result.guidanceMessage).toMatch(/“magnitude”/);
    expect(result.guidanceMessage).toMatch(/which subject/i);
  });

  it('answers magnitude once the student picks physics', () => {
    const first = understand.understand('magnitude', { bankSubjects: bank });
    const result = understand.understand('physics', {
      bankSubjects: bank,
      priorTurns: [
        { role: 'user', text: 'magnitude' },
        { role: 'assistant', text: first.guidanceMessage ?? '' },
      ],
    });
    expect(result.intent).toBe('academic');
    expect(result.activeSubject).toBe('Physics');
    expect(result.topic).toBe('magnitude');
    expect(result.corrected).toBe('Physics: What is magnitude?');
  });

  it('still confirms a subject when nothing was waiting for one', () => {
    for (const earlier of ['hello', 'homework', 'gydrxg']) {
      const reply = understand.understand(earlier, { bankSubjects: bank });
      const result = understand.understand('physics', {
        bankSubjects: bank,
        priorTurns: [
          { role: 'user', text: earlier },
          {
            role: 'assistant',
            text:
              reply.guidanceMessage ?? 'Hi! What would you like to work on?',
          },
        ],
      });
      expect(result.kind).toBe('subject_selection');
      expect(result.intent).toBe('clarify');
    }
  });

  it('does not reuse a topic the student already moved past', () => {
    const result = understand.understand('physics', {
      bankSubjects: bank,
      priorTurns: [
        { role: 'user', text: 'magnitude' },
        { role: 'assistant', text: 'Which subject is this for?' },
        { role: 'user', text: 'hello' },
        { role: 'assistant', text: 'Hi! What would you like to work on?' },
      ],
    });
    expect(result.kind).toBe('subject_selection');
  });
});

describe('chat routing regression — evidence', () => {
  const search = jest.fn();
  const filters = jest.fn();
  const service = new AnswersService(
    {
      search,
      sampleReadyQuestions: jest.fn().mockResolvedValue([]),
      filters,
    } as unknown as QuestionsService,
    {
      proposeQuotes: jest
        .fn()
        .mockResolvedValue({ complete: false, quotes: [] }),
      explain: jest.fn().mockResolvedValue(null),
      // No usable decision: these cases check the rule-based fallback.
      decide: jest.fn().mockResolvedValue(null),
      describeCapabilities: jest.fn(),
      guide: jest.fn(),
    } as unknown as AnswerModelService,
    new QueryUnderstandingService(),
  );

  beforeEach(() => {
    search.mockReset();
    filters.mockReset();
    filters.mockResolvedValue({
      subjects: [
        { value: 'Physics' },
        { value: 'Chemistry' },
        { value: 'Mathematics' },
      ],
      years: [],
      difficulties: [],
      timePeriods: [],
      total: 3,
    });
  });

  it('does not search for a greeting', async () => {
    const result = await service.answer({
      query: 'how are u???',
      subject: 'Mathematics',
    });
    expect(result.status).toBe('guidance');
    expect(result.sources).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it('says the archive has no answer and cites nothing', async () => {
    search.mockResolvedValue({ results: [] });
    const result = await service.answer({ query: 'explain photosynthesis' });
    expect(result.sources).toEqual([]);
    expect(result.status).toBe('out_of_scope');
    expect(search).toHaveBeenCalled();
  });

  it('keeps inertia and not Newton when the student says explain it', async () => {
    search.mockResolvedValue({
      results: [
        hit({
          id: 'inertia',
          questionText:
            'Define inertia as the tendency of a body to resist a change in its state of motion.',
          subject: 'Physics',
          topic: 'Forces',
          score: 0.74,
        }),
        hit({
          id: 'newton',
          questionText: "State Newton's second law of motion.",
          subject: 'Physics',
          topic: 'Forces',
          score: 0.46,
        }),
      ],
    });
    const result = await service.answer({
      query: 'explain it',
      priorTurns: [
        { role: 'user', text: 'how does inertia work?' },
        {
          role: 'assistant',
          text: 'Inertia is resistance to a change in motion.',
        },
      ],
    });
    expect(result.sources.map((source) => source.id)).toEqual(['inertia']);
    expect(result.sources.map((source) => source.id)).not.toContain('newton');
  });

  it('searches magnitude in Physics after magnitude → physics', async () => {
    search.mockResolvedValue({
      results: [
        hit({
          id: 'vector',
          questionText: 'Find the magnitude of the resultant of two vectors.',
          subject: 'Physics',
          topic: 'Vectors',
          score: 0.62,
        }),
      ],
    });
    const result = await service.answerWithHits({
      query: 'physics',
      priorTurns: [
        { role: 'user', text: 'magnitude' },
        {
          role: 'assistant',
          text: '“magnitude” is a study topic. Which subject is this for?',
        },
      ],
    });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Physics: What is magnitude?',
        subject: 'Physics',
      }),
    );
    expect(result.response.status).not.toBe('guidance');
    expect(result.response.sources.map((source) => source.id)).toEqual([
      'vector',
    ]);
    expect(result.understanding?.original).toBe('physics');
  });

  it('does not cite an exam cover that only scored well', async () => {
    search.mockResolvedValue({
      results: [
        hit({
          questionText:
            'GENERAL INSTRUCTIONS Office Use Only. Write your candidate number. Reading time 10 minutes. Writing time 3 hours.',
          score: 0.72,
        }),
      ],
    });
    const result = await service.answer({ query: 'explain black holes' });
    expect(search).toHaveBeenCalled();
    expect(result.sources).toEqual([]);
    expect(result.answer).not.toMatch(/candidate number/i);
  });
});

function hit(overrides: Partial<SearchHit>): SearchHit {
  return {
    id: 'cover',
    questionText: 'Question text',
    subject: 'Mathematics',
    topic: 'Instructions',
    subtopic: null,
    examYear: 2025,
    examType: 'board',
    difficulty: Difficulty.MEDIUM,
    questionType: QuestionType.SHORT,
    sourceDocument: 'maths.pdf',
    fileUrl: null,
    pageReference: '1',
    figureUrls: [],
    score: 0.72,
    ...overrides,
  };
}
