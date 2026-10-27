export type DraftQuestion = {
  questionText: string;
  pageReference: string;
};

export type QuestionRegion = {
  page: number;
  top: number;
  bottom: number;
};

export type QuestionLayout = DraftQuestion & {
  pages: number[];
  regions: QuestionRegion[];
};

export type PdfPageInput = {
  pageNumber: number;
  text: string;
  lines?: Array<{ text: string; top: number; bottom: number }>;
};

// Question starts only. Subparts such as (a), (b), (i), and (ii) stay with
// the parent, including when they continue on the next page. Regions record
// where that text sits so a later step can place an extracted figure. This
// step does not interpret the figure.
const QUESTION_START =
  /^(?:question\.?\s+\d+\b|q\.?\s*\d+\b|\d{1,3}[.)]\s+\S)/i;
const SHARED_OPTIONS_START = /^for questions\s+(\d+)\s+to\s+(\d+)\b/i;
const SECTION_BANNER = /^\[SECTION\b/i;

// Some papers print "5 The initial..." with no period. Those numbers are only
// trusted when no line in the paper uses a numbered-with-period start, and
// only when the number is the next one expected, so a wrapped line such as
// "1 mole of methyl chloride" stays with its question. A number alone on a
// line starts a question unless it is the last line on the page (a footer).
const BARE_START = /^(\d{1,3})(?:\s+\S.*)?$/;
const SECTION_HEADING = /^SECTION\s*[-–]?\s*[A-E]$/i;
const MARKS_ONLY = /^(?:\d{1,2}|½|\d\s*½|(?:\d|½)(?:\s*\+\s*(?:\d|½))+)$/;
const UNMAPPED_GLYPH = String.fromCharCode(0);
const BOILERPLATE_LINE =
  /^(?:office use only|do not write in this area|\d{8,12}|blank page|–\s*\d+\s*–|nsw education standards authority|\(?continued\)?|question\s+\d+\s+continues)/i;

type SourceLine = {
  text: string;
  page: number;
  top?: number;
  bottom?: number;
  rubric?: boolean;
};

type OpenQuestion = {
  lines: SourceLine[];
  pageReference: string;
};

export function splitPagesIntoQuestions(
  pages: PdfPageInput[],
): DraftQuestion[] {
  return splitPagesWithLayout(pages).map(({ questionText, pageReference }) => ({
    questionText,
    pageReference,
  }));
}

export function splitPagesWithLayout(pages: PdfPageInput[]): QuestionLayout[] {
  const questions: QuestionLayout[] = [];
  let current: OpenQuestion | null = null;
  let sharedOptions: SourceLine[] = [];
  let sharedFrom = 0;
  let sharedTo = 0;
  let collectingSharedOptions = false;
  const bareNumbers = usesBareNumbers(pages);
  let lastNumber = 0;
  let skippingRubric = false;

  const flush = () => {
    if (!current) {
      return;
    }
    const questionText = current.lines
      .map((line) => line.text)
      .join('\n')
      .trim();
    if (questionText.length > 0) {
      const body = current.lines.filter((line) => !line.rubric);
      questions.push({
        questionText,
        pageReference: current.pageReference,
        pages: [...new Set(body.map((line) => line.page))],
        regions: regionsFrom(body),
      });
    }
    current = null;
  };

  for (const page of pages) {
    const lines = pageLines(page);
    if (lines.length === 0) {
      continue;
    }

    if (bareNumbers) {
      lines.forEach((line, index) =>
        absorbBareLine(line, index === lines.length - 1),
      );
      continue;
    }

    if (!lines.some((line) => isQuestionStart(line.text))) {
      if (!current && isInstructionPage(lines)) {
        continue;
      }
      if (!current) {
        current = {
          lines: lines.filter((line) => !SECTION_BANNER.test(line.text)),
          pageReference: String(page.pageNumber),
        };
        flush();
        continue;
      }
    }

    for (const line of lines) {
      absorbLine(line);
    }
  }

  flush();
  return questions;

  function absorbLine(line: SourceLine): void {
    if (SECTION_BANNER.test(line.text)) {
      return;
    }

    const shared = SHARED_OPTIONS_START.exec(line.text);
    if (shared) {
      sharedOptions = [{ ...line, rubric: true }];
      sharedFrom = Number(shared[1]);
      sharedTo = Number(shared[2]);
      collectingSharedOptions = true;
      return;
    }

    if (collectingSharedOptions && !isQuestionStart(line.text)) {
      sharedOptions.push({ ...line, rubric: true });
      return;
    }

    if (isQuestionStart(line.text)) {
      flush();
      collectingSharedOptions = false;
      const number = questionNumber(line.text);
      const inRange =
        sharedOptions.length > 0 &&
        number !== null &&
        number >= sharedFrom &&
        number <= sharedTo;
      if (!inRange) {
        sharedOptions = [];
      }
      current = {
        lines: inRange ? [...sharedOptions, line] : [line],
        pageReference: String(line.page),
      };
      return;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  function absorbBareLine(line: SourceLine, lastOnPage: boolean): void {
    if (isQuestionStart(line.text)) {
      flush();
      const num = questionNumber(line.text);
      if (num !== null) {
        lastNumber = num;
      }
      skippingRubric = false;
      current = { lines: [line], pageReference: String(line.page) };
      return;
    }

    const bare = BARE_START.exec(line.text);
    const startsNext =
      bare !== null &&
      Number(bare[1]) === lastNumber + 1 &&
      (line.text !== bare[1] || !lastOnPage);
    if (startsNext) {
      flush();
      lastNumber += 1;
      skippingRubric = false;
      current = { lines: [line], pageReference: String(line.page) };
      return;
    }
    if (SECTION_HEADING.test(line.text)) {
      skippingRubric = true;
      return;
    }
    if (skippingRubric || MARKS_ONLY.test(line.text)) {
      return;
    }
    if (current) {
      current.lines.push(line);
    }
  }
}

function pageLines(page: PdfPageInput): SourceLine[] {
  const bounded = (page.lines ?? [])
    .map((line) => ({
      text: line.text.split(UNMAPPED_GLYPH).join('\uFFFD').trim(),
      page: page.pageNumber,
      top: line.top,
      bottom: line.bottom,
    }))
    .filter((line) => line.text.length > 0 && !BOILERPLATE_LINE.test(line.text));
  if (bounded.length > 0) {
    return bounded;
  }
  return page.text
    .split(/\r?\n/)
    .map((text) => text.split(UNMAPPED_GLYPH).join('\uFFFD').trim())
    .filter((text) => text.length > 0 && !BOILERPLATE_LINE.test(text))
    .map((text) => ({ text, page: page.pageNumber }));
}

function regionsFrom(lines: SourceLine[]): QuestionRegion[] {
  const byPage = new Map<number, QuestionRegion>();
  for (const line of lines) {
    if (line.top === undefined || line.bottom === undefined) {
      continue;
    }
    const existing = byPage.get(line.page);
    if (!existing) {
      byPage.set(line.page, {
        page: line.page,
        top: line.top,
        bottom: line.bottom,
      });
      continue;
    }
    existing.top = Math.max(existing.top, line.top);
    existing.bottom = Math.min(existing.bottom, line.bottom);
  }
  return [...byPage.values()];
}

function isQuestionStart(line: string): boolean {
  return QUESTION_START.test(line);
}

function questionNumber(line: string): number | null {
  const match =
    /^(?:question|q)\.?\s*(\d+)\b/i.exec(line) ??
    /^(\d{1,3})[.)]\s+\S/.exec(line);
  return match ? Number(match[1]) : null;
}

function usesBareNumbers(pages: PdfPageInput[]): boolean {
  const lines = pages.flatMap((page) => pageLines(page));
  if (lines.some((line) => /^\d{1,3}[.)]\s+\S/.test(line.text))) {
    return false;
  }
  const numbers = new Set(
    lines.map((line) => BARE_START.exec(line.text)?.[1]).filter(Boolean),
  );
  return numbers.has('1') && numbers.has('2');
}

function isInstructionPage(lines: SourceLine[]): boolean {
  const combined = lines.map((line) => line.text).join('\n');
  return (
    /general instructions/i.test(combined) ||
    /^\s*blank page\s*$/i.test(combined) ||
    /^(?:office use only|do not write in this area|\d{8,12}|–\s*\d+\s*–|nsw education standards authority|\s*)+$/i.test(
      combined,
    )
  );
}
