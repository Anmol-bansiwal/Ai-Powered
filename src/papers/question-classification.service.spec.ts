import { QuestionClassificationService } from './question-classification.service';
import { Difficulty, QuestionType } from '../generated/prisma/enums';

describe('QuestionClassificationService', () => {
  let service: QuestionClassificationService;

  beforeEach(() => {
    service = new QuestionClassificationService();
  });

  it('preserves explicit marks deterministically even during fallback', async () => {
    const question = 'Calculate the energy of the photon. [4 marks]';
    const result = await service.classifyQuestion(question);
    expect(result.marks).toBe(4);
    expect(result.subject).toBe('Physics');
  });

  it('infers mathematics subject for calculus questions', async () => {
    const question = 'Find the derivative of f(x) = x^3 - 3x + 2.';
    const result = await service.classifyQuestion(question);
    expect(result.subject).toBe('Mathematics');
  });

  it('infers chemistry subject for chemical reaction questions', async () => {
    const question = 'Balance the chemical equation for the synthesis of ammonia from nitrogen and hydrogen gas.';
    const result = await service.classifyQuestion(question);
    expect(result.subject).toBe('Chemistry');
  });

  it('infers difficulty level', async () => {
    const easyQ = 'What is Newton\'s first law?';
    const hardQ = 'Derive the second-order partial differential wave equation for the vector potential in free space.';
    const easyRes = await service.classifyQuestion(easyQ);
    const hardRes = await service.classifyQuestion(hardQ);
    expect(easyRes.difficulty).toBe(Difficulty.EASY);
    expect(hardRes.difficulty).toBe(Difficulty.HARD);
  });
});
