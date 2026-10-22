import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { firstTurnDecisionEnabled } from '../config/env.validation';
import {
  AnswerModelService,
  type ConversationDecision,
  type Transformation,
} from './answer-model.service';
import {
  CitedSource,
  RELATED_SCORE,
  assessQuotes,
  selectRelevantSources,
} from './quote-check';
import {
  clarifyIntentReply,
  fallbackCapabilitiesFromBank,
  looksLikeEducationalRequest,
  quietGreeting,
  NOT_IN_PAPERS,
  OUTSIDE_SCOPE,
  UNSUPPORTED_KNOWLEDGE,
} from './query-intent';
import {
  enrichWithSubject,
  QueryUnderstandingService,
  topicSubjectQuestion,
  type ConversationTurn,
  type UnderstoodQuery,
} from './query-understanding.service';
import { QuestionsService } from './questions.service';
import { SearchHit } from './questions.repository';

const NOT_FOLLOWED =
  "Sorry, I didn't catch what you'd like me to do with that. Could you type it as a full question?";
const SOCIAL_REPLY = 'Happy to help! What would you like to study next?';

export type AnswerOrigin =
  | 'knowledge_base'
  | 'general'
  | 'guidance'
  | 'transformed'
  /** A list of real past-paper questions on a topic, not an answer. */
  | 'paper_questions'
  | null;

export type AnswerResponse = {
  status: 'answered' | 'insufficient' | 'out_of_scope' | 'guidance';
  answer: string;
  explanation: string | null;
  sources: CitedSource[];
  /** Where the student-facing prose came from (never invent paper sources). */
  answerOrigin?: AnswerOrigin;
  /** Set when answerOrigin is 'transformed'. */
  transformation?: Transformation;
};

export type AnswerWithHits = {
  response: AnswerResponse;
  related: SearchHit[];
  /** Understanding layer — original is never overwritten for history. */
  understanding?: {
    original: string;
    corrected: string;
    intent: string;
    kind?: string;
    confidence?: number;
    needsClarification?: boolean;
    suggestedSubjects?: string[];
    activeSubject?: string | null;
    topic?: string | null;
  };
};

type UnderstandingMeta = NonNullable<AnswerWithHits['understanding']>;

/**
 * Rule results that may depend on the conversation. Greetings, gibberish,
 * empty or oversized input, out-of-scope asks, subject picks and topic
 * probes stay with the rules and never cost a model call.
 */
const DECIDABLE_KINDS = new Set<UnderstoodQuery['kind']>([
  'follow_up',
  'clarification_needed',
  'concept_explanation',
  'question_search',
  'solve_problem',
  'educational',
]);

@Injectable()
export class AnswersService {
  constructor(
    private readonly questions: QuestionsService,
    private readonly model: AnswerModelService,
    private readonly understanding: QueryUnderstandingService,
  ) {}

  async answer(body: unknown): Promise<AnswerResponse> {
    return (await this.answerWithHits(body)).response;
  }

  async answerWithHits(body: unknown): Promise<AnswerWithHits> {
    const original = queryOf(body);
    const bankSubjects = await this.bankSubjectsSafe();
    const priorTurns = priorTurnsOf(body);
    const understood = this.understanding.understand(original, {
      bankSubjects,
      priorTurns,
      filterSubject: subjectOf(body),
    });
    const query = understood.corrected;
    const intent = understood.intent;
    const meta: UnderstandingMeta = {
      original: understood.original,
      corrected: understood.corrected,
      intent: understood.intent,
      kind: understood.kind,
      confidence: understood.confidence,
      needsClarification: understood.needsClarification,
      suggestedSubjects: understood.suggestedSubjects,
      activeSubject: understood.activeSubject,
      topic: understood.topic ?? null,
    };

    const decideNow = needsDecision(
      understood,
      priorTurns,
      firstTurnDecisionEnabled(),
    );
    if (decideNow) {
      // An outage is not swallowed: the answer itself needs the same model,
      // so the student gets an honest "temporarily unavailable".
      const decision = await this.model.decide(
        original,
        priorTurns,
        bankSubjects,
      );
      const routed = decision
        ? await this.followDecision(
            body,
            decision,
            priorTurns,
            bankSubjects,
            meta,
          )
        : null;
      if (routed) {
        return routed;
      }
      // Invalid decision mid-chat (rare with a strict schema). The rules'
      // follow_up path already reads the previous answer; anything else
      // ("make it shorter") could become a subject question or a search for
      // the literal words, so ask once instead.
      if (priorTurns.length > 0 && understood.kind !== 'follow_up') {
        return guidance(NOT_FOLLOWED, {
          ...meta,
          kind: 'clarification_needed',
          needsClarification: true,
        });
      }
    }

    if (intent === 'greeting') {
      return guidance(quietGreeting(), meta);
    }
    if (intent === 'capabilities') {
      if (understood.guidanceMessage) {
        return guidance(understood.guidanceMessage, meta);
      }
      return {
        response: {
          ...(await this.capabilitiesReply(query)),
          answerOrigin: 'guidance',
        },
        related: [],
        understanding: meta,
      };
    }
    if (intent === 'clarify') {
      if (understood.topic && !understood.activeSubject) {
        return this.answerLoneTopic(
          body,
          understood.topic,
          bankSubjects,
          priorTurns,
          meta,
          !decideNow,
        );
      }
      return guidance(
        understood.guidanceMessage ?? clarifyIntentReply(query, bankSubjects),
        meta,
      );
    }

    // What the student is asking about. A bare "physics" that completes an
    // earlier "magnitude" is about magnitude, not the word physics.
    const asked = understood.topic ?? original;
    return this.answerFromPapers(
      body,
      asked,
      query,
      understood.activeSubject,
      bankSubjects,
      meta,
    );
  }

  /**
   * A topic with no subject ("mass"). The bank decides instead of a word
   * list: one subject covers it → answer there; several → ask among those.
   * When no paper mentions it, the rules have no signal left ("thanks bro"
   * is not a topic), so the model reads it — unless it already did.
   * Without a usable decision, ask with every bank subject.
   */
  private async answerLoneTopic(
    body: unknown,
    topic: string,
    bankSubjects: string[],
    priorTurns: ConversationTurn[],
    meta: UnderstandingMeta,
    mayDecide: boolean,
  ): Promise<AnswerWithHits> {
    const subjects = await this.subjectsMentioningSafe(topic);
    if (subjects.length === 0 && mayDecide) {
      const routed = await this.decideUncovered(
        body,
        bankSubjects,
        priorTurns,
        meta,
      );
      if (routed) {
        return routed;
      }
    }
    if (subjects.length === 1) {
      const [subject] = subjects;
      const query = enrichWithSubject(`What is ${topic}?`, subject);
      return this.answerFromPapers(body, topic, query, subject, bankSubjects, {
        ...meta,
        corrected: query,
        intent: 'academic',
        kind: 'concept_explanation',
        needsClarification: false,
        activeSubject: subject,
      });
    }
    return guidance(
      subjects.length > 1
        ? topicSubjectQuestion(topic, subjects, true)
        : topicSubjectQuestion(topic, bankSubjects),
      {
        ...meta,
        suggestedSubjects: subjects.length > 1 ? subjects : bankSubjects,
      },
    );
  }

  /**
   * Acts on a validated decision. Returns null to let the rule-based
   * pipeline answer instead (for example when the model declines).
   */
  private async followDecision(
    body: unknown,
    decision: ConversationDecision,
    priorTurns: ConversationTurn[],
    bankSubjects: string[],
    meta: UnderstandingMeta,
  ): Promise<AnswerWithHits | null> {
    if (decision.action === 'transform_previous') {
      return decision.transformation === 'none'
        ? null
        : this.transformPrevious(decision.transformation, priorTurns, meta);
    }

    if (decision.action === 'out_of_scope') {
      return outsideScope({ ...meta, kind: 'out_of_scope' });
    }

    if (decision.action === 'social') {
      return guidance(SOCIAL_REPLY, { ...meta, kind: 'greeting' });
    }

    if (decision.action === 'find_questions') {
      return decision.standaloneQuery
        ? this.paperQuestions(
            body,
            decision.standaloneQuery,
            subjectOf(body) ?? decision.subject,
            meta,
          )
        : null;
    }

    if (decision.action === 'clarify') {
      const alreadyAsked =
        priorTurns.at(-1)?.role === 'assistant' &&
        priorTurns.at(-1)?.kind === 'clarification_needed';
      if (!alreadyAsked && decision.clarifyQuestion) {
        return guidance(decision.clarifyQuestion, {
          ...meta,
          kind: 'clarification_needed',
          needsClarification: true,
        });
      }
      // Asked once already: go with the best reading rather than loop.
      if (!decision.standaloneQuery) {
        return null;
      }
    }

    const standalone = decision.standaloneQuery;
    if (!standalone) {
      return null;
    }
    // An explicit filter wins; otherwise the subject the question belongs to,
    // so a new topic does not inherit the previous one.
    const subject = subjectOf(body) ?? decision.subject;
    const query = enrichWithSubject(standalone, subject);
    return this.answerFromPapers(
      body,
      standalone,
      query,
      subject,
      bankSubjects,
      {
        ...meta,
        corrected: query,
        intent: 'academic',
        kind:
          meta.kind === 'clarification_needed' || meta.kind === 'follow_up'
            ? 'educational'
            : meta.kind,
        needsClarification: false,
        activeSubject: subject,
      },
    );
  }

  /**
   * Real past-paper questions on a topic ("show related exam questions").
   * Same search and the same topic-word check as an answer, so a high score
   * alone never lists an unrelated question. None found → say so; the
   * practice-questions suggestion is offered instead of inventing any.
   */
  private async paperQuestions(
    body: unknown,
    topic: string,
    subject: string | null,
    meta: UnderstandingMeta,
  ): Promise<AnswerWithHits> {
    const query = enrichWithSubject(topic, subject);
    const { results } = await this.questions.search(
      withQueryAndSubject(body, query, subject),
    );
    const related = relatedHits(results);
    const found = selectRelevantSources(
      topic,
      query,
      related.map((hit) => ({
        id: hit.id,
        questionText: hit.questionText,
        pageReference: hit.pageReference,
        score: hit.score,
      })),
    );
    return {
      response: {
        status: 'insufficient',
        answer:
          found.length > 0
            ? `Questions from your exam papers on “${topic}”:`
            : `I couldn't find past-paper questions on “${topic}” in your exam archive. You can ask for practice questions instead.`,
        explanation: null,
        sources: found,
        answerOrigin: 'paper_questions',
      },
      related,
      understanding: {
        ...meta,
        corrected: query,
        intent: 'academic',
        kind: 'question_search',
        needsClarification: false,
        activeSubject: subject,
        topic,
      },
    };
  }

  /**
   * Shorter / simpler / example / more detail of the previous answer.
   * No new search: the cited questions are reloaded from the database, so
   * only real, ready rows are shown, and the text is labelled as rewritten.
   */
  private async transformPrevious(
    transformation: Transformation,
    priorTurns: ConversationTurn[],
    meta: UnderstandingMeta,
  ): Promise<AnswerWithHits | null> {
    const previous = priorTurns.findLast((turn) => turn.role === 'assistant');
    if (!previous) {
      return null;
    }
    const hits = await this.questions.findReadyByIds(previous.sourceIds ?? []);
    const answer = await this.model.transform(
      transformation,
      previous.text,
      hits.map((hit) => ({ id: hit.id, questionText: hit.questionText })),
    );
    if (!answer) {
      return null;
    }
    return {
      response: {
        status: 'answered',
        answer,
        explanation: null,
        sources: hits.map((hit) => ({
          id: hit.id,
          questionText: hit.questionText,
          pageReference: hit.pageReference,
          score: hit.score,
        })),
        answerOrigin: 'transformed',
        transformation,
      },
      related: hits,
      understanding: {
        ...meta,
        intent: 'academic',
        kind: 'follow_up',
        needsClarification: false,
      },
    };
  }

  /**
   * Search the approved papers for `query`, then answer from verified quotes
   * or a labelled general explanation. `asked` is the student's topic and is
   * what sources must actually share; the score alone never cites a paper.
   */
  private async answerFromPapers(
    body: unknown,
    asked: string,
    query: string,
    activeSubject: string | null,
    bankSubjects: string[],
    meta: UnderstandingMeta,
  ): Promise<AnswerWithHits> {
    const searchBody = withQueryAndSubject(body, query, activeSubject);
    const { results } = await this.questions.search(searchBody);
    const related = relatedHits(results);
    if (related.length === 0) {
      const response = await this.missingEvidenceReply(
        asked,
        query,
        bankSubjects,
      );
      return {
        response,
        related,
        understanding: {
          ...meta,
          kind:
            response.answer === OUTSIDE_SCOPE
              ? 'out_of_scope'
              : looksLikeEducationalRequest(asked, bankSubjects) ||
                  looksLikeEducationalRequest(query, bankSubjects)
                ? 'unsupported_knowledge'
                : meta.kind,
        },
      };
    }

    const excerpts = related.map((hit) => ({
      id: hit.id,
      questionText: hit.questionText,
    }));
    const proposal = await this.model.proposeQuotes(query, excerpts);
    const decision = assessQuotes(
      proposal,
      related.map((hit) => ({
        id: hit.id,
        questionText: hit.questionText,
        pageReference: hit.pageReference,
        score: hit.score,
      })),
    );
    const explanation =
      decision.status === 'insufficient'
        ? await this.explainSafe(query, excerpts)
        : null;
    // Score alone never becomes a cited paper. Insufficient hits stay only
    // when they share a real topic word with the student's own message.
    const sources =
      decision.status === 'insufficient'
        ? selectRelevantSources(asked, query, decision.sources)
        : decision.sources;
    return {
      response: {
        ...decision,
        sources,
        explanation,
        answerOrigin:
          decision.status === 'answered'
            ? 'knowledge_base'
            : explanation
              ? 'general'
              : null,
      },
      related,
      understanding: meta,
    };
  }

  /**
   * No retrieval hit ≥ RELATED_SCORE.
   * Educational asks → unsupported knowledge (+ optional labelled general explain).
   * Unrelated asks → out_of_scope (no fabricated paper sources).
   */
  private async missingEvidenceReply(
    original: string,
    query: string,
    bankSubjects: string[],
  ): Promise<AnswerResponse> {
    const educational =
      looksLikeEducationalRequest(original, bankSubjects) ||
      looksLikeEducationalRequest(query, bankSubjects);
    if (!educational) {
      return {
        status: 'out_of_scope',
        answer: OUTSIDE_SCOPE,
        explanation: null,
        sources: [],
        answerOrigin: null,
      };
    }
    let explanation: string | null;
    try {
      explanation = await this.model.explain(query, []);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) {
        throw error;
      }
      // Model down: the topic may well be valid, so do not call it unrelated.
      return {
        status: 'out_of_scope',
        answer: UNSUPPORTED_KNOWLEDGE,
        explanation: null,
        sources: [],
        answerOrigin: null,
      };
    }
    if (!explanation) {
      // The model declined because it is not a study question at all
      // (sports, celebrities…). Say so instead of offering a "concept".
      return outsideScope().response;
    }
    return {
      status: 'out_of_scope',
      answer: NOT_IN_PAPERS,
      explanation,
      sources: [],
      answerOrigin: 'general',
    };
  }

  private async capabilitiesReply(query: string): Promise<AnswerResponse> {
    const samples = await this.samplesSafe();
    const bankSubjects = await this.bankSubjectsSafe();
    try {
      const answer = await this.model.describeCapabilities(
        query,
        samples,
        bankSubjects,
      );
      return {
        status: 'guidance',
        answer,
        explanation: null,
        sources: [],
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return {
          status: 'guidance',
          answer: fallbackCapabilitiesFromBank(bankSubjects, samples),
          explanation: null,
          sources: [],
        };
      }
      throw error;
    }
  }

  private async samplesSafe(): Promise<
    Array<{ questionText: string; subject: string }>
  > {
    try {
      return await this.questions.sampleReadyQuestions(8);
    } catch {
      return [];
    }
  }

  private async bankSubjectsSafe(): Promise<string[]> {
    try {
      const filters = await this.questions.filters();
      return filters.subjects.map((s) => s.value);
    } catch {
      return [];
    }
  }

  /**
   * Model reading of a short message no paper mentions. Here an outage only
   * costs the nicer reply: asking for the subject still works without it.
   */
  private async decideUncovered(
    body: unknown,
    bankSubjects: string[],
    priorTurns: ConversationTurn[],
    meta: UnderstandingMeta,
  ): Promise<AnswerWithHits | null> {
    let decision: ConversationDecision | null;
    try {
      decision = await this.model.decide(
        meta.original,
        priorTurns,
        bankSubjects,
      );
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return null;
      }
      throw error;
    }
    return decision
      ? this.followDecision(body, decision, priorTurns, bankSubjects, meta)
      : null;
  }

  /** A failed lookup only means the student is asked for the subject. */
  private async subjectsMentioningSafe(topic: string): Promise<string[]> {
    try {
      return await this.questions.subjectsMentioning(topic);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return [];
      }
      throw error;
    }
  }

  private async explainSafe(
    query: string,
    excerpts: Array<{ id: string; questionText: string }>,
  ): Promise<string | null> {
    try {
      return await this.model.explain(query, excerpts);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return null;
      }
      throw error;
    }
  }
}

function needsDecision(
  understood: UnderstoodQuery,
  priorTurns: ConversationTurn[],
  firstTurnDecision: boolean,
): boolean {
  const hasHistory = priorTurns.some((turn) => turn.role === 'assistant');
  if (!hasHistory && !firstTurnDecision) {
    return false;
  }
  // "magnitude" → "physics" is already resolved by the rules.
  if (understood.intent === 'academic' && understood.topic) {
    return false;
  }
  return DECIDABLE_KINDS.has(understood.kind);
}

/** Unrelated to studying: no search, no citation, out_of_scope status. */
function outsideScope(meta?: UnderstandingMeta): AnswerWithHits {
  return {
    response: {
      status: 'out_of_scope',
      answer: OUTSIDE_SCOPE,
      explanation: null,
      sources: [],
      answerOrigin: null,
    },
    related: [],
    understanding: meta,
  };
}

function guidance(answer: string, meta: UnderstandingMeta): AnswerWithHits {
  return {
    response: {
      status: 'guidance',
      answer,
      explanation: null,
      sources: [],
      answerOrigin: 'guidance',
    },
    related: [],
    understanding: meta,
  };
}

function relatedHits(results: SearchHit[]): SearchHit[] {
  if (results.length === 0 || results[0].score < RELATED_SCORE) {
    return [];
  }
  return results.filter((hit) => hit.score >= RELATED_SCORE);
}

function queryOf(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'query' in body) {
    const query = (body as { query?: unknown }).query;
    if (typeof query === 'string') {
      return query;
    }
  }
  return '';
}

function priorTurnsOf(body: unknown): ConversationTurn[] {
  if (typeof body !== 'object' || body === null || !('priorTurns' in body)) {
    return [];
  }
  const raw = (body as { priorTurns?: unknown }).priorTurns;
  if (!Array.isArray(raw)) {
    return [];
  }
  const turns: ConversationTurn[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const { role, text, sourceIds, kind, activeSubject } = item as {
      role?: unknown;
      text?: unknown;
      sourceIds?: unknown;
      kind?: unknown;
      activeSubject?: unknown;
    };
    if (
      (role === 'user' || role === 'assistant') &&
      typeof text === 'string' &&
      text.trim()
    ) {
      turns.push({
        role,
        text: text.trim(),
        // Ids are re-checked by the repository; these are only candidates.
        ...(Array.isArray(sourceIds)
          ? {
              sourceIds: sourceIds.filter(
                (id): id is string => typeof id === 'string',
              ),
            }
          : {}),
        ...(typeof kind === 'string' ? { kind } : {}),
        // Checked against the bank before it is used as a subject.
        ...(typeof activeSubject === 'string' || activeSubject === null
          ? { activeSubject }
          : {}),
      });
    }
  }
  return turns;
}

function subjectOf(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'subject' in body) {
    const subject = (body as { subject?: unknown }).subject;
    if (typeof subject === 'string' && subject.trim()) {
      return subject.trim();
    }
  }
  return null;
}

function withQueryAndSubject(
  body: unknown,
  query: string,
  activeSubject: string | null,
): unknown {
  const base: Record<string, unknown> =
    typeof body === 'object' && body !== null
      ? { ...(body as Record<string, unknown>), query }
      : { query };
  const existing = base.subject;
  if (
    activeSubject &&
    (existing === undefined || existing === null || existing === '')
  ) {
    return { ...base, subject: activeSubject };
  }
  return base;
}
