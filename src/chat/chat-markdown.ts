import type { AnswerWithHits } from '../questions/answers.service';
import { selectRelevantSources } from '../questions/quote-check';
import type { SearchHit } from '../questions/questions.repository';

export type ChatSource = {
  id: string;
  title: string;
  filename: string | null;
  /** Quoted bank text for the Sources artifact (not AI-written). */
  questionText: string | null;
  /** Real paper diagrams (Cloudinary or Nest /papers/figures/...). */
  figureUrls: string[];
};

export type ChatReply = {
  markdown: string;
  sources: ChatSource[];
};

export const AI_NOTE =
  'General educational explanation — not retrieved from your exam papers.';
export const REWRITTEN_NOTE = 'AI-rewritten explanation';
export const BASED_ON_NOTE = 'Based on these paper sources';
const RELATED_HEADING = '**Related question from your papers**';

const SCRIPT = /([\^_])\{([-−–+]?[0-9A-Za-z]{1,8})\}/g;
const MARKDOWN_PUNCTUATION = /[\\`*_[\]<>#|~$&]/g;

// Stored text records raised and lowered numbers as ^{8} and _{3}. Only those
// pieces become KaTeX; all other characters are escaped so the stored wording
// is shown as written.
export function quoteBlock(text: string): string {
  return lines(text)
    .map((line) => `> ${formatLine(line)}`)
    .join('\\\n');
}

export function paragraphs(text: string): string {
  return lines(text).map(formatLine).join('\n\n');
}

function lines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function formatLine(line: string): string {
  let result = '';
  let last = 0;
  for (const match of line.matchAll(SCRIPT)) {
    result += escapeText(line.slice(last, match.index));
    const body = match[2].replace(/[−–]/g, '-');
    result += `$${match[1]}{${body}}$`;
    last = match.index + match[0].length;
  }
  result += escapeText(line.slice(last));
  return result
    .replace(/^(\d{1,9})([.)])(?=\s|$)/, '$1\\$2')
    .replace(/^([-+=])/, '\\$1');
}

function escapeText(text: string): string {
  return text.replace(MARKDOWN_PUNCTUATION, '\\$&');
}

export function sourceOf(hit: SearchHit | undefined, id: string): ChatSource {
  if (!hit) {
    return {
      id,
      title: 'Source',
      filename: null,
      questionText: null,
      figureUrls: [],
    };
  }
  const heading = [hit.subject, hit.topic].filter(Boolean).join(' · ');
  const withPage = hit.pageReference
    ? `${heading} · Page ${hit.pageReference}`
    : heading;
  const filename = hit.sourceDocument?.split('#')[0].trim() || null;
  return {
    id,
    title: withPage || 'Source',
    filename,
    questionText: hit.questionText?.trim() || null,
    figureUrls: hit.figureUrls ?? [],
  };
}

function sourceLabel(source: ChatSource): string {
  const label = escapeText(source.title);
  return source.filename ? `${label} · ${escapeText(source.filename)}` : label;
}

/** In-chat source question card (Phase 2). */
function relatedQuestionCard(
  source: { questionText: string },
  meta: ChatSource,
): string[] {
  return [
    RELATED_HEADING,
    `*${sourceLabel(meta)}*`,
    quoteBlock(source.questionText),
    '_From your exam archive_',
  ];
}

function basedOnCard(source: { questionText: string }, meta: ChatSource) {
  return [`*${sourceLabel(meta)}*`, quoteBlock(source.questionText)];
}

/**
 * One of our replies turned back into plain text for the next turn. Labels
 * and paper cards are dropped (sources travel separately as ids) and the
 * Markdown escaping added by formatLine is undone.
 */
export function plainAnswerText(markdown: string): string {
  const cardStarts = [RELATED_HEADING, `**${BASED_ON_NOTE}**`]
    .map((heading) => markdown.indexOf(heading))
    .filter((index) => index >= 0);
  const body =
    cardStarts.length > 0
      ? markdown.slice(0, Math.min(...cardStarts))
      : markdown;
  const labels = new Set([
    `_${escapeText(AI_NOTE)}_`,
    `**${escapeText(AI_NOTE)}**`,
    `**${REWRITTEN_NOTE}**`,
  ]);
  return body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^>\s?/, '').replace(/\\$/, ''))
    .filter((line) => !labels.has(line.trim()))
    .join('\n')
    .replace(/\$([\^_]\{[^}]*\})\$/g, '$1')
    .replace(/\\([\\`*_[\]<>#|~$&.)+=-])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function chatReply({
  response,
  related,
  understanding,
}: AnswerWithHits): ChatReply {
  const byId = new Map(related.map((hit) => [hit.id, hit]));
  const original =
    understanding?.topic?.trim() || understanding?.original?.trim() || '';
  const corrected = understanding?.corrected?.trim() || '';
  const cited =
    response.status === 'insufficient' && (original || corrected)
      ? selectRelevantSources(original, corrected, response.sources)
      : response.sources;
  const sources = cited.map((source) =>
    sourceOf(byId.get(source.id), source.id),
  );

  if (response.status === 'guidance') {
    return { markdown: paragraphs(response.answer), sources: [] };
  }

  // A reworked earlier answer is model wording, never a verified quote.
  // Shorter/simpler keeps the papers it was based on; an example or a
  // longer explanation may add general knowledge, so it says so.
  if (response.answerOrigin === 'transformed') {
    const restates =
      response.transformation === 'shorten' ||
      response.transformation === 'simplify';
    const cards = cited.flatMap((source, index) =>
      restates
        ? basedOnCard(source, sources[index])
        : relatedQuestionCard(source, sources[index]),
    );
    const heading =
      restates && cards.length > 0 ? [`**${BASED_ON_NOTE}**`] : [];
    return {
      markdown: [
        `**${restates ? REWRITTEN_NOTE : escapeText(AI_NOTE)}**`,
        paragraphs(response.answer),
        ...heading,
        ...cards,
      ].join('\n\n'),
      sources,
    };
  }

  if (response.status === 'out_of_scope') {
    const parts = [paragraphs(response.answer)];
    if (response.explanation) {
      parts.push(
        `**${escapeText(AI_NOTE)}**`,
        paragraphs(response.explanation),
      );
    }
    return { markdown: parts.join('\n\n'), sources: [] };
  }

  if (response.status === 'answered') {
    const quotes = response.answer
      .split('\n\n')
      .map(quoteBlock)
      .filter((block) => block !== '');
    const cards = cited.flatMap((source, index) =>
      relatedQuestionCard(source, sources[index]),
    );
    return {
      markdown: [...quotes, ...cards].join('\n\n'),
      sources,
    };
  }

  // insufficient — explanation, plus a paper card only when the hit
  // shares the student's topic. A high similarity score is not enough.
  const lead = response.explanation
    ? [paragraphs(response.explanation), `_${escapeText(AI_NOTE)}_`]
    : [escapeText(response.answer)];
  const cards = cited.flatMap((source, index) =>
    relatedQuestionCard(source, sources[index]),
  );
  return {
    markdown: [...lead, ...cards].join('\n\n'),
    sources,
  };
}

// Splits after whitespace so that no word or KaTeX piece is cut in two.
export function deltasOf(markdown: string, wordsPerDelta: number): string[] {
  const words = markdown.match(/\S+\s*|\s+/g) ?? [];
  const deltas: string[] = [];
  for (let index = 0; index < words.length; index += wordsPerDelta) {
    deltas.push(words.slice(index, index + wordsPerDelta).join(''));
  }
  return deltas;
}
