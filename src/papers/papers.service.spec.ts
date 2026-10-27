import { createHash } from 'crypto';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { QuestionsRepository } from '../questions/questions.repository';
import { QuestionsService } from '../questions/questions.service';
import { PapersService } from './papers.service';
import { QuestionClassificationService } from './question-classification.service';
import { buildTextPdf } from './text-pdf.fixture';

describe('PapersService', () => {
  const create = jest.fn();
  const findReadyDuplicate = jest.fn();
  const deleteByIds = jest.fn();
  const uploadPdf = jest.fn();
  const uploadImage = jest.fn();
  const service = new PapersService(
    { create } as unknown as QuestionsService,
    {
      findReadyDuplicate,
      deleteByIds,
    } as unknown as QuestionsRepository,
    new QuestionClassificationService(),
    {
      provider: 'none',
      uploadPdf,
      uploadImage,
    } as never,
  );

  const pdf = buildTextPdf([['1. State Newton second law.']]);
  const draft = {
    subject: 'Physics',
    topic: 'Laws of Motion',
    examYear: 2024,
    examType: 'board',
    difficulty: 'MEDIUM',
    questionType: 'SHORT',
    fileHash: 'client-supplied-hash',
    questions: [
      {
        questionText: 'State Newton second law.',
        pageReference: '96',
      },
    ],
  };

  beforeEach(() => {
    create.mockReset();
    findReadyDuplicate.mockReset();
    deleteByIds.mockReset();
    uploadPdf.mockReset();
    uploadImage.mockReset();
    findReadyDuplicate.mockResolvedValue(false);
    create.mockImplementation((body: { questionText: string }) =>
      Promise.resolve({
        id: '11111111-1111-4111-8111-111111111111',
        pageReference: '96',
        sourceDocument: 'stored',
        fileUrl: null,
        ...body,
      }),
    );
  });

  it('returns draft questions without saving or embedding', async () => {
    const result = await service.extract({
      buffer: pdf,
      originalname: 'physics-sample.pdf',
    });

    expect(result.sourceDocument).toBe('physics-sample.pdf');
    expect(result.fileHash).toBe(
      createHash('sha256').update(pdf).digest('hex'),
    );
    expect(result.questions[0].pageReference).toBe('1');
    expect(result.questions[0].questionText).toContain(
      'State Newton second law.',
    );
    expect(result.questions[0].figures).toEqual([]);
    expect(result.unassignedFigures).toEqual([]);
    expect(create).not.toHaveBeenCalled();
    expect(findReadyDuplicate).not.toHaveBeenCalled();
  });

  it('saves through QuestionsService.create and ignores a client hash', async () => {
    const result = await service.approve(
      { buffer: pdf, originalname: 'physics-sample.pdf' },
      draft,
    );

    expect(create).toHaveBeenCalledTimes(1);
    const payload = create.mock.calls[0] as [
      { sourceDocument: string; pageReference: string },
    ];
    expect(payload[0].sourceDocument).toBe(
      `physics-sample.pdf#sha256:${result.fileHash}`,
    );
    expect(payload[0].sourceDocument).not.toContain('client-supplied-hash');
    expect(payload[0].pageReference).toBe('96');
    expect(payload[0]).toMatchObject({ fileUrl: null });
    expect(result.fileUrl).toBeNull();
    expect(result.saved).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(deleteByIds).not.toHaveBeenCalled();
  });

  it('stores Cloudinary fileUrl on approve when storage is configured', async () => {
    const cloud = new PapersService(
    { create } as unknown as QuestionsService,
    {
      findReadyDuplicate,
      deleteByIds,
    } as unknown as QuestionsRepository,
    new QuestionClassificationService(),
    {
        provider: 'cloudinary',
        uploadPdf: uploadPdf.mockResolvedValue({
          provider: 'cloudinary',
          url: 'https://res.cloudinary.com/demo/raw/upload/edusearch/papers/abc.pdf',
          publicId: 'edusearch/papers/abc',
          bytes: pdf.length,
          contentType: 'application/pdf',
        }),
        uploadImage,
      } as never,
    );

    const result = await cloud.approve(
      { buffer: pdf, originalname: 'physics-sample.pdf' },
      draft,
    );

    expect(uploadPdf).toHaveBeenCalled();
    expect(result.fileUrl).toContain('res.cloudinary.com');
    expect(create.mock.calls[0][0]).toMatchObject({
      fileUrl: result.fileUrl,
    });
  });

  it('does not embed a question already saved from the same file and page', async () => {
    findReadyDuplicate.mockResolvedValue(true);

    const result = await service.approve(
      { buffer: pdf, originalname: 'physics-sample.pdf' },
      draft,
    );

    expect(create).not.toHaveBeenCalled();
    expect(result.saved).toEqual([]);
    expect(result.skipped).toEqual([
      {
        questionText: 'State Newton second law.',
        pageReference: '96',
      },
    ]);
  });

  it('does not treat the same text in another file as a duplicate', async () => {
    const other = buildTextPdf([['1. A different wording of the page.']]);

    await service.approve(
      { buffer: pdf, originalname: 'physics-sample.pdf' },
      draft,
    );
    await service.approve({ buffer: other, originalname: 'other.pdf' }, draft);

    const first = create.mock.calls[0] as [{ sourceDocument: string }];
    const second = create.mock.calls[1] as [{ sourceDocument: string }];
    expect(first[0].sourceDocument).not.toBe(second[0].sourceDocument);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('keeps earlier questions when a later embedding fails and does not retry', async () => {
    create
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        questionText: 'First question text.',
        pageReference: '1',
        sourceDocument: 'kept',
      })
      .mockRejectedValueOnce(
        new ServiceUnavailableException('Embedding failed.'),
      );

    const result = await service.approve(
      { buffer: pdf, originalname: 'physics-sample.pdf' },
      {
        ...draft,
        questions: [
          { questionText: 'First question text.', pageReference: '1' },
          { questionText: 'Second question text.', pageReference: '1' },
        ],
      },
    );

    expect(result.saved).toHaveLength(1);
    expect(result.saved[0].id).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.failed).toEqual([
      {
        questionText: 'Second question text.',
        pageReference: '1',
        message: 'Embedding failed.',
      },
    ]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(deleteByIds).not.toHaveBeenCalled();
  });

  it('reports an OpenAI failure without saving that question', async () => {
    create.mockRejectedValue(
      new ServiceUnavailableException('Embedding failed.'),
    );

    const result = await service.approve(
      { buffer: pdf, originalname: 'physics-sample.pdf' },
      draft,
    );

    expect(result.saved).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(deleteByIds).not.toHaveBeenCalled();
  });

  it('rejects an invalid draft before embedding', async () => {
    await expect(
      service.approve(
        { buffer: pdf, originalname: 'physics-sample.pdf' },
        { ...draft, difficulty: 'VERY_HARD' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});

