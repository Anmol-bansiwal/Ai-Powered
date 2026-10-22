import {
  extractTechnicalTokens,
  preservesTechnicalTokens,
} from './query-rewrite';

describe('query rewrite token checks', () => {
  it('extracts numbers, units, scripted formulas and negations', () => {
    expect(
      extractTechnicalTokens(
        'not CH_{3}COOH with 10 volt and 1.5 cm, never F = ma',
      ),
    ).toEqual({
      numbers: ['10', '1.5'],
      units: ['V', 'cm'],
      formulas: ['CH_{3}COOH'],
      negations: ['not', 'never'],
    });
  });

  it('allows spoken units to become symbols without changing the quantity', () => {
    expect(
      preservesTechnicalTokens(
        'that LCR one where 10 volt is across each',
        'series LCR circuit with 10 V across each element',
      ),
    ).toBe(true);
  });

  it('rejects a rewrite that changes a number or unit quantity', () => {
    expect(
      preservesTechnicalTokens('10 volt across each', '10 Ω across each'),
    ).toBe(false);
    expect(
      preservesTechnicalTokens(
        'glass sphere of radius 6 cm',
        'glass sphere of radius 8 cm',
      ),
    ).toBe(false);
  });

  it('rejects a rewrite that drops a negation or formula', () => {
    expect(
      preservesTechnicalTokens(
        'glucose does not form the product',
        'glucose forms the product',
      ),
    ).toBe(false);
    expect(
      preservesTechnicalTokens('NH_{2}OH reaction', 'hydroxylamine reaction'),
    ).toBe(false);
  });
});
