/**
 * Fast intent gate for student chat (regex only — not curriculum).
 *
 * Content is always admin-bank-driven after this gate:
 * - greeting → quiet welcome (no subject dump)
 * - capabilities → subjects/topics from current approved uploads
 * - clarify → user named a subject/study area but not a real question yet
 * - academic → vector search over approved questions + citations
 *
 * Do not hardcode Class XII / board syllabi here. When admins approve
 * new papers, search and capabilities pick them up automatically.
 */

export type QueryIntent = 'greeting' | 'capabilities' | 'clarify' | 'academic';

/**
 * Chat openers — the whole message, after edge punctuation is removed.
 * "how does inertia work?" stays academic because it is not only a greeting.
 */
const GREETING =
  /^(?:hi|hey|hello|hola|namaste|yo|sup|hiya|good\s+(?:morning|afternoon|evening)|how\s+are\s+(?:you|u)|how\s+r\s+u|how're\s+you|how's\s+it\s+going|how\s+is\s+it\s+going|what'?s\s+up|thanks|thank\s+you|thx|bye|goodbye|ok|okay|cool|nice)$/i;

/** Strip surrounding punctuation so "HELLO!!!" and "how are u?" still greet. */
export function isGreeting(query: string): boolean {
  const text = query
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, '');
  return text !== '' && GREETING.test(text);
}

/** Explicit “what can you do / help” — then we may name bank subjects. */
const CAPABILITIES =
  /^(?:help(?:\s+me)?|what\s+can\s+you\s+do|how\s+(?:do\s+you\s+work|does\s+this\s+work)|who\s+are\s+you|what\s+is\s+this(?:\s+app|\s+site|\s+tool)?|start|begin)[\s!.?]*$/i;

/** Spellings students use for a bank subject ("maths" for Mathematics). */
export function subjectAliases(label: string): string[] {
  const n = label.trim().toLowerCase();
  if (n === 'mathematics' || n === 'maths' || n === 'math') {
    return ['mathematics', 'maths', 'math'];
  }
  if (n === 'business studies' || n === 'business') {
    return ['business studies', 'business'];
  }
  return [n];
}

/** Regex alternation of the bank's subject names; null with no subjects. */
function subjectAlternation(subjects: string[]): string | null {
  const aliases = [...new Set(subjects.flatMap(subjectAliases))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((alias) => escapeRegExp(alias).replace(/\s+/g, '\\s+'));
  return aliases.length > 0 ? aliases.join('|') : null;
}

/**
 * A bank subject with no concrete question ("maths", "help with physics").
 * It must clarify — not dump a random paper excerpt.
 */
function isBareSubject(text: string, subjects: string[]): boolean {
  const labels = subjectAlternation(subjects);
  if (!labels) {
    return false;
  }
  return new RegExp(
    `^(?:(?:please\\s+|can\\s+you\\s+(?:help\\s+(?:me\\s+)?(?:with\\s+)?)?|help(?:\\s+me)?(?:\\s+with)?\\s+|i\\s+(?:need|want)\\s+help\\s+(?:with|on)\\s+|about\\s+|for\\s+)?)(?:${labels})(?:\\s+(?:please|help|questions?|paper|exam|homework|revision|notes?))?[\\s!.?]*$`,
    'i',
  ).test(text);
}

/** Vague study words with no topic — ask what they want first. */
const VAGUE_STUDY =
  /^(?:(?:help(?:\s+me)?(?:\s+with)?|i\s+(?:need|want)\s+help\s+(?:with|on)|about|for)\s+)?(?:study|studies|exam(?:s)?|paper(?:s)?|homework|questions?|revision|notes?|topics?)(?:\s+please)?[\s!.?]*$/i;

/**
 * Whole-paper / year-browse asks — not searchable question stems.
 * e.g. "give me the question paper of physics", "physics paper 2024", "2 year".
 */
const PAPER_BROWSE =
  /\b(?:(?:full|entire|complete|whole)\s+)?(?:question\s+)?papers?\b|\bexam\s+papers?\b|\bpast\s+papers?\b|\bgive\s+me\s+(?:the\s+)?(?:paper|questions?)\b|\bshow\s+me\s+(?:the\s+)?(?:paper|questions?)\b|\bdownload\s+(?:the\s+)?paper\b/i;

/** Year / time-window alone — use filters, not vector search. */
const YEAR_ONLY =
  /^(?:(?:last\s+)?(?:\d{1,2})\s+years?|(?:year\s+)?(?:19|20)\d{2}|all\s+years?)[\s!.?]*$/i;

/**
 * Question and instruction words that make a message a real ask — go to
 * search. A closed set of grammar, not curriculum: topic words such as
 * "inertia" are not listed; a lone topic goes to the bank topic lookup.
 */
const ACADEMIC_SIGNAL =
  /\b(?:what|why|how|when|where|which|who|define|state|calculate|find|explain|prove|derive|solve|show|compare|difference|formula|law|theorem|equation)\b/i;

export function classifyQueryIntent(
  query: string,
  subjects: string[] = [],
): QueryIntent {
  const text = query.trim().replace(/\s+/g, ' ');
  if (text === '') {
    return 'capabilities';
  }
  if (isGreeting(text)) {
    return 'greeting';
  }
  if (CAPABILITIES.test(text) || text.length < 3) {
    return 'capabilities';
  }
  if (isBareSubject(text, subjects) || VAGUE_STUDY.test(text)) {
    return 'clarify';
  }
  if (looksLikePaperBrowseRequest(text) || YEAR_ONLY.test(text)) {
    return 'clarify';
  }
  // Short topic with no question shape → ask what they need (whole-chat rule).
  if (looksLikeUnderspecifiedTopic(text)) {
    return 'clarify';
  }
  return 'academic';
}

/** True when the student wants a whole paper / year dump, not a topic question. */
export function looksLikePaperBrowseRequest(query: string): boolean {
  const text = query.trim().replace(/\s+/g, ' ');
  if (!text) {
    return false;
  }
  if (YEAR_ONLY.test(text)) {
    return true;
  }
  // "Find/give me the Physics paper for 2024" — browse, not vector search.
  if (
    /\b(?:find|give|show|send|download|get|fetch)\b[\s\S]{0,48}\b(?:question\s+)?papers?\b/i.test(
      text,
    ) ||
    /\b(?:question\s+)?papers?\s+(?:for|of|from)\b/i.test(text)
  ) {
    return true;
  }
  if (!PAPER_BROWSE.test(text)) {
    return false;
  }
  // Real exam stems that mention "paper" in passing still search
  // (e.g. "define inertia from the paper").
  if (
    ACADEMIC_SIGNAL.test(text) &&
    !/\b(?:give|show|send|download|get|find|fetch)\b/i.test(text)
  ) {
    return false;
  }
  return true;
}

/**
 * A short topic with no subject and no question shape ("magnitude", "CO2"),
 * as opposed to a vague study word, a subject label, or a paper/year browse.
 */
export function looksLikeBareTopic(
  query: string,
  subjects: string[] = [],
): boolean {
  const text = query.trim().replace(/\s+/g, ' ');
  if (!/^\p{L}[\p{L}\p{N}\s'-]*$/u.test(text) || text.length < 2) {
    return false;
  }
  if (isGreeting(text) || CAPABILITIES.test(text)) {
    return false;
  }
  if (isBareSubject(text, subjects) || VAGUE_STUDY.test(text)) {
    return false;
  }
  if (looksLikePaperBrowseRequest(text)) {
    return false;
  }
  return looksLikeUnderspecifiedTopic(text);
}

/**
 * 1–4 word labels without question syntax, e.g. "algebra" alone.
 * Concrete phrases with academic signals still search (e.g. "what is inertia").
 */
function looksLikeUnderspecifiedTopic(text: string): boolean {
  if (text.includes('?')) {
    return false;
  }
  if (ACADEMIC_SIGNAL.test(text)) {
    return false;
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) {
    return false;
  }
  // Avoid treating full exam stems as clarify (they are usually longer).
  if (text.length > 48) {
    return false;
  }
  return true;
}

/** Quiet greeting — warm tutor opener; no subjects, no archive jargon. */
export function quietGreeting(): string {
  return [
    "Hi! I'm here to help with your studies.",
    'What would you like to work on today?',
  ].join('\n\n');
}

/**
 * Educational study ask (concept / question / solve) vs genuinely unrelated.
 * Used when retrieval finds nothing — do not call photosynthesis "out of scope".
 */
export function looksLikeEducationalRequest(
  query: string,
  subjects: string[] = [],
): boolean {
  const text = query.trim().replace(/\s+/g, ' ');
  if (!text || text.length < 3) {
    return false;
  }
  if (looksLikePaperBrowseRequest(text)) {
    return false;
  }
  if (ACADEMIC_SIGNAL.test(text)) {
    return true;
  }
  if (namedSubject(text, subjects)) {
    return true;
  }
  // Formula symbols still count as study.
  if (/[θπ√∫^=]/.test(text)) {
    return true;
  }
  // Multi-word phrasing without explicit academic verbs. Whether it is
  // really a study question is left to the explain model, which declines
  // anything that is not (see AnswersService.missingEvidenceReply).
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 12 && !/[!?…]{2,}/.test(text);
}

/**
 * Ask what they want before searching papers.
 * Optional subject hint when they only typed "maths" / "physics".
 * Student-facing copy — never say "uploaded paper".
 */
export function clarifyIntentReply(
  query: string,
  bankSubjects: string[] = [],
): string {
  if (looksLikePaperBrowseRequest(query)) {
    return paperBrowseReply(query, bankSubjects);
  }
  const named = namedSubject(query, bankSubjects);
  const bankHint =
    bankSubjects.length > 0
      ? ` Available subjects right now: ${bankSubjects.join(', ')}.`
      : '';
  if (named) {
    return [
      `Happy to help with ${named}.`,
      `What would you like to focus on — a topic, a formula, or a specific question?${bankHint}`,
    ].join('\n\n');
  }
  return [
    'Happy to help.',
    `Which subject and topic (or question) should we start with?${bankHint}`,
  ].join('\n\n');
}

/**
 * Honest reply for whole-paper / year asks — we retrieve individual
 * exam questions from the archive, not full PDF downloads.
 */
export function paperBrowseReply(
  query: string,
  bankSubjects: string[] = [],
): string {
  const named = namedSubject(query, bankSubjects);
  const bankHint =
    bankSubjects.length > 0
      ? ` Available subjects right now: ${bankSubjects.join(', ')}.`
      : '';
  const subjectLine = named
    ? `I can help with ${named} from your exam archive.`
    : 'I search individual exam questions from your archive — I cannot download a full question paper as one file.';
  const next = named
    ? `Tell me a topic, formula, or paste a question in ${named} (you can also set Year / Time period in the filters).${bankHint}`
    : `Pick a subject and ask a topic, formula, or paste a question. Use the Year / Time period filters if you want a specific year.${bankHint}`;
  return [subjectLine, next].join('\n\n');
}

/**
 * A bank subject the student named, exactly or as a near-miss
 * ("physcis" → Physics). Only subjects in the bank are ever returned.
 */
export function namedSubject(
  query: string,
  bankSubjects: string[] = [],
): string | null {
  const labels = subjectAlternation(bankSubjects);
  const exact = labels
    ? query.trim().match(new RegExp(`\\b(${labels})\\b`, 'i'))
    : null;
  if (exact) {
    const said = exact[1].toLowerCase().replace(/\s+/g, ' ');
    const label = bankSubjects.find((subject) =>
      subjectAliases(subject).includes(said),
    );
    if (label) {
      return label.trim();
    }
  }

  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4);
  for (const token of tokens) {
    const hit = closestSubject(token, bankSubjects);
    if (hit) {
      return hit;
    }
  }
  return null;
}

function closestSubject(token: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const label = candidate.trim();
    if (!label) {
      continue;
    }
    const normalized = label.toLowerCase();
    if (subjectAliases(label).includes(token)) {
      return label;
    }
    // Typos only against the full subject label.
    // Never edit-distance a topic word onto a short alias ("mass" ≈ "math").
    if (token.length >= 5 && normalized.length >= 6) {
      const distance = editDistance(token, normalized);
      if (
        distance > 0 &&
        distance <= 2 &&
        Math.abs(token.length - normalized.length) <= 2 &&
        distance < bestDistance
      ) {
        bestDistance = distance;
        best = label;
      }
    }
  }
  return best;
}

function editDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (Math.abs(a.length - b.length) > 2) {
    return 99;
  }
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );
  for (let i = 0; i < rows; i += 1) {
    grid[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    grid[0][j] = j;
  }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,
        grid[i][j - 1] + 1,
        grid[i - 1][j - 1] + cost,
      );
    }
  }
  return grid[a.length][b.length];
}

/**
 * Last resort if the capabilities model is down.
 * Subjects/tips only from admin uploads — never a fixed curriculum list.
 */
export function fallbackCapabilitiesFromBank(
  subjects: string[],
  samples: Array<{ questionText: string; subject?: string }>,
): string {
  const uniqueSubjects = [
    ...new Set(subjects.map((s) => s.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const subjectLine =
    uniqueSubjects.length > 0
      ? `I can help with ${uniqueSubjects.join(' and ')} from your exam archive.`
      : 'I can help with questions and topics from your exam archive.';
  const tips = samples
    .slice(0, 3)
    .map((s) => shortTopic(s.questionText))
    .filter(Boolean)
    .map((t) => `• ${t}`)
    .join('\n');
  if (!tips) {
    return `${subjectLine}\n\nTell me a topic or question to begin.`;
  }
  return `${subjectLine}\n\nYou could try topics like:\n${tips}`;
}

/** @deprecated use quietGreeting / fallbackCapabilitiesFromBank */
export function fallbackGuidanceFromSamples(
  intent: 'greeting' | 'vague_help' | 'capabilities',
  samples: Array<{ questionText: string; subject?: string }>,
): string {
  if (intent === 'greeting') {
    return quietGreeting();
  }
  const subjects = samples
    .map((s) => s.subject?.trim())
    .filter((s): s is string => Boolean(s));
  return fallbackCapabilitiesFromBank(subjects, samples);
}

/** Mode 2 lead — educational topic, but no paper hit (optional AI explanation separate). */
export const NOT_IN_PAPERS =
  "I couldn't find a matching answer in your exam archive.";

/**
 * Valid study ask with no bank evidence — not the same as out-of-scope.
 * Optional general explanation is attached separately and labelled AI-generated.
 */
export const UNSUPPORTED_KNOWLEDGE =
  "I couldn't find a relevant question about that in the currently available exam papers. I can still give a general explanation of the concept, but it will not be an answer retrieved from your papers.";

/**
 * Mode 3 — unrelated / non-study request (no invented citation).
 * Used when the request is outside the study assistant remit.
 */
export const OUTSIDE_SCOPE =
  "I'm here to help with your studies and questions from your exam archive. That request looks outside what I can help with. Ask about a subject, concept, formula, or exam question instead.";

function shortTopic(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  // Prefer a short phrase, not a full exam stem
  const cut = one.replace(/^(?:\d+[.)]\s*)+/, '');
  if (cut.length <= 40) {
    return cut;
  }
  const head = cut.slice(0, 40);
  const space = head.lastIndexOf(' ');
  return `${(space > 12 ? head.slice(0, space) : head).trim()}…`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
