import { Injectable } from '@nestjs/common';
import {
  classifyQueryIntent,
  looksLikeBareTopic,
  looksLikePaperBrowseRequest,
  namedSubject,
  paperBrowseReply,
  subjectAliases,
  type QueryIntent,
} from './query-intent';

export type QueryCorrection = {
  from: string;
  to: string;
};

export type ConversationTurn = {
  role: 'user' | 'assistant';
  text: string;
  /** Question ids an assistant turn cited (client data, re-checked in the DB). */
  sourceIds?: string[];
  /** Routing label sent with an assistant turn, when the client kept it. */
  kind?: string;
  /** Subject the server reported for an assistant turn (metadata). */
  activeSubject?: string | null;
};

/**
 * Understanding result — original is never overwritten.
 * `intent` stays compatible with AnswersService routing.
 */
export type UnderstoodQuery = {
  original: string;
  normalized: string;
  corrected: string;
  intent: QueryIntent;
  /** Finer label for tests / telemetry (does not break API). */
  kind:
    | 'greeting'
    | 'capabilities'
    | 'subject_selection'
    | 'subject_suggestion'
    | 'subject_confirmed'
    | 'clarification_needed'
    | 'concept_explanation'
    | 'question_search'
    | 'solve_problem'
    | 'educational'
    | 'follow_up'
    | 'ambiguous_topic'
    | 'gibberish'
    | 'unintelligible'
    | 'out_of_scope'
    | 'unsupported_knowledge'
    | 'empty'
    | 'clarify';
  confidence: number;
  needsClarification: boolean;
  suggestedSubjects: string[];
  /** Subject established earlier in this chat (not overwritten on new chat). */
  activeSubject: string | null;
  corrections: QueryCorrection[];
  /** Optional student-facing guidance text (when needsClarification). */
  guidanceMessage: string | null;
  /** Study topic this turn is about, when it waits for or carries a subject. */
  topic?: string | null;
};

export type UnderstandOptions = {
  bankSubjects?: string[];
  /** Recent turns excluding the current message (newest last). */
  priorTurns?: ConversationTurn[];
  /** Optional filter subject from the request body. */
  filterSubject?: string | null;
};

const MAX_INPUT = 1000;

/** 3-letter stems that are topics, never subject prefixes (sin ≠ Science). */
const TOPIC_STEMS = new Set(['sin', 'cos', 'tan', 'log']);

const FOLLOW_UP =
  /^(?:why\??|how\??|explain\s+(?:it|that|this|again)|say\s+that\s+again|what\s+about\s+(?:it|that|this|the\s+second\s+one)\??|i\s+(?:do\s*n'?t|dont)\s+get\s+(?:it|this)|don'?t\s+understand|still\s+confused)[\s!.?]*$/i;

const CONCEPT_EXPLAIN =
  /^(?:explain|define|what\s+(?:is|are)|describe|tell\s+me\s+about)\b/i;

const QUESTION_SEARCH =
  /\b(?:find|search|look\s+up|from\s+the\s+paper|in\s+the\s+paper|exam\s+question|past\s+question)\b/i;

const SOLVE_PROBLEM =
  /\b(?:solve|calculate|compute|find\s+(?:the\s+)?(?:value|acceleration|force|velocity|mass|speed|energy)|work\s+out)\b/i;

/** A short yes. Closed set, like greetings — not a list of student questions. */
const AFFIRMATION =
  /^(?:y|ya|yes|yeah|yep|yup|sure|ok|okay|correct|right|exactly|yes please|haan|han)[\s!.]*$/i;

const GREETING_LOOSE =
  /^(?:h+i+|he+y+|hello+|hola|namaste|yo+|sup|hiya|good\s+(?:morning|afternoon|evening)|how\s+are\s+(?:you|u)|how\s+r\s+u|how're\s+you|how's\s+it\s+going|how\s+is\s+it\s+going|what'?s\s+up|thanks|thank\s+you|thx|bye|goodbye)[\s!.?,;:'"()]*$/i;

type SubjectHit = {
  label: string;
  confidence: number;
  kind: 'exact' | 'typo' | 'prefix';
};

/**
 * Deterministic input-understanding layer (no LLM for trivial cases).
 * Production retrieval / embeddings are unchanged — only the query text
 * passed into search may be a corrected interpretation.
 */
@Injectable()
export class QueryUnderstandingService {
  understand(raw: string, options: UnderstandOptions = {}): UnderstoodQuery {
    const original = typeof raw === 'string' ? raw : '';
    const bankSubjects = catalogueOf(options.bankSubjects ?? []);
    const priorTurns = options.priorTurns ?? [];
    const activeSubject = inferActiveSubject(
      priorTurns,
      options.filterSubject,
      bankSubjects,
    );

    if (isEmptyOrUnusable(original)) {
      return baseResult(original, '', 'capabilities', {
        kind: 'empty',
        confidence: 1,
        needsClarification: true,
        activeSubject,
        guidanceMessage:
          'Please type a subject, topic, or question so I can help.',
      });
    }

    if (original.trim().length > MAX_INPUT) {
      return baseResult(
        original,
        original.trim().slice(0, MAX_INPUT),
        'clarify',
        {
          kind: 'empty',
          confidence: 1,
          needsClarification: true,
          activeSubject,
          guidanceMessage:
            'That message is too long. Please send a shorter question or topic.',
        },
      );
    }

    const normalized = basicNormalize(original);

    // Before greetings: "ok" / "yes" may be confirming our suggestion.
    const confirmed = this.confirmedSubject(
      normalized,
      priorTurns,
      bankSubjects,
    );
    if (confirmed) {
      return baseResult(original, confirmed, 'clarify', {
        kind: 'subject_selection',
        confidence: 0.9,
        activeSubject: confirmed,
        suggestedSubjects: bankSubjects.slice(0, 4),
        guidanceMessage: subjectConfirmedReply(confirmed, bankSubjects),
      });
    }

    if (
      GREETING_LOOSE.test(normalized) ||
      classifyQueryIntent(normalized, bankSubjects) === 'greeting'
    ) {
      return baseResult(original, normalized, 'greeting', {
        kind: 'greeting',
        confidence: 1,
        activeSubject,
      });
    }

    if (looksLikeGibberish(normalized, bankSubjects)) {
      return baseResult(original, normalized, 'clarify', {
        kind: 'unintelligible',
        confidence: 1,
        needsClarification: true,
        activeSubject,
        suggestedSubjects: bankSubjects.slice(0, 4),
        guidanceMessage: gibberishReply(bankSubjects),
      });
    }

    if (FOLLOW_UP.test(normalized)) {
      const prior = lastAssistantText(priorTurns);
      if (prior) {
        const corrected = `Please explain further based on this: ${clip(prior, 220)}`;
        return baseResult(original, corrected, 'academic', {
          kind: 'follow_up',
          confidence: 0.8,
          activeSubject,
        });
      }
      return baseResult(original, normalized, 'clarify', {
        kind: 'follow_up',
        confidence: 0.55,
        needsClarification: true,
        activeSubject,
        guidanceMessage: activeSubject
          ? `Happy to explain further in ${activeSubject} — which part should I go over again?`
          : 'Happy to explain further — which topic or question should I go over again?',
      });
    }

    const { text: spelled, corrections } = applySpellingFixes(
      normalized,
      bankSubjects,
    );

    // Subject evidence before topic interpretation:
    // explicit phrases and unambiguous prefixes beat fuzzy guesses and prior subject.
    const prefixHit = unambiguousPrefixHit(spelled, bankSubjects);
    if (prefixHit) {
      return baseResult(original, spelled, 'clarify', {
        kind: 'subject_suggestion',
        confidence: prefixHit.confidence,
        needsClarification: true,
        activeSubject,
        corrections,
        suggestedSubjects: [
          prefixHit.label,
          ...bankSubjects.filter((s) => s !== prefixHit.label),
        ].slice(0, 4),
        guidanceMessage: subjectSuggestionReply(prefixHit.label, bankSubjects),
      });
    }

    const mentioned = reliableSubjectsIn(spelled, bankSubjects);
    if (mentioned.length > 1) {
      return baseResult(original, spelled, 'clarify', {
        kind: 'clarification_needed',
        confidence: 0.6,
        needsClarification: true,
        activeSubject,
        corrections,
        guidanceMessage: `I see more than one subject (${mentioned.join(' and ')}). Which one should we use?`,
      });
    }
    if (mentioned.length === 1) {
      const chosen = mentioned[0];
      const remainder = stripSubjectCues(spelled);
      if (
        remainder === '' ||
        isPureSubjectSwitch(spelled) ||
        isExactSubjectMessage(spelled, bankSubjects)
      ) {
        const topic = this.pendingTopic(priorTurns, bankSubjects);
        if (topic) {
          return baseResult(
            original,
            enrichWithSubject(`What is ${topic}?`, chosen),
            'academic',
            {
              kind: 'concept_explanation',
              confidence: 0.85,
              activeSubject: chosen,
              corrections,
              topic,
            },
          );
        }
        return baseResult(original, chosen, 'clarify', {
          kind: 'subject_selection',
          confidence: 0.9,
          activeSubject: chosen,
          corrections,
          suggestedSubjects: bankSubjects.slice(0, 4),
          guidanceMessage: subjectConfirmedReply(chosen, bankSubjects),
        });
      }
      const inNewSubject = understandWithinSubject(
        original,
        remainder,
        corrections,
        chosen,
        bankSubjects,
      );
      if (inNewSubject) {
        return inNewSubject;
      }
    }

    // Whole message is an unambiguous subject prefix (phy, chem) — never a topic.
    // Within an established subject, short topics/expressions are NOT
    // subject-selection prompts (maths → sin → cos theta).
    if (activeSubject && !looksLikeSubjectSwitch(spelled, bankSubjects)) {
      const inSubject = understandWithinSubject(
        original,
        spelled,
        corrections,
        activeSubject,
        bankSubjects,
      );
      if (inSubject) {
        return inSubject;
      }
    }

    // Math expressions (cos θ, cos theta) — search/explain, never subject-selection.
    if (looksLikeMathExpression(spelled)) {
      return baseResult(
        original,
        enrichWithSubject(normalizeMathPhrase(spelled), activeSubject),
        'academic',
        {
          kind: 'educational',
          confidence: 0.8,
          activeSubject,
          corrections,
        },
      );
    }

    // Whole-paper / year browse — never dump unrelated exam stems.
    if (looksLikePaperBrowseRequest(spelled)) {
      const named =
        namedSubject(spelled, bankSubjects) ??
        matchSubjectCatalogue(spelled, bankSubjects)[0]?.label ??
        activeSubject;
      return baseResult(original, spelled, 'clarify', {
        kind: 'clarify',
        confidence: 0.9,
        needsClarification: true,
        activeSubject: named,
        corrections,
        suggestedSubjects: bankSubjects.slice(0, 4),
        guidanceMessage: paperBrowseReply(spelled, bankSubjects),
      });
    }

    // Single-token / short subject fragments (phy, chem, mat…).
    const subjectHits = matchSubjectCatalogue(spelled, bankSubjects);
    if (isShortSubjectCandidate(spelled) && subjectHits.length > 0) {
      const best = subjectHits[0];
      const others = bankSubjects.filter((s) => s !== best.label).slice(0, 4);
      if (best.confidence >= 0.9 && best.kind !== 'prefix') {
        return baseResult(original, best.label, 'clarify', {
          kind: 'subject_selection',
          confidence: best.confidence,
          activeSubject: best.label,
          corrections:
            spelled.toLowerCase() === best.label.toLowerCase()
              ? corrections
              : [...corrections, { from: spelled, to: best.label }],
          suggestedSubjects: [best.label, ...others],
          guidanceMessage: subjectConfirmedReply(best.label, bankSubjects),
        });
      }
      return baseResult(original, spelled, 'clarify', {
        kind: 'subject_suggestion',
        confidence: best.confidence,
        needsClarification: true,
        activeSubject,
        corrections,
        suggestedSubjects: [best.label, ...others],
        guidanceMessage: subjectSuggestionReply(best.label, bankSubjects),
      });
    }

    const intent = classifyQueryIntent(spelled, bankSubjects);
    if (intent === 'capabilities') {
      return baseResult(original, spelled, 'capabilities', {
        kind: 'capabilities',
        confidence: 0.95,
        activeSubject,
        corrections,
      });
    }
    if (intent === 'clarify') {
      const named =
        subjectHits[0]?.label ?? namedSubject(spelled, bankSubjects);
      // "magnitude" alone: a topic waiting for a subject. AnswersService
      // asks the bank which subjects cover it before asking the student.
      if (
        !named &&
        !activeSubject &&
        looksLikeBareTopic(spelled, bankSubjects)
      ) {
        return baseResult(original, spelled, 'clarify', {
          kind: 'clarification_needed',
          confidence: 0.6,
          needsClarification: true,
          activeSubject: null,
          corrections,
          suggestedSubjects: bankSubjects.slice(0, 4),
          guidanceMessage: topicSubjectQuestion(spelled, bankSubjects),
          topic: spelled,
        });
      }
      return baseResult(original, named ?? spelled, 'clarify', {
        kind: named ? 'subject_selection' : 'clarification_needed',
        confidence: named ? (subjectHits[0]?.confidence ?? 0.85) : 0.7,
        activeSubject: named ?? activeSubject,
        corrections,
        suggestedSubjects: bankSubjects.slice(0, 4),
        guidanceMessage: named
          ? subjectConfirmedReply(named, bankSubjects)
          : activeSubject
            ? `In ${activeSubject}, what would you like to focus on — a topic, a formula, or a specific question?`
            : null,
      });
    }

    const subjectHint =
      activeSubject ?? namedSubject(spelled, bankSubjects) ?? null;
    return baseResult(
      original,
      enrichWithSubject(spelled, subjectHint),
      'academic',
      {
        kind: educationalKind(spelled),
        confidence: corrections.length > 0 ? 0.85 : 0.9,
        activeSubject: subjectHint,
        corrections,
      },
    );
  }

  /**
   * "magnitude" → (which subject?) → "physics": the topic still waiting.
   */
  private pendingTopic(
    priorTurns: ConversationTurn[],
    bankSubjects: string[],
  ): string | null {
    const earlier = this.answeredTurn(
      priorTurns,
      bankSubjects,
      'clarification_needed',
    );
    return earlier?.intent === 'clarify' && earlier.activeSubject === null
      ? (earlier.topic ?? null)
      : null;
  }

  /**
   * "phy" → (Did you mean Physics?) → "yes": the subject we suggested.
   */
  private confirmedSubject(
    message: string,
    priorTurns: ConversationTurn[],
    bankSubjects: string[],
  ): string | null {
    if (!AFFIRMATION.test(message)) {
      return null;
    }
    const earlier = this.answeredTurn(
      priorTurns,
      bankSubjects,
      'subject_suggestion',
    );
    return earlier?.kind === 'subject_suggestion'
      ? (earlier.suggestedSubjects[0] ?? null)
      : null;
  }

  /**
   * The student's previous message, read again with the same rules, when
   * our latest reply answered it. Avoids matching our own reply wording.
   * When the client kept metadata, the reply must also be of `replyKind`.
   */
  private answeredTurn(
    priorTurns: ConversationTurn[],
    bankSubjects: string[],
    replyKind: UnderstoodQuery['kind'],
  ): UnderstoodQuery | null {
    const count = priorTurns.length;
    if (
      count < 2 ||
      priorTurns[count - 1].role !== 'assistant' ||
      priorTurns[count - 2].role !== 'user'
    ) {
      return null;
    }
    const replyWas = priorTurns[count - 1].kind;
    if (replyWas !== undefined && replyWas !== replyKind) {
      return null;
    }
    return this.understand(priorTurns[count - 2].text, {
      bankSubjects,
      priorTurns: priorTurns.slice(0, count - 2),
    });
  }
}

function educationalKind(
  text: string,
): 'concept_explanation' | 'question_search' | 'solve_problem' | 'educational' {
  if (QUESTION_SEARCH.test(text)) {
    return 'question_search';
  }
  if (SOLVE_PROBLEM.test(text)) {
    return 'solve_problem';
  }
  if (CONCEPT_EXPLAIN.test(text)) {
    return 'concept_explanation';
  }
  return 'educational';
}

/**
 * Infer the current chat subject from filters and earlier turns.
 * New chats with empty priorTurns correctly return null.
 */
export function inferActiveSubject(
  priorTurns: ConversationTurn[],
  filterSubject: string | null | undefined,
  bankSubjects: string[],
): string | null {
  if (filterSubject && filterSubject.trim() && filterSubject.trim() !== 'All') {
    const hits = matchSubjectCatalogue(filterSubject.trim(), bankSubjects);
    if (hits[0]) {
      return hits[0].label;
    }
    return filterSubject.trim();
  }

  for (let index = priorTurns.length - 1; index >= 0; index -= 1) {
    const turn = priorTurns[index];
    // Our latest reply says which subject the chat is in. It is client
    // data, so only a subject that exists in the bank is accepted.
    if (turn.role === 'assistant' && turn.activeSubject !== undefined) {
      if (!turn.activeSubject) {
        return null;
      }
      const best = matchSubjectCatalogue(turn.activeSubject, bankSubjects)[0];
      return best?.kind === 'exact' ? best.label : null;
    }
    if (turn.role === 'user') {
      const hits = matchSubjectCatalogue(turn.text.trim(), bankSubjects);
      const best = hits[0];
      if (
        best &&
        (best.kind === 'exact' ||
          (best.kind === 'typo' && best.confidence >= 0.8))
      ) {
        return best.label;
      }
    }
  }
  return null;
}

/** Subjects the student actually named: exact, safe typo, or unambiguous prefix. */
function reliableSubjectsIn(text: string, bankSubjects: string[]): string[] {
  const found: string[] = [];
  const tokens = text.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const token of tokens) {
    const best = matchSubjectCatalogue(token, bankSubjects)[0];
    if (!best) {
      continue;
    }
    const prefixOk =
      best.kind === 'prefix' &&
      (cataloguePrefixes(catalogueOf(bankSubjects)).has(token) ||
        token.length >= 4);
    if (
      best.kind === 'exact' ||
      (best.kind === 'typo' && best.confidence >= 0.8) ||
      prefixOk
    ) {
      if (!found.includes(best.label)) {
        found.push(best.label);
      }
    }
  }
  return found;
}

function unambiguousPrefixHit(
  text: string,
  bankSubjects: string[],
): SubjectHit | null {
  const token = text.trim().toLowerCase();
  if (!/^[a-z]{3,8}$/.test(token)) {
    return null;
  }
  const hits = matchSubjectCatalogue(token, bankSubjects).filter(
    (hit) => hit.kind === 'prefix',
  );
  if (hits.length !== 1) {
    return null;
  }
  if (!(
    cataloguePrefixes(catalogueOf(bankSubjects)).has(token) || token.length >= 4
  )) {
    return null;
  }
  return hits[0];
}

function isExactSubjectMessage(text: string, bankSubjects: string[]): boolean {
  const token = text.trim();
  if (!/^[A-Za-z]{2,20}$/.test(token)) {
    return false;
  }
  const best = matchSubjectCatalogue(token, bankSubjects)[0];
  return (
    best?.kind === 'exact' || (best?.kind === 'typo' && best.confidence >= 0.8)
  );
}

function isPureSubjectSwitch(text: string): boolean {
  return /^(?:please\s+)?(?:change|switch)\s+(?:to|into)\s+[a-z]+[\s!.?]*$/i.test(
    text.trim(),
  );
}

function stripSubjectCues(text: string): string {
  return text
    .replace(
      /\b(?:please\s+)?(?:change|switch)\s+(?:to|into)\s+[a-z]+\b/gi,
      ' ',
    )
    .replace(/\b(?:in|for|subject)\s+[a-z]+\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeSubjectSwitch(text: string, bankSubjects: string[]): boolean {
  const hits = matchSubjectCatalogue(text.trim(), bankSubjects);
  const best = hits[0];
  if (!best) {
    return false;
  }
  return (
    best.kind === 'exact' ||
    (best.kind === 'typo' && best.confidence >= 0.8) ||
    (best.kind === 'prefix' &&
      best.confidence >= 0.7 &&
      text.trim().length <= 8)
  );
}

function understandWithinSubject(
  original: string,
  spelled: string,
  corrections: QueryCorrection[],
  activeSubject: string,
  bankSubjects: string[],
): UnderstoodQuery | null {
  if (looksLikeMathExpression(spelled)) {
    const corrected = enrichWithSubject(
      normalizeMathPhrase(spelled),
      activeSubject,
    );
    return baseResult(original, corrected, 'academic', {
      kind: 'concept_explanation',
      confidence: 0.82,
      activeSubject,
      corrections,
    });
  }

  // Short in-subject topic with no question shape.
  if (classifyQueryIntent(spelled, bankSubjects) === 'clarify') {
    return baseResult(original, spelled, 'clarify', {
      kind: 'clarification_needed',
      confidence: 0.7,
      needsClarification: true,
      activeSubject,
      corrections,
      guidanceMessage: `In ${activeSubject}, what about “${spelled}” would you like — a definition, a formula, or an exam-style question?`,
    });
  }

  return baseResult(
    original,
    enrichWithSubject(spelled, activeSubject),
    'academic',
    {
      kind: educationalKind(spelled),
      confidence: 0.85,
      activeSubject,
      corrections,
    },
  );
}

export function looksLikeMathExpression(text: string): boolean {
  const t = text.trim();
  if (/[θπ√∫^_{}=]|10\^\{|H_\d|C\d/i.test(t)) {
    return true;
  }
  if (
    /^(?:sin|cos|tan|sec|cosec|cot|log|ln)\s*(?:θ|theta|x|a|b|\([^)]+\))$/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\b(?:theta|alpha|beta|gamma)\b/i.test(t) && t.split(/\s+/).length <= 4) {
    return true;
  }
  return false;
}

function normalizeMathPhrase(text: string): string {
  return text
    .replace(/\btheta\b/gi, 'θ')
    .replace(/\bsine\b/gi, 'sin')
    .replace(/\bcosine\b/gi, 'cos')
    .replace(/\btangent\b/gi, 'tan');
}

export function enrichWithSubject(
  query: string,
  subject: string | null,
): string {
  if (!subject) {
    return query;
  }
  if (new RegExp(`\\b${escapeRegExp(subject)}\\b`, 'i').test(query)) {
    return query;
  }
  return `${subject}: ${query}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function baseResult(
  original: string,
  corrected: string,
  intent: QueryIntent,
  extra: Partial<UnderstoodQuery>,
): UnderstoodQuery {
  return {
    original,
    normalized: basicNormalize(original),
    corrected,
    intent,
    kind: 'clarify',
    confidence: 0.5,
    needsClarification: false,
    suggestedSubjects: [],
    activeSubject: null,
    corrections: [],
    guidanceMessage: null,
    ...extra,
  };
}

export function basicNormalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/[ \t\f\v]+/g, ' ');
}

function isEmptyOrUnusable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') {
    return true;
  }
  if (/^[^\p{L}\p{N}]+$/u.test(trimmed)) {
    return true;
  }
  return false;
}

/** Consonant soup / keyboard mash — never map to nearest subject. */
export function looksLikeGibberish(
  text: string,
  bankSubjects: string[] = [],
): boolean {
  const token = text.trim().toLowerCase();
  if (!/^[a-z]{4,20}$/.test(token)) {
    return false;
  }
  const vowels = (token.match(/[aeiou]/g) ?? []).length;
  const vowelRatio = vowels / token.length;
  if (vowelRatio >= 0.25) {
    return false;
  }
  // A near subject name is a typo, not keyboard mash.
  if (
    matchSubjectCatalogue(token, bankSubjects).some((h) => h.confidence >= 0.55)
  ) {
    return false;
  }
  return true;
}

function isShortSubjectCandidate(text: string): boolean {
  const t = text.trim();
  if (!/^[A-Za-z]{2,14}$/.test(t)) {
    return false;
  }
  return true;
}

/**
 * Ask which subject a topic belongs to. `foundIn` means the subjects are
 * the ones whose papers cover the topic; otherwise they are all the bank has.
 */
export function topicSubjectQuestion(
  topic: string,
  subjects: string[],
  foundIn = false,
): string {
  const list = joinNames(uniqueSubjects(subjects));
  if (foundIn && list) {
    return `“${topic}” comes up in ${list}. Which subject is this for?`;
  }
  return list
    ? `Which subject is “${topic}” for? Available subjects right now: ${list}.`
    : `Which subject is “${topic}” for?`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function applySpellingFixes(
  text: string,
  bankSubjects: string[],
): { text: string; corrections: QueryCorrection[] } {
  if (text === '') {
    return { text, corrections: [] };
  }
  const corrections: QueryCorrection[] = [];
  // Only subject names are corrected here. Topic misspellings are left to
  // the embedding search and the model, not to a list of known phrases.
  const next = text.replace(/\b[A-Za-z']+\b/g, (token) => {
    if (shouldPreserveToken(token)) {
      return token;
    }
    const lower = token.toLowerCase();
    // Rewrite only a close miss of a real catalogue subject, not a topic list.
    const hits = matchSubjectCatalogue(lower, bankSubjects).filter(
      (h) => h.kind === 'typo' && h.confidence >= 0.8,
    );
    if (hits[0]) {
      const label = preserveCase(token, hits[0].label);
      corrections.push({ from: token, to: label });
      return label;
    }
    return token;
  });

  return { text: basicNormalize(next), corrections };
}

function shouldPreserveToken(token: string): boolean {
  if (token.length <= 2) {
    return true;
  }
  if (/\d/.test(token)) {
    return true;
  }
  if (/[\^_{}√]/.test(token)) {
    return true;
  }
  if (/^(?:q|Q)\d+[a-zA-Z]?$/.test(token)) {
    return true;
  }
  return false;
}

/**
 * Conservative catalogue match:
 * - exact alias
 * - edit-distance typo (token length ≥ 4, distance ≤ 2)
 * - prefix of a subject (token length ≥ 3) → suggestion, not silent rewrite
 * Never maps random gibberish to the nearest subject.
 */
export function matchSubjectCatalogue(
  text: string,
  bankSubjects: string[],
): SubjectHit[] {
  const token = text.trim().toLowerCase();
  if (token.length < 2) {
    return [];
  }
  const catalog = catalogueOf(bankSubjects);
  const prefixes = cataloguePrefixes(catalog);
  const hits: SubjectHit[] = [];

  for (const label of catalog) {
    const aliases = subjectAliases(label);
    const primary = label.trim().toLowerCase();
    for (const alias of aliases) {
      if (token === alias) {
        hits.push({ label, confidence: 1, kind: 'exact' });
        continue;
      }
      // Prefix suggestions: phy→Physics, chem→Chemistry.
      // Never treat topic tokens like "sin" as a subject prefix of "Science".
      if (
        token.length >= 3 &&
        alias.startsWith(token) &&
        token !== alias &&
        token.length / alias.length >= 0.35 &&
        (token.length >= 4 || prefixes.has(token))
      ) {
        const conf = Math.min(0.88, 0.5 + (token.length / alias.length) * 0.45);
        hits.push({ label, confidence: conf, kind: 'prefix' });
        continue;
      }
    }
    // Typos only against the full subject label (avoid "mass"≈"math").
    if (token.length >= 4 && primary.length >= 6) {
      const distance = editDistance(token, primary);
      if (distance > 0 && distance <= 2) {
        hits.push({
          label,
          confidence: distance === 1 ? 0.92 : 0.8,
          kind: 'typo',
        });
      }
    }
  }

  const byLabel = new Map<string, SubjectHit>();
  for (const hit of hits) {
    const prev = byLabel.get(hit.label);
    if (!prev || hit.confidence > prev.confidence) {
      byLabel.set(hit.label, hit);
    }
  }
  return [...byLabel.values()].sort((a, b) => b.confidence - a.confidence);
}

/** Subjects come only from the question bank; none means none. */
function catalogueOf(bankSubjects: string[]): string[] {
  return uniqueSubjects(bankSubjects);
}

/** 3-letter prefixes of the live catalogue, never trig stems. */
function cataloguePrefixes(catalog: string[]): Set<string> {
  const prefixes = new Set<string>();
  for (const label of catalog) {
    const word = label.toLowerCase().split(/\s+/)[0] ?? '';
    if (word.length < 5) {
      continue;
    }
    const stem = word.slice(0, 3);
    if (!TOPIC_STEMS.has(stem)) {
      prefixes.add(stem);
    }
  }
  return prefixes;
}

function uniqueSubjects(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function preserveCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original.length > 1) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export function editDistance(a: string, b: string): number {
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

function lastAssistantText(turns: ConversationTurn[]): string | null {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].role === 'assistant' && turns[i].text.trim()) {
      return turns[i].text.trim();
    }
  }
  return null;
}

function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, ' ').trim();
  if (one.length <= max) {
    return one;
  }
  return `${one.slice(0, max).trim()}…`;
}

function subjectSuggestionReply(best: string, bankSubjects: string[]): string {
  const list = uniqueSubjects(bankSubjects).slice(0, 4);
  const options =
    list.length > 0 ? list.join(', ') : 'Physics, Chemistry or Mathematics';
  return [`Did you mean ${best}?`, `I can help you with ${options}.`].join(
    '\n\n',
  );
}

function subjectConfirmedReply(
  subject: string,
  bankSubjects: string[],
): string {
  const hint =
    bankSubjects.length > 0
      ? ` Available subjects right now: ${uniqueSubjects(bankSubjects).join(', ')}.`
      : '';
  return [
    `Happy to help with ${subject}.`,
    `What would you like to focus on — a topic, a formula, or a specific question?${hint}`,
  ].join('\n\n');
}

function gibberishReply(bankSubjects: string[]): string {
  const list = uniqueSubjects(bankSubjects).slice(0, 4);
  const options =
    list.length > 0
      ? ` Try a subject like ${list.join(', ')}, or ask a full question.`
      : ' Try naming a subject or asking a full question.';
  return `I couldn't understand that message.${options}`;
}
