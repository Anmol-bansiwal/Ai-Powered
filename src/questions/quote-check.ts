export const RELATED_SCORE = 0.45;

const QUERY_STOPWORDS = new Set([
  'about',
  'and',
  'are',
  'can',
  'could',
  'describe',
  'did',
  'does',
  'explain',
  'for',
  'from',
  'have',
  'how',
  'into',
  'please',
  'tell',
  'that',
  'the',
  'this',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
  'work',
  'would',
  'you',
  'your',
]);

/** Exam-cover wording. Overlap on only these words is not topical evidence. */
const ADMIN_TOKENS = new Set([
  'answer',
  'booklet',
  'board',
  'candidate',
  'centre',
  'center',
  'duration',
  'exam',
  'examination',
  'general',
  'hours',
  'hour',
  'instructions',
  'instruction',
  'invigilator',
  'marks',
  'mark',
  'minutes',
  'minute',
  'number',
  'office',
  'only',
  'page',
  'paper',
  'papers',
  'question',
  'questions',
  'reading',
  'section',
  'time',
  'use',
  'write',
  'writing',
]);

/**
 * A similarity score is not evidence. A hit is relevant only when it
 * shares one of the student's distinctive topic words (the longest
 * non-filler tokens), not a shared everyday word like "motion".
 */
export function isRelevantToQuery(
  query: string,
  questionText: string,
): boolean {
  return evidenceOverlapScore(query, questionText) > 0;
}

/**
 * Follow-ups such as "explain it" have no topic word of their own.
 * The corrected text carries the previous topic. Subject labels and
 * the follow-up wrapper are stripped so they cannot count as evidence.
 */
export function isRelevantEvidence(
  original: string,
  corrected: string,
  questionText: string,
): boolean {
  return (
    evidenceOverlapScore(
      topicTextForEvidence(original, corrected),
      questionText,
    ) > 0
  );
}

/** Keep only sources that share the strongest topic anchors with the ask. */
export function selectRelevantSources<T extends { questionText: string }>(
  original: string,
  corrected: string,
  sources: T[],
): T[] {
  const topic = topicTextForEvidence(original, corrected);
  const scored = sources
    .map((source) => ({
      source,
      score: evidenceOverlapScore(topic, source.questionText),
    }))
    .filter((item) => item.score > 0);
  if (scored.length === 0) {
    return [];
  }
  const best = Math.max(...scored.map((item) => item.score));
  return scored
    .filter((item) => item.score === best)
    .map((item) => item.source);
}

function topicTextForEvidence(original: string, corrected: string): string {
  const fromOriginal = original.trim();
  if (anchorTokens(fromOriginal).length > 0) {
    return fromOriginal;
  }
  return stripEvidenceWrappers(corrected);
}

function stripEvidenceWrappers(text: string): string {
  return text
    .replace(/^[A-Za-z][A-Za-z ]{0,40}:\s+/, '')
    .replace(/^please\s+explain\s+further\s+based\s+on\s+this:\s*/i, '')
    .trim();
}

/**
 * Overlap count against the longest topic anchors in the ask.
 * Sharing only a short common word (e.g. motion) scores 0 when longer
 * anchors such as inertia / resistance are present.
 */
function evidenceOverlapScore(query: string, questionText: string): number {
  const anchors = anchorTokens(query);
  if (anchors.length === 0) {
    return 0;
  }
  const stored = contentTokens(questionText);
  return anchors.filter((token) => tokenOverlaps(token, stored)).length;
}

function anchorTokens(text: string): string[] {
  const tokens = [...contentTokens(text)].filter(
    (token) => !ADMIN_TOKENS.has(token),
  );
  tokens.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return tokens.slice(0, 2);
}

function contentTokens(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  return new Set(tokens.filter((token) => !QUERY_STOPWORDS.has(token)));
}

function tokenOverlaps(token: string, stored: Set<string>): boolean {
  if (stored.has(token)) {
    return true;
  }
  if (stored.has(`${token}s`) || stored.has(`${token}es`)) {
    return true;
  }
  if (token.endsWith('es') && stored.has(token.slice(0, -2))) {
    return true;
  }
  if (token.endsWith('s') && stored.has(token.slice(0, -1))) {
    return true;
  }
  return false;
}
export const MIN_QUOTE_LENGTH = 20;

/** @deprecated Prefer outOfScopeWithSuggestions() for student-facing replies. */
export const OUT_OF_SCOPE_ANSWER =
  'The uploaded papers do not contain any information about this question.';

export const INSUFFICIENT_ANSWER =
  'The uploaded papers do not contain enough information to answer this reliably.';

export type QuoteKind = 'answer' | 'question';

export type QuoteProposal = {
  complete: boolean;
  quotes: Array<{ id: string; quote: string; kind?: QuoteKind }>;
};

export type CitedSource = {
  id: string;
  questionText: string;
  pageReference: string | null;
  score: number;
};

export type AnswerDecision = {
  status: 'answered' | 'insufficient';
  answer: string;
  sources: CitedSource[];
};

type Span = { start: number; end: number };

// Question numbers ("2.", "Q17.", "Question 4", "OR") carry no meaning of
// their own and are removed before a sentence is read.
const QUESTION_NUMBER =
  /^\s*(?:(?:(?:Q(?:uestion)?\.?\s*)?\d{1,3}\s*[.):]?|OR\b)\s*)+/i;
// "(a)", "(ii)", "b." and "iv)" open an MCQ option or a sub-part. An option
// is a candidate, not an answer, and a sub-part is a task.
const PART_LABEL =
  /^\s*(?:\(\s*(?:[a-h]|[ivx]{1,4})\s*\)|(?:[a-h]|[ivx]{1,4})[.)](?=\s))/i;
const LABEL_ONLY =
  /^\s*(?:(?:Q(?:uestion)?\.?\s*)?\d{1,3}|[a-h]|[ivx]{1,4})\s*$/i;
// Assertion-reason items state claims that may be false by design.
const CLAIM_UNDER_TEST = /^(?:assertion|reason)\b/i;
const TASK_WORDS = new Set([
  'account',
  'answer',
  'arrange',
  'attempt',
  'calculate',
  'choose',
  'classify',
  'compare',
  'complete',
  'compute',
  'consider',
  'convert',
  'deduce',
  'define',
  'derive',
  'describe',
  'determine',
  'differentiate',
  'discuss',
  'distinguish',
  'draw',
  'estimate',
  'evaluate',
  'explain',
  'fill',
  'find',
  'give',
  'how',
  'identify',
  'illustrate',
  'justify',
  'list',
  'mark',
  'match',
  'mention',
  'name',
  'obtain',
  'plot',
  'predict',
  'prove',
  'read',
  'select',
  'show',
  'sketch',
  'solve',
  'state',
  'suggest',
  'tick',
  'verify',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'whose',
  'why',
  'write',
]);

// Locates the quote in the source. Words must appear in order with any
// whitespace between them; the returned text is the source slice, so model
// wording and any page number supplied by the model are not used.
export function locateQuote(
  sourceText: string,
  quote: string,
): (Span & { text: string }) | null {
  const collapsed = quote.trim().replace(/\s+/g, ' ');
  if (collapsed.length < MIN_QUOTE_LENGTH) {
    return null;
  }
  const pattern = new RegExp(
    collapsed.split(' ').map(escapeRegExp).join('\\s+'),
    'i',
  );
  const match = pattern.exec(sourceText);
  if (!match) {
    return null;
  }
  return {
    start: match.index,
    end: match.index + match[0].length,
    text: match[0],
  };
}

export function verifiedQuote(
  sourceText: string,
  quote: string,
): string | null {
  return locateQuote(sourceText, quote)?.text ?? null;
}

// A stored row is an exam question, so most of its text asks for an answer
// rather than giving one. A quote is question material when any sentence it
// touches is a question, an instruction, an option, a sub-part or an
// assertion-reason claim. This check is independent of the model's own
// label; both must agree before a quote is shown as an answer.
export function isQuestionMaterial(sourceText: string, span: Span): boolean {
  return sentenceSpans(sourceText)
    .filter(
      (sentence) => sentence.start < span.end && sentence.end > span.start,
    )
    .some((sentence) =>
      asksForAnswer(sourceText.slice(sentence.start, sentence.end)),
    );
}

export function asksForAnswer(sentence: string): boolean {
  if (PART_LABEL.test(sentence)) {
    return true;
  }
  const body = sentence.replace(QUESTION_NUMBER, '').trim();
  if (body === '') {
    return false;
  }
  if (body.endsWith('?') || CLAIM_UNDER_TEST.test(body)) {
    return true;
  }
  if (PART_LABEL.test(body)) {
    return true;
  }
  const firstWord = /^[A-Za-z]+/.exec(body)?.[0].toLowerCase();
  return firstWord !== undefined && TASK_WORDS.has(firstWord);
}

// Sentences end at . ? ! : ; before whitespace, or at a line break. A period
// that only closes a label such as "Q17." or "a." does not end a sentence.
function sentenceSpans(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.?!:;](?=\s)|\n/g)) {
    const end = match.index + match[0].length;
    if (match[0] === '.' && LABEL_ONLY.test(text.slice(start, match.index))) {
      continue;
    }
    spans.push({ start, end });
    start = end;
  }
  if (start < text.length) {
    spans.push({ start, end: text.length });
  }
  return spans;
}

export function assessQuotes(
  proposal: QuoteProposal,
  sources: CitedSource[],
): AnswerDecision {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const accepted: string[] = [];
  const used = new Set<string>();

  for (const quote of proposal.quotes) {
    const source = byId.get(quote.id);
    if (!source || quote.kind !== 'answer') {
      continue;
    }
    const located = locateQuote(source.questionText, quote.quote);
    if (!located || isQuestionMaterial(source.questionText, located)) {
      continue;
    }
    accepted.push(located.text);
    used.add(source.id);
  }

  if (proposal.complete && accepted.length > 0) {
    return {
      status: 'answered',
      answer: accepted.join('\n\n'),
      sources: sources.filter((source) => used.has(source.id)),
    };
  }

  return {
    status: 'insufficient',
    answer: INSUFFICIENT_ANSWER,
    sources,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
