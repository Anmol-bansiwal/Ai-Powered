import { ServiceUnavailableException } from '@nestjs/common';
import { SUGGESTIONS } from '../chat/chat-markdown';
import { Difficulty, QuestionType } from '../generated/prisma/enums';
import {
  AnswerModelService,
  type ConversationDecision,
} from './answer-model.service';
import { AnswersService } from './answers.service';
import { QueryUnderstandingService } from './query-understanding.service';
import { SearchHit } from './questions.repository';
import { QuestionsService } from './questions.service';

/**
 * Whole conversations through AnswersService with the database and the
 * model mocked. The student messages are test inputs, not production rules:
 * routing comes from the (mocked) decision, never from a phrase list.
 */
describe('multi-turn conversations', () => {
  const INERTIA_ID = '3f1c2a9e-8b7d-4c6e-9a5f-1b2c3d4e5f60';
  const FORGED_ID = '00000000-0000-4000-8000-000000000000';

  const search = jest.fn();
  const findReadyByIds = jest.fn();
  const subjectsMentioning = jest.fn();
  const decide = jest.fn();
  const transform = jest.fn();
  const proposeQuotes = jest.fn();
  const explain = jest.fn();

  const service = new AnswersService(
    {
      search,
      findReadyByIds,
      subjectsMentioning,
      sampleReadyQuestions: jest.fn().mockResolvedValue([]),
      filters: jest.fn().mockResolvedValue({
        subjects: [
          { value: 'Chemistry' },
          { value: 'Mathematics' },
          { value: 'Physics' },
        ],
        years: [],
        difficulties: [],
        timePeriods: [],
        total: 3,
      }),
    } as unknown as QuestionsService,
    {
      decide,
      transform,
      proposeQuotes,
      explain,
      describeCapabilities: jest.fn(),
    } as unknown as AnswerModelService,
    new QueryUnderstandingService(),
  );

  const inertiaChat = [
    { role: 'user', text: 'What is inertia?' },
    {
      role: 'assistant',
      text: 'Inertia is the tendency of a body to resist a change in its state of rest or motion.',
      sourceIds: [INERTIA_ID, FORGED_ID],
      kind: 'concept_explanation',
    },
  ];
  const co2Chat = [
    { role: 'user', text: 'CO2' },
    {
      role: 'assistant',
      text: 'Carbon dioxide (CO_{2}) is a gas made of one carbon and two oxygen atoms.',
      kind: 'concept_explanation',
    },
  ];

  function decided(overrides: Partial<ConversationDecision>) {
    decide.mockResolvedValue({
      action: 'new_question',
      transformation: 'none',
      standaloneQuery: null,
      subject: null,
      clarifyQuestion: null,
      ...overrides,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks keeps resolved values; reset the decision explicitly.
    decide.mockReset().mockResolvedValue(null);
    search.mockResolvedValue({ results: [] });
    findReadyByIds.mockResolvedValue([inertiaHit()]);
    subjectsMentioning.mockReset().mockResolvedValue([]);
    transform.mockResolvedValue(
      'Inertia: a body resists changes to its motion.',
    );
    proposeQuotes.mockResolvedValue({ complete: false, quotes: [] });
    explain.mockResolvedValue('General explanation.');
  });

  describe('reworking the previous answer', () => {
    it.each([
      ['give me more brief answer about this', 'shorten'],
      ['explain it simply', 'simplify'],
      ['give me an example', 'example'],
      ['tell me more', 'explain_more'],
    ] as const)('"%s" → %s, without a new search', async (message, kind) => {
      decided({ action: 'transform_previous', transformation: kind });

      const result = await service.answerWithHits({
        query: message,
        priorTurns: inertiaChat,
      });

      expect(search).not.toHaveBeenCalled();
      expect(transform).toHaveBeenCalledWith(kind, inertiaChat[1].text, [
        { id: INERTIA_ID, questionText: inertiaHit().questionText },
      ]);
      expect(result.response).toMatchObject({
        status: 'answered',
        answerOrigin: 'transformed',
        transformation: kind,
        answer: 'Inertia: a body resists changes to its motion.',
      });
      expect(result.understanding?.original).toBe(message);
    });

    it('re-checks cited ids in the database and drops a forged one', async () => {
      decided({ action: 'transform_previous', transformation: 'shorten' });

      const result = await service.answerWithHits({
        query: 'make it shorter',
        priorTurns: inertiaChat,
      });

      expect(findReadyByIds).toHaveBeenCalledWith([INERTIA_ID, FORGED_ID]);
      expect(result.response.sources.map((source) => source.id)).toEqual([
        INERTIA_ID,
      ]);
    });

    it('falls back to the rules when the model declines to rework it', async () => {
      decided({ action: 'transform_previous', transformation: 'shorten' });
      transform.mockResolvedValue(null);

      const result = await service.answerWithHits({
        query: 'make it shorter',
        priorTurns: inertiaChat,
      });

      expect(result.response.answerOrigin).not.toBe('transformed');
    });
  });

  describe('resolving a short follow-up into a question', () => {
    it.each(['definition', 'defination'])(
      'CO2 → "%s" searches for the definition of CO2',
      async (message) => {
        decided({
          standaloneQuery: 'What is the definition of CO2?',
          subject: 'Chemistry',
        });

        const result = await service.answerWithHits({
          query: message,
          priorTurns: co2Chat,
        });

        expect(search).toHaveBeenCalledWith(
          expect.objectContaining({
            query: 'Chemistry: What is the definition of CO2?',
            subject: 'Chemistry',
          }),
        );
        expect(explain).toHaveBeenCalledWith(
          'Chemistry: What is the definition of CO2?',
          [],
        );
        expect(result.understanding).toMatchObject({
          original: message,
          corrected: 'Chemistry: What is the definition of CO2?',
          activeSubject: 'Chemistry',
        });
      },
    );

    it('keeps a matching paper when the student only typed "definition"', async () => {
      decided({
        standaloneQuery: 'What is the definition of CO2?',
        subject: 'Chemistry',
      });
      search.mockResolvedValue({
        results: [
          hit({
            id: 'co2',
            questionText: 'Name the gas CO2 released during respiration.',
            subject: 'Chemistry',
            score: 0.6,
          }),
        ],
      });

      const result = await service.answerWithHits({
        query: 'definition',
        priorTurns: co2Chat,
      });

      expect(result.response.sources.map((source) => source.id)).toEqual([
        'co2',
      ]);
    });

    it('does not carry Physics into an unrelated new topic', async () => {
      decided({ standaloneQuery: 'What is photosynthesis?', subject: null });

      await service.answerWithHits({
        query: 'What is photosynthesis?',
        priorTurns: [
          { role: 'user', text: 'physics' },
          {
            role: 'assistant',
            text: 'Happy to help with Physics.',
            kind: 'subject_selection',
          },
          ...inertiaChat,
        ],
      });

      const [[body]] = search.mock.calls as [[Record<string, unknown>]];
      expect(body.query).toBe('What is photosynthesis?');
      expect(body.subject).toBeUndefined();
    });

    it('lets an explicit subject filter win over the decided subject', async () => {
      decided({ standaloneQuery: 'What is CO2?', subject: 'Chemistry' });

      await service.answerWithHits({
        query: 'definition',
        subject: 'Physics',
        priorTurns: co2Chat,
      });

      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Physics' }),
      );
    });
  });

  describe('clarifying', () => {
    it('asks one question when the message cannot be resolved', async () => {
      decided({
        action: 'clarify',
        clarifyQuestion: 'Do you mean the formula or the definition?',
        standaloneQuery: 'What is the formula of CO2?',
      });

      const result = await service.answerWithHits({
        query: 'that one',
        priorTurns: co2Chat,
      });

      expect(search).not.toHaveBeenCalled();
      expect(result.response).toMatchObject({
        status: 'guidance',
        answer: 'Do you mean the formula or the definition?',
      });
      expect(result.understanding?.kind).toBe('clarification_needed');
    });

    it('does not ask twice in a row; it answers the best reading', async () => {
      decided({
        action: 'clarify',
        clarifyQuestion: 'Do you mean the formula or the definition?',
        standaloneQuery: 'What is the formula of CO2?',
      });

      const result = await service.answerWithHits({
        query: 'that one',
        priorTurns: [
          ...co2Chat,
          { role: 'user', text: 'that' },
          {
            role: 'assistant',
            text: 'Do you mean the formula or the definition?',
            kind: 'clarification_needed',
          },
        ],
      });

      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'What is the formula of CO2?' }),
      );
      expect(result.response.status).not.toBe('guidance');
    });
  });

  describe('when no decision is made', () => {
    it.each([
      ['hello', 'greeting'],
      ['gydrxg', 'unintelligible'],
    ])('"%s" with history stays with the rules (%s)', async (message) => {
      const result = await service.answerWithHits({
        query: message,
        priorTurns: inertiaChat,
      });

      expect(decide).not.toHaveBeenCalled();
      expect(search).not.toHaveBeenCalled();
      expect(result.response.status).toBe('guidance');
    });

    it('never calls the model to route a first message', async () => {
      await service.answerWithHits({ query: 'What is inertia?' });

      expect(decide).not.toHaveBeenCalled();
      expect(search).toHaveBeenCalled();
    });

    it('keeps magnitude → physics on the rules', async () => {
      await service.answerWithHits({
        query: 'physics',
        priorTurns: [
          { role: 'user', text: 'magnitude' },
          { role: 'assistant', text: 'Which subject is this for?' },
        ],
      });

      expect(decide).not.toHaveBeenCalled();
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'Physics: What is magnitude?' }),
      );
    });

    it.each(['make it shorter', 'explain it simply', 'give me an example'])(
      'asks once after an invalid decision for "%s" — no subject question, no search',
      async (message) => {
        decide.mockResolvedValue(null);

        const result = await service.answerWithHits({
          query: message,
          priorTurns: inertiaChat,
        });

        expect(transform).not.toHaveBeenCalled();
        expect(search).not.toHaveBeenCalled();
        expect(subjectsMentioning).not.toHaveBeenCalled();
        expect(result.response).toMatchObject({
          status: 'guidance',
          answer: expect.stringMatching(/full question/) as unknown,
        });
      },
    );

    it('reports an outage honestly instead of guessing', async () => {
      decide.mockRejectedValue(new ServiceUnavailableException());

      await expect(
        service.answerWithHits({
          query: 'make it shorter',
          priorTurns: inertiaChat,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(search).not.toHaveBeenCalled();
    });
  });

  describe('out of scope and confirmations', () => {
    it('answers an unrelated question without searching the papers', async () => {
      decided({ action: 'out_of_scope' });

      const result = await service.answerWithHits({
        query: 'Who won the World Cup?',
        priorTurns: inertiaChat,
      });

      expect(search).not.toHaveBeenCalled();
      expect(result.response).toMatchObject({
        status: 'out_of_scope',
        sources: [],
      });
    });

    it.each(['yes', 'Yes!', 'ok', 'yeah'])(
      'phy → Did you mean Physics? → "%s" picks Physics',
      async (answer) => {
        const result = await service.answerWithHits({
          query: answer,
          priorTurns: [
            { role: 'user', text: 'phy' },
            {
              role: 'assistant',
              text: 'Did you mean Physics?',
              kind: 'subject_suggestion',
            },
          ],
        });

        expect(decide).not.toHaveBeenCalled();
        expect(result.understanding).toMatchObject({
          kind: 'subject_selection',
          activeSubject: 'Physics',
        });
      },
    );

    it('treats "ok" as a greeting when nothing was suggested', async () => {
      const result = await service.answerWithHits({
        query: 'ok',
        priorTurns: inertiaChat,
      });

      expect(result.understanding?.kind).toBe('greeting');
    });
  });

  describe('follow-up suggestions: practice and related exam questions', () => {
    it('"Give me practice questions on this" reworks the answer into practice questions', async () => {
      decided({ action: 'transform_previous', transformation: 'practice' });
      transform.mockResolvedValue('1. Why do passengers lurch forward?');

      const result = await service.answerWithHits({
        query: 'Give me practice questions on this',
        priorTurns: inertiaChat,
      });

      expect(search).not.toHaveBeenCalled();
      expect(transform).toHaveBeenCalledWith('practice', inertiaChat[1].text, [
        { id: INERTIA_ID, questionText: inertiaHit().questionText },
      ]);
      expect(result.response).toMatchObject({
        answerOrigin: 'transformed',
        transformation: 'practice',
      });
      // The real past-paper question it was based on stays as a source.
      expect(result.response.sources.map((s) => s.id)).toEqual([INERTIA_ID]);
    });

    it('"Show related exam questions" lists matching paper questions only', async () => {
      decided({
        action: 'find_questions',
        standaloneQuery: 'inertia',
        subject: 'Physics',
      });
      search.mockResolvedValue({
        results: [
          hit({
            id: 'inertia-q',
            questionText: 'Define inertia and give one example.',
            score: 0.66,
          }),
          hit({
            id: 'cover',
            questionText: 'GENERAL INSTRUCTIONS. Write your candidate number.',
            score: 0.7,
          }),
        ],
      });

      const result = await service.answerWithHits({
        query: 'Related exam questions on this topic',
        priorTurns: inertiaChat,
      });

      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Physics: inertia',
          subject: 'Physics',
        }),
      );
      expect(proposeQuotes).not.toHaveBeenCalled();
      expect(explain).not.toHaveBeenCalled();
      expect(result.response).toMatchObject({
        status: 'insufficient',
        answerOrigin: 'paper_questions',
        answer: 'Questions from your exam papers on “inertia”:',
      });
      expect(result.response.sources.map((s) => s.id)).toEqual(['inertia-q']);
    });

    it.each(Object.values(SUGGESTIONS).map((s) => [s.label, s.prompt]))(
      'the "%s" chip reaches the model decision, not a rule',
      async (_label, prompt) => {
        await service.answerWithHits({
          query: prompt,
          priorTurns: inertiaChat,
        });

        expect(decide).toHaveBeenCalledWith(
          prompt,
          expect.any(Array),
          expect.any(Array),
        );
      },
    );

    it('says so when no paper question matches, instead of inventing one', async () => {
      decided({ action: 'find_questions', standaloneQuery: 'photosynthesis' });
      search.mockResolvedValue({ results: [] });

      const result = await service.answerWithHits({
        query: 'Related exam questions on this topic',
        priorTurns: inertiaChat,
      });

      expect(result.response.sources).toEqual([]);
      expect(result.response.answer).toMatch(
        /couldn't find past-paper questions on “photosynthesis”.*practice questions/,
      );
    });
  });

  describe('first-message routing flag (CHAT_FIRST_TURN_DECISION)', () => {
    const original = process.env.CHAT_FIRST_TURN_DECISION;
    afterEach(() => {
      if (original === undefined) {
        delete process.env.CHAT_FIRST_TURN_DECISION;
      } else {
        process.env.CHAT_FIRST_TURN_DECISION = original;
      }
    });

    it('does not call the model for a first message when off', async () => {
      delete process.env.CHAT_FIRST_TURN_DECISION;

      await service.answerWithHits({ query: 'Who won the World Cup?' });

      expect(decide).not.toHaveBeenCalled();
    });

    it('routes a first message the rules cannot place when on', async () => {
      process.env.CHAT_FIRST_TURN_DECISION = 'true';
      decided({ action: 'out_of_scope' });

      const result = await service.answerWithHits({
        query: 'Who won the World Cup?',
      });

      expect(decide).toHaveBeenCalledWith(
        'Who won the World Cup?',
        [],
        ['Chemistry', 'Mathematics', 'Physics'],
      );
      expect(search).not.toHaveBeenCalled();
      expect(result.response.status).toBe('out_of_scope');
    });

    it('still never calls the model for a greeting when on', async () => {
      process.env.CHAT_FIRST_TURN_DECISION = 'true';

      await service.answerWithHits({ query: 'hello' });

      expect(decide).not.toHaveBeenCalled();
    });
  });

  describe('a lone topic with no subject (the bank decides)', () => {
    it('answers in the only subject whose papers cover it', async () => {
      subjectsMentioning.mockResolvedValue(['Physics']);

      const result = await service.answerWithHits({ query: 'magnitude' });

      expect(subjectsMentioning).toHaveBeenCalledWith('magnitude');
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Physics: What is magnitude?',
          subject: 'Physics',
        }),
      );
      expect(result.response.status).not.toBe('guidance');
      expect(result.understanding?.activeSubject).toBe('Physics');
    });

    it('asks only among the subjects that cover it', async () => {
      subjectsMentioning.mockResolvedValue(['Physics', 'Chemistry']);

      const result = await service.answerWithHits({ query: 'mass' });

      expect(search).not.toHaveBeenCalled();
      expect(result.response).toMatchObject({
        status: 'guidance',
        answer:
          '“mass” comes up in Physics and Chemistry. Which subject is this for?',
      });
    });

    it.each([
      [
        'no paper covers it and the model has no usable reading',
        () => decide.mockResolvedValue(null),
      ],
      [
        'no paper covers it and the model is down',
        () => decide.mockRejectedValue(new ServiceUnavailableException()),
      ],
      [
        'the lookup fails',
        () =>
          subjectsMentioning.mockRejectedValue(
            new ServiceUnavailableException(),
          ),
      ],
    ])('asks with every bank subject when %s', async (_label, arrange) => {
      arrange();

      const result = await service.answerWithHits({ query: 'CO2' });

      expect(result.response.answer).toBe(
        'Which subject is “CO2” for? Available subjects right now: Chemistry, Mathematics and Physics.',
      );
    });

    it('lets the model read a short message no paper mentions ("thanks bro")', async () => {
      decided({ action: 'social' });

      const result = await service.answerWithHits({ query: 'thanks bro' });

      expect(subjectsMentioning).toHaveBeenCalledWith('thanks bro');
      expect(decide).toHaveBeenCalledWith(
        'thanks bro',
        [],
        ['Chemistry', 'Mathematics', 'Physics'],
      );
      expect(search).not.toHaveBeenCalled();
      expect(result.response.answer).toBe(
        'Happy to help! What would you like to study next?',
      );
      expect(result.understanding?.kind).toBe('greeting');
    });

    it('answers an uncovered topic the model reads as a study question', async () => {
      decided({
        standaloneQuery: 'What is CO2?',
        subject: 'Chemistry',
      });

      await service.answerWithHits({ query: 'CO2' });

      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Chemistry: What is CO2?',
          subject: 'Chemistry',
        }),
      );
    });

    it('never asks the model about a topic the papers cover', async () => {
      subjectsMentioning.mockResolvedValue(['Physics', 'Chemistry']);

      await service.answerWithHits({ query: 'mass' });

      expect(decide).not.toHaveBeenCalled();
    });

    it.each(['force', 'inertia', 'mole', 'sin', 'algebra'])(
      '"%s" alone is resolved by the bank, not by a topic word list',
      async (word) => {
        subjectsMentioning.mockResolvedValue(['Physics']);

        await service.answerWithHits({ query: word });

        expect(subjectsMentioning).toHaveBeenCalledWith(word);
        expect(search).toHaveBeenCalledWith(
          expect.objectContaining({
            query: `Physics: What is ${word}?`,
            subject: 'Physics',
          }),
        );
      },
    );

    it('still completes the topic when the student then names a subject', async () => {
      await service.answerWithHits({
        query: 'physics',
        priorTurns: [
          { role: 'user', text: 'mass' },
          {
            role: 'assistant',
            text: '“mass” comes up in Physics and Chemistry. Which subject is this for?',
            kind: 'clarification_needed',
          },
        ],
      });

      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'Physics: What is mass?' }),
      );
    });

    it('does not reuse a topic that was already answered', async () => {
      const result = await service.answerWithHits({
        query: 'physics',
        priorTurns: [
          { role: 'user', text: 'magnitude' },
          {
            role: 'assistant',
            text: 'Magnitude is the size of a quantity.',
            kind: 'concept_explanation',
            activeSubject: 'Physics',
          },
        ],
      });

      expect(search).not.toHaveBeenCalled();
      expect(result.understanding?.kind).toBe('subject_selection');
    });
  });

  function inertiaHit(): SearchHit {
    return hit({
      id: INERTIA_ID,
      questionText:
        'Define inertia as the tendency of a body to resist a change in its state of motion.',
      subject: 'Physics',
      topic: 'Forces',
      score: 0,
    });
  }
});

function hit(overrides: Partial<SearchHit>): SearchHit {
  return {
    id: 'question',
    questionText: 'Question text',
    subject: 'Physics',
    topic: 'Topic',
    subtopic: null,
    examYear: 2025,
    examType: 'board',
    difficulty: Difficulty.MEDIUM,
    questionType: QuestionType.SHORT,
    sourceDocument: 'physics.pdf',
    fileUrl: null,
    pageReference: '1',
    figureUrls: [],
    score: 0.6,
    ...overrides,
  };
}
