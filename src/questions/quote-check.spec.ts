import {
  asksForAnswer,
  assessQuotes,
  CitedSource,
  INSUFFICIENT_ANSWER,
  isQuestionMaterial,
  isRelevantEvidence,
  isRelevantToQuery,
  locateQuote,
  selectRelevantSources,
  verifiedQuote,
} from './quote-check';

const source = {
  id: 'q-light',
  questionText:
    'The speed of light in vacuum is 3.0 × 10^{8} m/s according to this paper.',
  pageReference: '4',
  score: 0.72,
};

function cited(id: string, questionText: string): CitedSource {
  return { id, questionText, pageReference: '1', score: 0.8 };
}

function questionMaterial(text: string, quote: string): boolean {
  const located = locateQuote(text, quote);
  if (!located) {
    throw new Error('quote not found');
  }
  return isQuestionMaterial(text, located);
}

describe('quote check', () => {
  it('accepts an exact quote and returns the source wording', () => {
    expect(
      verifiedQuote(
        source.questionText,
        'The speed of light in vacuum is 3.0 × 10^{8} m/s',
      ),
    ).toBe('The speed of light in vacuum is 3.0 × 10^{8} m/s');
  });

  it('rejects a claim that is not in the source', () => {
    expect(
      verifiedQuote(
        "State Newton's second law of motion.",
        "Newton's second law is F = ma.",
      ),
    ).toBeNull();
  });

  it('rejects a quote that is too short to be evidence', () => {
    expect(verifiedQuote(source.questionText, 'speed of light')).toBeNull();
  });

  it('rejects a quote when the stored question text is missing', () => {
    expect(
      verifiedQuote('', 'The speed of light in vacuum is 3.0 × 10^{8} m/s'),
    ).toBeNull();
  });

  it('rejects a quote that adds words beyond the stored text', () => {
    expect(
      verifiedQuote(
        source.questionText,
        'The speed of light in vacuum is 3.0 × 10^{8} m/s and never changes',
      ),
    ).toBeNull();
  });

  it('returns the verified quote when it directly answers the request', () => {
    const decision = assessQuotes(
      {
        complete: true,
        quotes: [
          {
            id: source.id,
            quote: 'The speed of light in vacuum is 3.0 × 10^{8} m/s',
            kind: 'answer',
            pageNumber: '999',
          } as { id: string; quote: string; kind: 'answer' },
        ],
      },
      [source],
    );

    expect(decision).toEqual({
      status: 'answered',
      answer: 'The speed of light in vacuum is 3.0 × 10^{8} m/s',
      sources: [source],
    });
    expect(decision.sources[0].pageReference).toBe('4');
  });

  it('drops an unsupported claim instead of answering with it', () => {
    const decision = assessQuotes(
      {
        complete: true,
        quotes: [
          {
            id: 'newton',
            quote: "Newton's second law states that F = ma.",
            kind: 'answer',
          },
        ],
      },
      [
        {
          id: 'newton',
          questionText: "State Newton's second law of motion.",
          pageReference: '96',
          score: 0.81,
        },
      ],
    );

    expect(decision.status).toBe('insufficient');
    expect(decision.answer).not.toContain('F = ma');
    expect(decision.sources[0].pageReference).toBe('96');
  });

  it('treats a partial quote as insufficient', () => {
    const decision = assessQuotes(
      {
        complete: false,
        quotes: [
          {
            id: source.id,
            quote: 'The speed of light in vacuum is 3.0 × 10^{8} m/s',
            kind: 'answer',
          },
        ],
      },
      [source],
    );

    expect(decision.status).toBe('insufficient');
    expect(decision.answer).not.toContain('speed of light');
    expect(decision.sources).toEqual([source]);
  });

  it('ignores a source id that was not retrieved', () => {
    const decision = assessQuotes(
      {
        complete: true,
        quotes: [
          {
            id: 'missing',
            quote: 'The speed of light in vacuum is 3.0 × 10^{8} m/s',
            kind: 'answer',
          },
        ],
      },
      [source],
    );

    expect(decision.status).toBe('insufficient');
    expect(decision.answer).not.toContain('speed of light');
    expect(decision.sources.map((item) => item.id)).toEqual(['q-light']);
  });
});

describe('question stems are never shown as answers', () => {
  const newton = cited('newton', "State Newton's second law of motion.");
  const platinum = cited(
    'platinum',
    'Q17. A platinum surface having work function 5.63 eV is illuminated by a monochromatic source of 1.6\nx 10^{15} Hz. What will be the minimum wavelength associated with the ejected electron.',
  );
  const inertia = cited(
    'inertia',
    '2. Define inertia as the tendency of a body to resist a change in its state of motion.',
  );

  it('keeps Newton insufficient even when the model quotes the stem as an answer', () => {
    const decision = assessQuotes(
      {
        complete: true,
        quotes: [
          {
            id: 'newton',
            quote: "State Newton's second law of motion",
            kind: 'answer',
          },
        ],
      },
      [newton],
    );

    expect(decision).toEqual({
      status: 'insufficient',
      answer: INSUFFICIENT_ANSWER,
      sources: [newton],
    });
  });

  it('never returns the full platinum question stem as its answer', () => {
    const decision = assessQuotes(
      {
        complete: true,
        quotes: [
          {
            id: 'platinum',
            quote: platinum.questionText.replace('Q17. ', ''),
            kind: 'answer',
          },
        ],
      },
      [platinum],
    );

    expect(decision.status).toBe('insufficient');
    expect(decision.answer).toBe(INSUFFICIENT_ANSWER);
  });

  // Policy: an instruction such as "Define X as Y" is an exam question, not
  // an answer key. The reply is "insufficient" with the question listed as
  // related; the caller may add a separately labelled AI explanation.
  it('treats the "Define inertia as ..." instruction as a question, not an answer', () => {
    const decision = assessQuotes(
      {
        complete: true,
        quotes: [
          {
            id: 'inertia',
            quote:
              'Define inertia as the tendency of a body to resist a change in its state of motion',
            kind: 'answer',
          },
        ],
      },
      [inertia],
    );

    expect(decision.status).toBe('insufficient');
    expect(decision.sources).toEqual([inertia]);
  });

  it('still answers from a genuine answer-key passage', () => {
    const key = cited(
      'key',
      'Ans. Inertia is the tendency of a body to resist any change in its state of rest or of uniform motion. Mass is a measure of inertia.',
    );
    const decision = assessQuotes(
      {
        complete: true,
        quotes: [
          {
            id: 'key',
            quote:
              'Inertia is the tendency of a body to resist any change in its state of rest or of uniform motion.',
            kind: 'answer',
          },
        ],
      },
      [key],
    );

    expect(decision).toEqual({
      status: 'answered',
      answer:
        'Inertia is the tendency of a body to resist any change in its state of rest or of uniform motion.',
      sources: [key],
    });
  });

  it('accepts given data stated before the task in the same question', () => {
    const given = cited(
      'given',
      'The speed of light in vacuum is 3.0 × 10^{8} m/s. Calculate the time light takes to cross 3 km.',
    );
    const decision = assessQuotes(
      {
        complete: true,
        quotes: [
          {
            id: 'given',
            quote: 'The speed of light in vacuum is 3.0 × 10^{8} m/s',
            kind: 'answer',
          },
        ],
      },
      [given],
    );

    expect(decision.status).toBe('answered');
  });

  it('rejects a quote the model itself labels as question wording', () => {
    const decision = assessQuotes(
      {
        complete: true,
        quotes: [
          {
            id: source.id,
            quote: 'The speed of light in vacuum is 3.0 × 10^{8} m/s',
            kind: 'question',
          },
        ],
      },
      [source],
    );

    expect(decision.status).toBe('insufficient');
  });

  it('rejects a quote with no label', () => {
    const decision = assessQuotes(
      {
        complete: true,
        quotes: [
          {
            id: source.id,
            quote: 'The speed of light in vacuum is 3.0 × 10^{8} m/s',
          },
        ],
      },
      [source],
    );

    expect(decision.status).toBe('insufficient');
  });

  it('answers with the accepted quote and drops a rejected one', () => {
    const decision = assessQuotes(
      {
        complete: true,
        quotes: [
          {
            id: 'newton',
            quote: "State Newton's second law of motion",
            kind: 'answer',
          },
          {
            id: source.id,
            quote: 'The speed of light in vacuum is 3.0 × 10^{8} m/s',
            kind: 'answer',
          },
        ],
      },
      [newton, source],
    );

    expect(decision.status).toBe('answered');
    expect(decision.answer).toBe(
      'The speed of light in vacuum is 3.0 × 10^{8} m/s',
    );
    expect(decision.sources.map((item) => item.id)).toEqual(['q-light']);
  });
});

describe('isQuestionMaterial', () => {
  it('flags a quote that runs from given data into the task', () => {
    const text =
      'The speed of light is 3.0 × 10^{8} m/s. Calculate the time light takes to cross 3 km.';
    expect(
      questionMaterial(text, 'is 3.0 × 10^{8} m/s. Calculate the time light'),
    ).toBe(true);
  });

  it('flags MCQ options and assertion-reason claims', () => {
    const mcq =
      'Q4. The diffraction effect can be observed in\n(A) sound waves only\n(B) light waves and sound waves both';
    expect(questionMaterial(mcq, '(B) light waves and sound waves both')).toBe(
      true,
    );
    expect(questionMaterial(mcq, 'light waves and sound waves both')).toBe(
      true,
    );

    const assertion =
      '15 Assertion (A) Glucose does not form the hydrogensulphite addition product.\nReason (R) Glucose exists in a cyclic form.';
    expect(
      questionMaterial(
        assertion,
        'Glucose does not form the hydrogensulphite addition product',
      ),
    ).toBe(true);
  });

  it('does not split a sentence at a question number or decimal point', () => {
    const text = 'Q17. A platinum surface has work function 5.63 eV.';
    expect(
      questionMaterial(text, 'A platinum surface has work function 5.63 eV'),
    ).toBe(false);
  });
});

describe('asksForAnswer', () => {
  it.each([
    '2. Define inertia as the tendency of a body to resist motion.',
    'Q17. What will be the minimum wavelength.',
    'Is the reaction exothermic?',
    '(a) Write the formula.',
    'iv) 4 Ω',
    'OR Derive the lens formula.',
    'Calculate the work done.',
  ])('treats %p as question wording', (sentence) => {
    expect(asksForAnswer(sentence)).toBe(true);
  });

  it.each([
    'Inertia is the tendency of a body to resist a change in its state of motion.',
    'A platinum surface has work function 5.63 eV.',
    'Ans.',
    '3 moles of an ideal gas occupy 67.2 L at STP.',
  ])('treats %p as statement wording', (sentence) => {
    expect(asksForAnswer(sentence)).toBe(false);
  });
});

describe('isRelevantToQuery', () => {
  it('rejects an exam cover that only shares administrative words', () => {
    expect(
      isRelevantToQuery(
        'explain black holes',
        'GENERAL INSTRUCTIONS Office Use Only. Candidate number. Reading time 10 minutes. Writing time 3 hours.',
      ),
    ).toBe(false);
  });

  it('accepts a question that names the asked topic', () => {
    expect(
      isRelevantToQuery(
        'explain inertia',
        'Define inertia as the tendency of a body to resist a change in its state of motion.',
      ),
    ).toBe(true);
  });

  it('does not treat shared motion as enough for an inertia ask', () => {
    expect(
      isRelevantToQuery(
        'Inertia is resistance to a change in motion.',
        "State Newton's second law of motion.",
      ),
    ).toBe(false);
  });
});

describe('selectRelevantSources', () => {
  const inertia = {
    id: 'inertia',
    questionText:
      'Define inertia as the tendency of a body to resist a change in its state of motion.',
  };
  const newton = {
    id: 'newton',
    questionText: "State Newton's second law of motion.",
  };

  it('keeps inertia and drops Newton after an explain-it follow-up', () => {
    const kept = selectRelevantSources(
      'explain it',
      'Please explain further based on this: Inertia is resistance to a change in motion.',
      [inertia, newton],
    );
    expect(kept.map((source) => source.id)).toEqual(['inertia']);
  });

  it('returns no sources for a cover page after black holes', () => {
    expect(
      selectRelevantSources('explain black holes', 'explain black holes', [
        {
          id: 'cover',
          questionText:
            'GENERAL INSTRUCTIONS. Candidate number. Reading time 10 minutes.',
        },
      ]),
    ).toEqual([]);
  });
});

describe('isRelevantEvidence', () => {
  it('uses the prior topic after explain it', () => {
    expect(
      isRelevantEvidence(
        'explain it',
        'Please explain further based on this: Inertia is resistance to a change in motion.',
        'Define inertia as the tendency of a body to resist a change in its state of motion.',
      ),
    ).toBe(true);
  });
});
