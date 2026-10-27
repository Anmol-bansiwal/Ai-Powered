/**
 * Deterministic marks extraction from exam question text and headings.
 * Identifies explicit marks notations such as "[4 marks]", "(3 marks)", "[5]", etc.
 */

const MARKS_PATTERNS: RegExp[] = [
  // [4 marks] or (4 marks) or [4 mark] or (4 mark)
  /[\[\(]\s*(\d{1,2})\s*marks?\s*[\]\)]/i,
  // 4 marks at the end of text or before newline
  /\b(\d{1,2})\s*marks?\s*(?:$|\n)/i,
  // [3] or (3) at the end of a question line or statement
  /(?:^|\s)[\[\(]\s*(\d{1,2})\s*[\]\)]\s*$/m,
  // Score: 5 or Max Marks: 5
  /(?:marks?|score|points?)\s*[:=-]\s*(\d{1,2})\b/i,
];

export type ExtractedMarks = {
  marks: number | null;
  explicit: boolean;
};

export function extractExplicitMarks(text: string): ExtractedMarks {
  if (!text || typeof text !== 'string') {
    return { marks: null, explicit: false };
  }

  for (const pattern of MARKS_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isInteger(parsed) && parsed > 0 && parsed <= 100) {
        return { marks: parsed, explicit: true };
      }
    }
  }

  return { marks: null, explicit: false };
}
