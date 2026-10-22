import { namedSubject } from './query-intent';
import { QueryUnderstandingService } from './query-understanding.service';

describe('subject resolution regressions', () => {
  const service = new QueryUnderstandingService();
  const bank = ['Physics', 'Chemistry', 'Mathematics'];
  const physicsTurns = [
    { role: 'user' as const, text: 'physics' },
    {
      role: 'assistant' as const,
      text: 'Happy to help with Physics.',
    },
  ];

  it('does not fuzzy-match mass to Mathematics', () => {
    expect(namedSubject('tell me about the mass', bank)).toBeNull();
    expect(namedSubject('mass', bank)).toBeNull();
    expect(namedSubject('physcis', bank)).toBe('Physics');
  });

  it('phy with no subject asks if they mean Physics', () => {
    const result = service.understand('phy', { bankSubjects: bank });
    expect(result.kind).toBe('subject_suggestion');
    expect(result.guidanceMessage).toMatch(/Did you mean Physics/i);
    expect(result.intent).toBe('clarify');
  });

  it('phy after Physics is still a subject prefix, not a topic', () => {
    const result = service.understand('phy', {
      bankSubjects: bank,
      priorTurns: physicsTurns,
    });
    expect(result.kind).toBe('subject_suggestion');
    expect(result.guidanceMessage).toMatch(/Did you mean Physics/i);
    expect(result.guidanceMessage).not.toMatch(/what about/i);
  });

  it('tell me about the mass does not assume Mathematics', () => {
    const result = service.understand('tell me about the mass', {
      bankSubjects: bank,
    });
    expect(result.activeSubject).not.toBe('Mathematics');
    expect(result.corrected).not.toMatch(/^Mathematics:/);
    expect(result.intent).toBe('academic');
  });

  it('tell me about the mass keeps Physics when that is the chat subject', () => {
    const result = service.understand('tell me about the mass', {
      bankSubjects: bank,
      priorTurns: physicsTurns,
    });
    expect(result.activeSubject).toBe('Physics');
    expect(result.corrected).toMatch(/^Physics:/);
    expect(result.intent).toBe('academic');
  });

  it('mass in phy resolves Physics, not Mathematics', () => {
    const result = service.understand('mass in phy', { bankSubjects: bank });
    expect(result.activeSubject).toBe('Physics');
    expect(result.activeSubject).not.toBe('Mathematics');
    expect(result.kind).not.toBe('subject_selection');
    expect(result.guidanceMessage ?? result.corrected).toMatch(/mass/i);
    expect(result.guidanceMessage ?? '').not.toMatch(
      /Happy to help with Mathematics/i,
    );
  });

  it('change to maths switches subject', () => {
    const result = service.understand('change to maths', {
      bankSubjects: bank,
      priorTurns: physicsTurns,
    });
    expect(result.kind).toBe('subject_selection');
    expect(result.activeSubject).toBe('Mathematics');
  });

  it('mass in maths overrides a previous Physics subject', () => {
    const result = service.understand('mass in maths', {
      bankSubjects: bank,
      priorTurns: physicsTurns,
    });
    expect(result.activeSubject).toBe('Mathematics');
    expect(result.guidanceMessage).toMatch(/mass/i);
  });

  it('what about it uses the previous answer', () => {
    const result = service.understand('what about it?', {
      bankSubjects: bank,
      priorTurns: [
        ...physicsTurns,
        { role: 'user', text: 'tell me about the mass' },
        {
          role: 'assistant',
          text: 'Mass is the amount of matter in an object.',
        },
      ],
    });
    expect(result.kind).toBe('follow_up');
    expect(result.intent).toBe('academic');
    expect(result.corrected).toMatch(/amount of matter/i);
    expect(result.activeSubject).toBe('Physics');
  });

  it('phy maths asks which subject', () => {
    const result = service.understand('phy maths', { bankSubjects: bank });
    expect(result.kind).toBe('clarification_needed');
    expect(result.guidanceMessage).toMatch(/which one/i);
    expect(result.activeSubject).toBeNull();
  });

  it('how are you stays a greeting even if Mathematics is already selected', () => {
    const result = service.understand('how are you', {
      bankSubjects: bank,
      priorTurns: [
        { role: 'user', text: 'maths' },
        { role: 'assistant', text: 'Happy to help with Mathematics.' },
      ],
      filterSubject: 'Mathematics',
    });
    expect(result.intent).toBe('greeting');
    expect(result.corrected).not.toMatch(/Mathematics:/);
  });

  it('gydrxg does not invent a subject', () => {
    const result = service.understand('gydrxg', { bankSubjects: bank });
    expect(result.kind).toBe('unintelligible');
    expect(result.intent).toBe('clarify');
  });
});
