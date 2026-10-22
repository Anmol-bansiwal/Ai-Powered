import { ServiceUnavailableException } from '@nestjs/common';
import { Difficulty, QuestionType } from '../generated/prisma/enums';
import { AnswerModelService } from './answer-model.service';
import { AnswersService } from './answers.service';
import { INSUFFICIENT_ANSWER } from './quote-check';
import {
  NOT_IN_PAPERS,
  OUTSIDE_SCOPE,
  UNSUPPORTED_KNOWLEDGE,
} from './query-intent';
import { SearchHit } from './questions.repository';
import { QuestionsService } from './questions.service';
import { QueryUnderstandingService } from './query-understanding.service';

describe('AnswersService', () => {
  const search = jest.fn();
  const sampleReadyQuestions = jest.fn();
  const proposeQuotes = jest.fn();
  const explain = jest.fn();
  const describeCapabilities = jest.fn();
  const guide = jest.fn();
  const filters = jest.fn();
  const service = new AnswersService(
    { search, sampleReadyQuestions, filters } as unknown as QuestionsService,
    {
      proposeQuotes,
      explain,
      describeCapabilities,
      guide,
    } as unknown as AnswerModelService,
    new QueryUnderstandingService(),
  );

  const newton = hit({
    id: 'newton',
    questionText: "State Newton's second law of motion.",
    pageReference: '96',
    score: 0.8,
  });

  beforeEach(() => {
    search.mockReset();
    sampleReadyQuestions.mockReset();
    proposeQuotes.mockReset();
    explain.mockReset();
    describeCapabilities.mockReset();
    guide.mockReset();
    filters.mockReset();
    explain.mockResolvedValue(null);
    sampleReadyQuestions.mockResolvedValue([]);
    filters.mockResolvedValue({
      subjects: [],
      years: [],
      difficulties: [],
      timePeriods: [],
      total: 0,
    });
  });

  it('returns insufficient for Newton and does not keep an invented equation', async () => {
    search.mockResolvedValue({ results: [newton] });
    proposeQuotes.mockResolvedValue({
      complete: true,
      quotes: [
        {
          id: 'newton',
          quote: "Newton's second law is F = ma.",
          kind: 'answer',
          pageNumber: '1',
        },
      ],
    });

    const result = await service.answer({
      query: "What is Newton's second law?",
    });

    expect(result.status).toBe('insufficient');
    expect(result.answer).toBe(INSUFFICIENT_ANSWER);
    expect(result.answer).not.toContain('F = ma');
    expect(result.sources).toEqual([
      {
        id: 'newton',
        questionText: "State Newton's second law of motion.",
        pageReference: '96',
        score: 0.8,
      },
    ]);
  });

  it('returns an answer only from a quote that is in the retrieved text', async () => {
    const light = hit({
      id: 'light',
      questionText:
        'The speed of light in vacuum is 3.0 × 10^{8} m/s according to this paper.',
      pageReference: '4',
      score: 0.7,
    });
    search.mockResolvedValue({ results: [light] });
    proposeQuotes.mockResolvedValue({
      complete: true,
      quotes: [
        {
          id: 'light',
          quote: 'The speed of light in vacuum is 3.0 × 10^{8} m/s',
          kind: 'answer',
        },
      ],
    });

    const result = await service.answer({
      query: 'What speed of light does the paper state?',
    });

    expect(result.status).toBe('answered');
    expect(result.answer).toBe(
      'The speed of light in vacuum is 3.0 × 10^{8} m/s',
    );
    expect(result.sources[0].pageReference).toBe('4');
  });

  it('says unrelated when an empty search is followed by the model declining', async () => {
    search.mockResolvedValue({ results: [] });
    explain.mockResolvedValue(null);

    const result = await service.answer({ query: 'Who wrote Hamlet?' });

    // No list of unrelated topics: the cost is one search and one explain
    // call, and no paper is ever cited.
    expect(result.status).toBe('out_of_scope');
    expect(result.answer).toBe(OUTSIDE_SCOPE);
    expect(result.sources).toEqual([]);
    expect(search).toHaveBeenCalledTimes(1);
    expect(proposeQuotes).not.toHaveBeenCalled();
    expect(explain).toHaveBeenCalledTimes(1);
  });

  it('says unrelated when the model declines to explain a no-hit request', async () => {
    search.mockResolvedValue({ results: [] });
    explain.mockResolvedValue(null);

    const result = await service.answerWithHits({
      query: 'Who won the World Cup?',
    });

    expect(result.response).toMatchObject({
      status: 'out_of_scope',
      answer: OUTSIDE_SCOPE,
      explanation: null,
      sources: [],
    });
    expect(result.understanding?.kind).toBe('out_of_scope');
  });

  it('does not call the quote model when the best score is below 0.45', async () => {
    search.mockResolvedValue({
      results: [hit({ ...newton, score: 0.449 })],
    });
    // Model down: no explanation, but the topic is not called unrelated.
    explain.mockRejectedValue(new ServiceUnavailableException('down'));

    const result = await service.answer({ query: 'what is inertia' });

    expect(result.status).toBe('out_of_scope');
    expect(result.answer).toBe(UNSUPPORTED_KNOWLEDGE);
    expect(proposeQuotes).not.toHaveBeenCalled();
    expect(explain).toHaveBeenCalledWith('what is inertia', []);
  });

  it('treats a valid study topic with no bank hit as unsupported knowledge', async () => {
    search.mockResolvedValue({ results: [] });
    explain.mockRejectedValue(new ServiceUnavailableException('down'));

    const result = await service.answer({
      query: 'Explain photosynthesis from my uploaded paper',
    });

    expect(result.status).toBe('out_of_scope');
    expect(result.answer).toBe(UNSUPPORTED_KNOWLEDGE);
    expect(result.explanation).toBeNull();
    expect(result.sources).toEqual([]);
    expect(result.answerOrigin).toBeNull();
  });

  it('greets how-are-you variants without retrieval or sources', async () => {
    for (const query of ['how are you', 'how are u', 'HELLO!!!']) {
      search.mockClear();
      const result = await service.answer({
        query,
        subject: 'Mathematics',
      });
      expect(result.status).toBe('guidance');
      expect(result.answerOrigin).toBe('guidance');
      expect(result.sources).toEqual([]);
      expect(search).not.toHaveBeenCalled();
    }
  });

  it('searches a real how-question instead of greeting it', async () => {
    search.mockResolvedValue({ results: [] });
    await service.answer({ query: 'how does inertia work?' });
    expect(search).toHaveBeenCalled();
  });

  it('drops an exam cover page that does not share the asked topic', async () => {
    const cover = hit({
      id: 'cover',
      questionText:
        'GENERAL INSTRUCTIONS Office Use Only. Write your candidate number in the boxes. Reading time 10 minutes. Writing time 3 hours.',
      subject: 'Mathematics',
      score: 0.62,
    });
    search.mockResolvedValue({ results: [cover] });
    proposeQuotes.mockResolvedValue({ complete: false, quotes: [] });

    const result = await service.answer({
      query: 'explain black holes',
      subject: 'Mathematics',
    });

    expect(search).toHaveBeenCalled();
    expect(result.status).toBe('insufficient');
    expect(result.sources).toEqual([]);
    expect(result.answer).toBe(INSUFFICIENT_ANSWER);
  });

  it('keeps a retrieved question that shares the asked topic', async () => {
    const inertia = hit({
      id: 'inertia',
      questionText:
        'Define inertia as the tendency of a body to resist a change in its state of motion.',
      subject: 'Physics',
      score: 0.71,
    });
    search.mockResolvedValue({ results: [inertia] });
    proposeQuotes.mockResolvedValue({ complete: false, quotes: [] });

    const result = await service.answer({ query: 'explain inertia' });

    expect(result.status).toBe('insufficient');
    expect(result.sources.map((source) => source.id)).toEqual(['inertia']);
  });

  it('returns a quiet greeting without searching or calling the guide model', async () => {
    const result = await service.answer({ query: 'hey' });

    expect(result.status).toBe('guidance');
    expect(result.answer).toMatch(/Hi!/i);
    expect(result.answer).not.toMatch(/Physics|Chemistry/i);
    expect(result.sources).toEqual([]);
    expect(search).not.toHaveBeenCalled();
    expect(describeCapabilities).not.toHaveBeenCalled();
    expect(guide).not.toHaveBeenCalled();
    expect(proposeQuotes).not.toHaveBeenCalled();
  });

  it('returns capabilities guidance for help without searching', async () => {
    describeCapabilities.mockResolvedValue(
      'I can search Physics and Chemistry papers. Try topics like inertia.',
    );
    filters.mockResolvedValue({
      subjects: [{ value: 'Physics', count: 1 }],
      years: [],
      difficulties: [],
      timePeriods: [],
      total: 1,
    });

    const result = await service.answer({ query: 'what can you do' });

    expect(result.status).toBe('guidance');
    expect(result.answer).toContain('Physics');
    expect(search).not.toHaveBeenCalled();
    expect(describeCapabilities).toHaveBeenCalled();
  });

  it('clarifies bare subject "maths" without dumping paper excerpts', async () => {
    filters.mockResolvedValue({
      subjects: [
        { value: 'Mathematics', count: 2 },
        { value: 'Physics', count: 1 },
      ],
      years: [],
      difficulties: [],
      timePeriods: [],
      total: 3,
    });

    const result = await service.answer({ query: 'maths' });

    expect(result.status).toBe('guidance');
    expect(result.answer).toMatch(/Mathematics/i);
    expect(result.answer).toMatch(/What would you like to focus on/i);
    expect(result.answer).not.toMatch(/uploaded paper/i);
    expect(result.sources).toEqual([]);
    expect(search).not.toHaveBeenCalled();
    expect(proposeQuotes).not.toHaveBeenCalled();
    expect(explain).not.toHaveBeenCalled();
  });

  it('attaches a labelled AI explanation when academic but nothing matches', async () => {
    search.mockResolvedValue({ results: [] });
    explain.mockResolvedValue(
      'The speed of light in vacuum is about 3 × 10^{8} m/s.',
    );

    const result = await service.answer({
      query: 'What is the speed of light?',
    });

    expect(result.status).toBe('out_of_scope');
    expect(result.answer).toBe(NOT_IN_PAPERS);
    expect(result.explanation).toContain('10^{8}');
  });

  it('calls the answer model when the best score is 0.45', async () => {
    search.mockResolvedValue({
      results: [hit({ ...newton, score: 0.45 })],
    });
    proposeQuotes.mockResolvedValue({ complete: false, quotes: [] });

    const result = await service.answer({ query: 'Explain the stored law.' });

    expect(proposeQuotes).toHaveBeenCalledWith('Explain the stored law.', [
      {
        id: 'newton',
        questionText: "State Newton's second law of motion.",
      },
    ]);
    expect(result.status).toBe('insufficient');
    expect(result.sources[0].score).toBe(0.45);
  });

  it('returns out of scope for an empty search result', async () => {
    search.mockResolvedValue({ results: [] });

    const result = await service.answer({ query: 'What is photosynthesis?' });

    expect(result.status).toBe('out_of_scope');
    expect(result.sources).toEqual([]);
    expect(proposeQuotes).not.toHaveBeenCalled();
  });

  it('returns insufficient when the retrieved question has no text', async () => {
    search.mockResolvedValue({
      results: [hit({ ...newton, questionText: '' })],
    });
    proposeQuotes.mockResolvedValue({
      complete: true,
      quotes: [
        {
          id: 'newton',
          quote:
            "Newton's second law says force equals mass times acceleration.",
        },
      ],
    });

    const result = await service.answer({
      query: "What is Newton's second law?",
    });

    expect(result.status).toBe('insufficient');
    expect(result.answer).toBe(INSUFFICIENT_ANSWER);
    expect(result.answer).not.toContain('acceleration');
  });

  it('does not turn a model failure into an answer', async () => {
    search.mockResolvedValue({ results: [newton] });
    proposeQuotes.mockRejectedValue(
      new ServiceUnavailableException('Answer request failed.'),
    );

    await expect(
      service.answer({ query: "What is Newton's second law?" }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns only the hits above the related score alongside the answer', async () => {
    const weak = hit({ id: 'weak', questionText: 'Unrelated.', score: 0.3 });
    search.mockResolvedValue({ results: [newton, weak] });
    proposeQuotes.mockResolvedValue({ complete: false, quotes: [] });

    const result = await service.answerWithHits({
      query: "What is Newton's second law?",
    });

    expect(result.related).toEqual([newton]);
    expect(result.response.status).toBe('insufficient');
    expect(Object.keys(result.response).sort()).toEqual([
      'answer',
      'answerOrigin',
      'explanation',
      'sources',
      'status',
    ]);
  });

  it('adds an AI explanation to an insufficient answer and keeps the verified answer text', async () => {
    search.mockResolvedValue({ results: [newton] });
    proposeQuotes.mockResolvedValue({ complete: false, quotes: [] });
    explain.mockResolvedValue('Force equals mass times acceleration.');

    const result = await service.answer({
      query: "What is Newton's second law?",
    });

    expect(result.status).toBe('insufficient');
    expect(result.answer).toBe(INSUFFICIENT_ANSWER);
    expect(result.explanation).toBe('Force equals mass times acceleration.');
    expect(explain).toHaveBeenCalledWith("What is Newton's second law?", [
      { id: 'newton', questionText: "State Newton's second law of motion." },
    ]);
  });

  it('does not ask for an explanation when the papers answer the question', async () => {
    const light = hit({
      id: 'light',
      questionText: 'The speed of light in vacuum is 3.0 × 10^{8} m/s here.',
      score: 0.7,
    });
    search.mockResolvedValue({ results: [light] });
    proposeQuotes.mockResolvedValue({
      complete: true,
      quotes: [
        {
          id: 'light',
          quote: 'The speed of light in vacuum is 3.0',
          kind: 'answer',
        },
      ],
    });

    const result = await service.answer({ query: 'Speed of light?' });

    expect(result.status).toBe('answered');
    expect(result.explanation).toBeNull();
    expect(explain).not.toHaveBeenCalled();
  });

  it('explains the platinum problem instead of returning its question stem', async () => {
    const platinum = hit({
      id: 'platinum',
      questionText:
        'Q17. A platinum surface having work function 5.63 eV is illuminated by a monochromatic source of 1.6\nx 10^{15} Hz. What will be the minimum wavelength associated with the ejected electron.',
      pageReference: '4',
      score: 0.86,
    });
    search.mockResolvedValue({ results: [platinum] });
    proposeQuotes.mockResolvedValue({
      complete: true,
      quotes: [
        {
          id: 'platinum',
          quote: platinum.questionText.replace('Q17. ', ''),
          kind: 'answer',
        },
      ],
    });
    explain.mockResolvedValue('Use E = hν − φ, then λ = h/√(2mE).');

    const result = await service.answer({
      query: 'Minimum de Broglie wavelength of the electron from platinum?',
    });

    expect(result.status).toBe('insufficient');
    expect(result.answer).toBe(INSUFFICIENT_ANSWER);
    expect(result.answer).not.toContain('platinum');
    expect(result.explanation).toBe('Use E = hν − φ, then λ = h/√(2mE).');
    expect(result.sources.map((source) => source.id)).toEqual(['platinum']);
  });

  it('still returns the related questions when the explanation fails', async () => {
    search.mockResolvedValue({ results: [newton] });
    proposeQuotes.mockResolvedValue({ complete: false, quotes: [] });
    explain.mockRejectedValue(
      new ServiceUnavailableException('Answer request failed.'),
    );

    const result = await service.answer({
      query: "What is Newton's second law?",
    });

    expect(result.status).toBe('insufficient');
    expect(result.explanation).toBeNull();
    expect(result.sources).toHaveLength(1);
  });

  it('does not send page numbers to the answer model', async () => {
    search.mockResolvedValue({ results: [newton] });
    proposeQuotes.mockResolvedValue({ complete: false, quotes: [] });

    await service.answer({ query: "What is Newton's second law?" });

    expect(proposeQuotes).toHaveBeenCalledWith("What is Newton's second law?", [
      {
        id: 'newton',
        questionText: "State Newton's second law of motion.",
      },
    ]);
  });
});

function hit(
  overrides: Partial<SearchHit> &
    Pick<SearchHit, 'id' | 'questionText' | 'score'>,
): SearchHit {
  return {
    subject: 'Physics',
    topic: 'Mechanics',
    subtopic: null,
    examYear: 2024,
    examType: 'board',
    difficulty: Difficulty.MEDIUM,
    questionType: QuestionType.SHORT,
    sourceDocument: 'physics-sample.pdf',
    fileUrl: null,
    pageReference: '1',
    figureUrls: [],
    ...overrides,
  };
}
