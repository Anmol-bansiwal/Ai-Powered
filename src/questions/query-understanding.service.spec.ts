import {
  QueryUnderstandingService,
  looksLikeGibberish,
  matchSubjectCatalogue,
} from './query-understanding.service';

describe('QueryUnderstandingService', () => {
  const service = new QueryUnderstandingService();
  const bank = ['Physics', 'Chemistry', 'Mathematics'];

  it('keeps the original greeting and does not treat how-questions as greetings', () => {
    const casual = service.understand('how are u???');
    expect(casual.original).toBe('how are u???');
    expect(casual.intent).toBe('greeting');
    expect(casual.kind).toBe('greeting');

    const study = service.understand('how does inertia work?');
    expect(study.original).toBe('how does inertia work?');
    expect(study.intent).toBe('academic');
    expect(study.kind).not.toBe('greeting');
  });

  it('keeps original text and greets loosely (hello / hii)', () => {
    const hello = service.understand('  hello  ');
    expect(hello.original).toBe('  hello  ');
    expect(hello.intent).toBe('greeting');
    expect(hello.kind).toBe('greeting');

    const hii = service.understand('hii');
    expect(hii.intent).toBe('greeting');
  });

  it('suggests Physics for incomplete "phy" without inventing certainty', () => {
    const result = service.understand('phy', { bankSubjects: bank });
    expect(result.original).toBe('phy');
    expect(result.intent).toBe('clarify');
    expect(result.kind).toBe('subject_suggestion');
    expect(result.needsClarification).toBe(true);
    expect(result.suggestedSubjects[0]).toBe('Physics');
    expect(result.guidanceMessage).toMatch(/Did you mean Physics/i);
    expect(result.guidanceMessage).toMatch(/Chemistry|Mathematics/i);
  });

  it('recognises physcis as Physics with high confidence', () => {
    const result = service.understand('physcis', { bankSubjects: bank });
    expect(result.corrected).toBe('Physics');
    expect(result.kind).toBe('subject_selection');
    expect(result.guidanceMessage).toMatch(/Happy to help with Physics/i);
  });

  it('does not map random gibberish to a subject', () => {
    expect(looksLikeGibberish('gydrxg')).toBe(true);
    const result = service.understand('gydrxg', { bankSubjects: bank });
    expect(result.kind).toBe('unintelligible');
    expect(result.needsClarification).toBe(true);
    expect(result.guidanceMessage).toMatch(/couldn'?t understand/i);
    expect(result.corrected.toLowerCase()).not.toBe('physics');
  });

  it('sends a misspelled topic to search as typed, without a phrase list', () => {
    const result = service.understand('explain newtons secnd law');
    expect(result.intent).toBe('academic');
    expect(result.kind).toBe('concept_explanation');
    expect(result.corrected).toBe('explain newtons secnd law');
    expect(result.corrections).toEqual([]);
  });

  it('preserves technical tokens', () => {
    const result = service.understand('what is 10√2 V and C6H5COOCOCH3');
    expect(result.corrected).toContain('10√2');
    expect(result.corrected).toContain('C6H5COOCOCH3');
    expect(result.intent).toBe('academic');
  });

  it('asks when follow-up has no prior context', () => {
    const result = service.understand('why?');
    expect(result.kind).toBe('follow_up');
    expect(result.needsClarification).toBe(true);
  });

  it('uses prior assistant text for follow-ups', () => {
    const result = service.understand('explain again', {
      priorTurns: [
        { role: 'user', text: 'what is inertia' },
        {
          role: 'assistant',
          text: 'Inertia is resistance to change of motion.',
        },
      ],
    });
    expect(result.intent).toBe('academic');
    expect(result.kind).toBe('follow_up');
    expect(result.corrected).toMatch(/Inertia is resistance/i);
  });

  it('clarifies ambiguous lone topics like mass without guessing a subject', () => {
    const result = service.understand('mass');
    expect(result.kind).toBe('clarification_needed');
    expect(result.needsClarification).toBe(true);
    expect(result.activeSubject).toBeNull();
    expect(result.guidanceMessage).toMatch(/which subject/i);
    expect(result.guidanceMessage).not.toMatch(/Mathematics/i);
    expect(result.guidanceMessage).not.toMatch(/exam archive/i);
  });

  it('searches a compound question instead of rejecting it for "and"', () => {
    for (const query of [
      'What is inflation and how does it affect consumers?',
      'explain inertia and solve this equation',
    ]) {
      const result = service.understand(query, {
        bankSubjects: ['Physics', 'Chemistry', 'Mathematics'],
      });
      expect(result.intent).toBe('academic');
      expect(result.needsClarification).toBe(false);
    }
  });

  it('handles empty / punctuation-only input', () => {
    const empty = service.understand('   ');
    expect(empty.kind).toBe('empty');
    const punct = service.understand('???');
    expect(punct.kind).toBe('empty');
  });
});

describe('matchSubjectCatalogue', () => {
  it('ranks Physics for phy via prefix confidence', () => {
    const hits = matchSubjectCatalogue('phy', ['Physics', 'Chemistry']);
    expect(hits[0]?.label).toBe('Physics');
    expect(hits[0]?.kind).toBe('prefix');
    expect(hits[0]?.confidence).toBeGreaterThan(0.5);
    expect(hits[0]?.confidence).toBeLessThan(0.9);
  });
});
