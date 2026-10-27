/**
 * Mathematical formula extraction and LaTeX normalization.
 * Extracts expressions containing superscripts, subscripts, fractions,
 * and mathematical operators into additive LaTeX strings.
 */

// Common Greek letters mapping
const GREEK_MAP: Record<string, string> = {
  'α': '\\alpha',
  'β': '\\beta',
  'γ': '\\gamma',
  'δ': '\\delta',
  'ε': '\\epsilon',
  'θ': '\\theta',
  'λ': '\\lambda',
  'μ': '\\mu',
  'π': '\\pi',
  'σ': '\\sigma',
  'τ': '\\tau',
  'φ': '\\phi',
  'ω': '\\omega',
  'Δ': '\\Delta',
  'Ω': '\\Omega',
  '∑': '\\sum',
  '∫': '\\int',
  '√': '\\sqrt',
  '±': '\\pm',
  '×': '\\times',
  '÷': '\\div',
  '≤': '\\le',
  '≥': '\\ge',
  '≠': '\\ne',
  '≈': '\\approx',
  '∞': '\\infty',
  '→': '\\to',
};

/**
 * Extracts and converts recognized math expressions from text into clean LaTeX.
 */
export function extractFormulaLatex(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const formulas: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Check if line contains mathematical elements (exponents, indices, equations, derivatives)
    if (
      /\^\{|\_\{|[=<>±×÷∫∑√≤≥≠≈∞→]|\b(?:dy\/dx|d\^2y\/dx\^2|sin|cos|tan|log|ln|exp)\b/.test(
        trimmed,
      )
    ) {
      const normalized = normalizeToLatex(trimmed);
      if (normalized && !formulas.includes(normalized)) {
        formulas.push(normalized);
      }
    }
  }

  return formulas;
}

/**
 * Normalizes a text equation with ^{...} and _{...} into standard LaTeX format.
 */
export function normalizeToLatex(expression: string): string {
  let result = expression;

  // 1. Replace Unicode math and Greek symbols
  for (const [symbol, latex] of Object.entries(GREEK_MAP)) {
    result = result.replaceAll(symbol, ` ${latex} `);
  }

  // 2. Normalize derivatives like d^2y/dx^2 and dy/dx into \frac{d^2y}{dx^2}
  result = result.replace(
    /\bd\^(\d+)y\/dx\^\1\b/g,
    '\\frac{d^{$1}y}{dx^{$1}}',
  );
  result = result.replace(/\bdy\/dx\b/g, '\\frac{dy}{dx}');

  // 3. Normalize simple inline division fractions like (a + b)/(c + d)
  result = result.replace(
    /\(([^)]+)\)\s*\/\s*\(([^)]+)\)/g,
    '\\frac{$1}{$2}',
  );

  // 4. Ensure sqrt has braces: \sqrt x -> \sqrt{x}
  result = result.replace(/\\sqrt\s*([a-zA-Z0-9]+)/g, '\\sqrt{$1}');

  // 5. Clean up redundant spaces
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}
