const ANSWER_MARKS = /^[._…·]+$/;
const MIN_ANSWER_MARKS = 5;

/**
 * Drops the printed answer-writing space ("........", "_______") that PDF
 * extraction keeps as text. Only whole lines made of these marks go: dots
 * inside a line can be a fill-in blank and are kept. The stored text is not
 * changed; this is applied when questions are read for students.
 */
export function withoutAnswerLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const marks = line.replace(/\s+/g, '');
      return !(marks.length >= MIN_ANSWER_MARKS && ANSWER_MARKS.test(marks));
    })
    .join('\n');
}
