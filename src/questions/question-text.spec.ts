import { withoutAnswerLines } from './question-text';

describe('withoutAnswerLines', () => {
  it('drops the printed answer-writing lines of an exam question', () => {
    const stored = [
      'In the flock, 15 of the male sheep each weigh more than x kg.',
      'Find the value of x.',
      '..........................................................................................',
      '..........................................................................................',
      '(b) The weights of the female sheep are also normally distributed.',
      '  ________________________  ',
      '……………………',
    ].join('\n');

    expect(withoutAnswerLines(stored)).toBe(
      [
        'In the flock, 15 of the male sheep each weigh more than x kg.',
        'Find the value of x.',
        '(b) The weights of the female sheep are also normally distributed.',
      ].join('\n'),
    );
  });

  it('keeps dots that are part of a line, such as a fill-in blank', () => {
    const stored = 'Force = .......... × acceleration\n1, 2, 3, ...\n...';
    expect(withoutAnswerLines(stored)).toBe(stored);
  });

  it('keeps ordinary text unchanged', () => {
    expect(withoutAnswerLines('State Newton’s second law.')).toBe(
      'State Newton’s second law.',
    );
  });
});
