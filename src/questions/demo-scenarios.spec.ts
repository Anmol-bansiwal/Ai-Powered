import { QueryUnderstandingService } from './query-understanding.service';
import {
  classifyQueryIntent,
  clarifyIntentReply,
  looksLikeEducationalRequest,
  paperBrowseReply,
  quietGreeting,
  UNSUPPORTED_KNOWLEDGE,
  OUTSIDE_SCOPE,
} from './query-intent';

/**
 * Chat-quality scenarios for demo / evaluation — not cosine-score unit tests.
 */
describe('demo scenarios (real student phrasing)', () => {
  const service = new QueryUnderstandingService();
  const bank = ['Physics', 'Chemistry', 'Mathematics'];

  it('hello → maths → sin → cos theta → explain it keeps context', () => {
    const hello = service.understand('hello', { bankSubjects: bank });
    expect(hello.intent).toBe('greeting');
    expect(quietGreeting()).toMatch(/Hi!|studies|work on/i);
    expect(quietGreeting()).not.toMatch(/exam archive/i);

    const maths = service.understand('maths', { bankSubjects: bank });
    expect(maths.kind).toBe('subject_selection');
    expect(maths.activeSubject).toBe('Mathematics');

    const priorAfterMaths = [
      { role: 'user' as const, text: 'maths' },
      {
        role: 'assistant' as const,
        text: maths.guidanceMessage ?? 'Happy to help with Mathematics.',
      },
    ];
    const sin = service.understand('sin', {
      bankSubjects: bank,
      priorTurns: priorAfterMaths,
    });
    expect(sin.kind).toBe('clarification_needed');
    expect(sin.activeSubject).toBe('Mathematics');
    expect(sin.guidanceMessage).toMatch(/In Mathematics, what about “sin”/);

    const priorAfterSin = [
      ...priorAfterMaths,
      { role: 'user' as const, text: 'sin' },
      {
        role: 'assistant' as const,
        text: sin.guidanceMessage ?? 'In Mathematics, sin…',
      },
    ];
    const cos = service.understand('cos theta', {
      bankSubjects: bank,
      priorTurns: priorAfterSin,
    });
    expect(cos.intent).toBe('academic');
    expect(cos.activeSubject).toBe('Mathematics');
    expect(cos.kind).toBe('concept_explanation');

    const priorAfterCos = [
      ...priorAfterSin,
      { role: 'user' as const, text: 'cos theta' },
      {
        role: 'assistant' as const,
        text: 'Cosine relates adjacent side to hypotenuse.',
      },
    ];
    const explainIt = service.understand('explain it', {
      bankSubjects: bank,
      priorTurns: priorAfterCos,
    });
    expect(explainIt.kind).toBe('follow_up');
    expect(explainIt.intent).toBe('academic');
    expect(explainIt.corrected).toMatch(/Cosine relates adjacent/i);
  });

  it('new chat does not inherit Mathematics subject', () => {
    const result = service.understand('sin', {
      bankSubjects: bank,
      priorTurns: [],
    });
    expect(result.activeSubject).toBeNull();
    expect(result.topic).toBe('sin');
  });

  it('physcis → Physics subject selection', () => {
    const result = service.understand('physcis', { bankSubjects: bank });
    expect(result.kind).toBe('subject_selection');
    expect(result.activeSubject).toBe('Physics');
  });

  it('gydrxg is unintelligible without inventing meaning', () => {
    const result = service.understand('gydrxg', { bankSubjects: bank });
    expect(result.kind).toBe('unintelligible');
    expect(result.needsClarification).toBe(true);
  });

  it('paper asks clarify instead of OUTSIDE_SCOPE', () => {
    for (const query of [
      'give me the question paper of physics',
      'question paper of physics',
      '2 year',
    ]) {
      expect(classifyQueryIntent(query)).toBe('clarify');
      const understood = service.understand(query, { bankSubjects: bank });
      expect(understood.intent).toBe('clarify');
      expect(understood.guidanceMessage).toBeTruthy();
      expect(understood.guidanceMessage).not.toMatch(
        /couldn't find relevant study material/i,
      );
    }
  });

  it('sets Physics as activeSubject from a physics paper ask', () => {
    const understood = service.understand(
      'give me the question paper of physics',
      { bankSubjects: bank },
    );
    expect(understood.activeSubject).toBe('Physics');
  });

  it('keeps real physics questions academic for retrieval', () => {
    const query = 'what is inertia';
    expect(classifyQueryIntent(query)).toBe('academic');
    const understood = service.understand(query, { bankSubjects: bank });
    expect(understood.intent).toBe('academic');
    expect(understood.kind).toBe('concept_explanation');
  });

  it('keeps missing knowledge and unrelated replies distinct', () => {
    expect(looksLikeEducationalRequest('Explain photosynthesis')).toBe(true);
    expect(UNSUPPORTED_KNOWLEDGE).not.toEqual(OUTSIDE_SCOPE);
  });

  it('leaves an unrelated question to the model, not a word list', () => {
    // No list of celebrities or topics: the explain model declines it after
    // an empty search, and AnswersService replies OUTSIDE_SCOPE.
    const result = service.understand('Who wrote Hamlet?', {
      bankSubjects: bank,
    });
    expect(result.intent).toBe('academic');
    expect(result.guidanceMessage).toBeNull();
  });

  it('paperBrowseReply never invents a PDF download', () => {
    const text = paperBrowseReply(
      'give me the question paper of physics',
      bank,
    );
    expect(text).not.toMatch(/download|pdf|cloudinary/i);
    expect(text).toMatch(/Physics/i);
  });

  it('year-only asks clarify with filter guidance', () => {
    const understood = service.understand('2 year', { bankSubjects: bank });
    expect(understood.intent).toBe('clarify');
    expect(
      understood.guidanceMessage ?? clarifyIntentReply('2 year', bank),
    ).toMatch(/Year|Time period|subject|topic/i);
  });
});
