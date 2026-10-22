import { QueryUnderstandingService } from './query-understanding.service';

/**
 * Regression: maths → sin → cos theta must keep Mathematics context
 * and must not repeat the generic subject-selection prompt.
 */
describe('conversation context (maths → sin → cos theta)', () => {
  const service = new QueryUnderstandingService();
  const bank = ['Physics', 'Chemistry', 'Mathematics'];

  it('establishes Mathematics from maths', () => {
    const result = service.understand('maths', { bankSubjects: bank });
    expect(result.kind).toBe('subject_selection');
    expect(result.activeSubject).toBe('Mathematics');
    expect(result.guidanceMessage).toMatch(/Happy to help with Mathematics/i);
    expect(result.guidanceMessage).not.toMatch(
      /Which subject and topic \(or question\) should we start with/i,
    );
  });

  it('keeps Mathematics for a short topic like sin (no trig word list)', () => {
    const result = service.understand('sin', {
      bankSubjects: bank,
      priorTurns: [
        { role: 'user', text: 'maths' },
        {
          role: 'assistant',
          text: 'Happy to help with Mathematics.\n\nWhat would you like to focus on?',
        },
      ],
    });
    expect(result.activeSubject).toBe('Mathematics');
    expect(result.kind).toBe('clarification_needed');
    expect(result.needsClarification).toBe(true);
    expect(result.guidanceMessage).toMatch(/In Mathematics, what about “sin”/);
    expect(result.guidanceMessage).not.toMatch(
      /Which subject and topic \(or question\) should we start with/i,
    );
  });

  it('treats cos theta as a math expression under Mathematics', () => {
    const result = service.understand('cos theta', {
      bankSubjects: bank,
      priorTurns: [
        { role: 'user', text: 'maths' },
        {
          role: 'assistant',
          text: 'Happy to help with Mathematics.\n\nWhat would you like to focus on?',
        },
        { role: 'user', text: 'sin' },
        {
          role: 'assistant',
          text: 'In Mathematics, “sin” usually refers to the sine function.',
        },
      ],
    });
    expect(result.activeSubject).toBe('Mathematics');
    expect(result.intent).toBe('academic');
    expect(result.kind).toBe('concept_explanation');
    expect(result.corrected.toLowerCase()).toMatch(/cos|θ|theta/);
    expect(result.corrected).toMatch(/Mathematics/i);
  });

  it('searches explain cos theta within Mathematics context', () => {
    const result = service.understand('explain cos theta', {
      bankSubjects: bank,
      priorTurns: [
        { role: 'user', text: 'maths' },
        {
          role: 'assistant',
          text: 'Happy to help with Mathematics.',
        },
      ],
    });
    expect(result.intent).toBe('academic');
    expect(result.activeSubject).toBe('Mathematics');
  });

  it('resolves why? from prior assistant text', () => {
    const result = service.understand('why?', {
      bankSubjects: bank,
      priorTurns: [
        { role: 'user', text: 'maths' },
        {
          role: 'assistant',
          text: 'Happy to help with Mathematics.',
        },
        { role: 'user', text: 'explain cos theta' },
        {
          role: 'assistant',
          text: 'Cosine relates adjacent side to hypotenuse.',
        },
      ],
    });
    expect(result.kind).toBe('follow_up');
    expect(result.intent).toBe('academic');
    expect(result.corrected).toMatch(/Cosine relates adjacent/i);
  });

  it('still rejects gibberish without inventing a subject', () => {
    const result = service.understand('gydrxg', {
      bankSubjects: bank,
      priorTurns: [
        { role: 'user', text: 'maths' },
        {
          role: 'assistant',
          text: 'Happy to help with Mathematics.',
        },
      ],
    });
    expect(result.kind).toBe('unintelligible');
    expect(result.activeSubject).toBe('Mathematics');
  });

  it('greets without clearing the ability to start fresh', () => {
    const result = service.understand('hello', { bankSubjects: bank });
    expect(result.intent).toBe('greeting');
    expect(result.activeSubject).toBeNull();
  });

  it('does not inherit subject on a new chat with empty history', () => {
    const result = service.understand('sin', {
      bankSubjects: bank,
      priorTurns: [],
    });
    expect(result.activeSubject).toBeNull();
    // A topic waiting for a subject; the bank lookup decides next.
    expect(result.topic).toBe('sin');
    expect(result.guidanceMessage).not.toMatch(
      /Which subject and topic \(or question\) should we start with/i,
    );
  });

  it('handles a genuinely unrelated question without subject dump', () => {
    const result = service.understand('what is the capital of France?', {
      bankSubjects: bank,
      priorTurns: [
        { role: 'user', text: 'maths' },
        {
          role: 'assistant',
          text: 'Happy to help with Mathematics.',
        },
      ],
    });
    // Mid-chat, the model decision says out_of_scope (multi-turn.spec);
    // the rules only must not answer with a subject menu.
    expect(result.intent).toBe('academic');
    expect(result.guidanceMessage).toBeNull();
  });

  it('reloads subject from the metadata of our last reply, not its wording', () => {
    const result = service.understand('sin', {
      bankSubjects: bank,
      priorTurns: [
        {
          role: 'assistant',
          text: 'Sure — what would you like to focus on?',
          activeSubject: 'Mathematics',
        },
      ],
    });
    expect(result.activeSubject).toBe('Mathematics');
    expect(result.guidanceMessage).toMatch(/In Mathematics/);
  });

  it('ignores a reported subject that is not in the bank', () => {
    const result = service.understand('sin', {
      bankSubjects: bank,
      priorTurns: [
        { role: 'user', text: 'maths' },
        { role: 'assistant', text: 'OK', activeSubject: 'Astrology' },
      ],
    });
    expect(result.activeSubject).toBeNull();
  });

  it('treats a reported null subject as no subject', () => {
    const result = service.understand('sin', {
      bankSubjects: bank,
      priorTurns: [
        { role: 'user', text: 'maths' },
        { role: 'assistant', text: 'Hi!', activeSubject: null },
      ],
    });
    expect(result.activeSubject).toBeNull();
  });

  it('only knows subjects that are in the bank', () => {
    const result = service.understand('biology', { bankSubjects: bank });
    expect(result.kind).not.toBe('subject_selection');
    expect(result.activeSubject).toBeNull();
  });
});
