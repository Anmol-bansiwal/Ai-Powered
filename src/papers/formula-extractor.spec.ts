import { extractFormulaLatex, normalizeToLatex } from './formula-extractor';

describe('Formula Extractor & LaTeX Normalizer', () => {
  it('converts derivative and fraction notation to LaTeX', () => {
    const input = 'Solve dy/dx + 2y = 0';
    const latex = normalizeToLatex(input);
    expect(latex).toContain('\\frac{dy}{dx}');
  });

  it('converts Unicode Greek and math symbols', () => {
    const input = 'Calculate ΔH and θ when λ = 500 nm';
    const latex = normalizeToLatex(input);
    expect(latex).toContain('\\Delta');
    expect(latex).toContain('\\theta');
    expect(latex).toContain('\\lambda');
  });

  it('preserves existing ^{...} and _{...} exponents and subscripts', () => {
    const input = 'y = x^{2} + 10^{8} and H_{2}O';
    const latex = normalizeToLatex(input);
    expect(latex).toContain('x^{2}');
    expect(latex).toContain('10^{8}');
    expect(latex).toContain('H_{2}O');
  });

  it('extracts mathematical lines from multi-line question text', () => {
    const question = 'In a physics experiment:\nE = m * c^{2}\nFind the energy released.';
    const formulas = extractFormulaLatex(question);
    expect(formulas.length).toBeGreaterThan(0);
    expect(formulas[0]).toContain('c^{2}');
  });
});
