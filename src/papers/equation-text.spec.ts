import { assemblePageLayout, assemblePageText, TextRun } from './equation-text';

function run(
  str: string,
  fontSize: number,
  y: number,
  hasEOL = false,
): TextRun {
  return { str, x: 0, y, fontSize, hasEOL };
}

describe('equation text', () => {
  it('writes a raised power instead of gluing it to 10', () => {
    const text = assemblePageText([
      run('at the rate of 10', 12, 240),
      run('8', 8.04, 244.5),
      run(' V/s', 12, 240, true),
    ]);

    expect(text).toBe('at the rate of 10^{8} V/s\n');
  });

  it('writes a power that is separated from its base by a space', () => {
    const text = assemblePageText([
      run('source of 1.6 x 10', 12, 145.82),
      run(' ', 12, 145.82),
      run('15', 8.04, 150.38),
      run(' Hz', 12, 145.82, true),
    ]);

    expect(text).toBe('source of 1.6 x 10^{15} Hz\n');
  });

  it('keeps a normal 10 on the same baseline', () => {
    const text = assemblePageText([
      run('(A) 10 V', 12, 108.26),
      run(' (B) 20 V', 12, 108.26, true),
    ]);

    expect(text).toBe('(A) 10 V (B) 20 V\n');
  });

  it('writes a signed exponent and a lowered index', () => {
    const text = assemblePageText([
      run('9.1 x10', 12, 243.53),
      run('-31', 8.04, 248.09),
      run(' and r', 12, 243.53),
      run('1', 8.04, 239.5, true),
    ]);

    expect(text).toBe('9.1 x10^{-31} and r_{1}\n');
  });

  it('keeps line boxes aligned with the assembled text', () => {
    const items = [
      run('10', 12, 240),
      run('8', 8.04, 244.5),
      run(' V/s', 12, 240, true),
      run('next line', 12, 200, true),
    ];
    const layout = assemblePageLayout(items);

    expect(layout.text).toBe(assemblePageText(items));
    expect(layout.lines.map((line) => line.text)).toEqual(
      layout.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    );
    expect(layout.lines[0].text).toBe('10^{8} V/s');
    expect(layout.lines[0].top).toBeGreaterThan(layout.lines[1].top);
  });
});
