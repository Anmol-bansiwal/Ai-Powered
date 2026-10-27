import { extractExplicitMarks } from './marks-extractor';

describe('extractExplicitMarks', () => {
  it('extracts bracketed marks like [4 marks]', () => {
    const result = extractExplicitMarks('Calculate the acceleration of the particle. [4 marks]');
    expect(result).toEqual({ marks: 4, explicit: true });
  });

  it('extracts parenthesis marks like (3 marks)', () => {
    const result = extractExplicitMarks('Define enthalpy of formation. (3 marks)');
    expect(result).toEqual({ marks: 3, explicit: true });
  });

  it('extracts trailing bracketed score like [5]', () => {
    const result = extractExplicitMarks('Solve the differential equation dy/dx + y = e^x\n[5]');
    expect(result).toEqual({ marks: 5, explicit: true });
  });

  it('extracts "Marks: 2"', () => {
    const result = extractExplicitMarks('Marks: 2\nExplain Hooke\'s law.');
    expect(result).toEqual({ marks: 2, explicit: true });
  });

  it('returns null when no marks are indicated', () => {
    const result = extractExplicitMarks('Find the derivative of f(x) = sin(x^2).');
    expect(result).toEqual({ marks: null, explicit: false });
  });
});
