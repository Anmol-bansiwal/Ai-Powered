import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QuestionsRepository } from '../questions/questions.repository';
import { QuestionsService } from '../questions/questions.service';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
  type StoredObject,
} from '../storage/storage.types';
import { associateFigures } from './figure-association';
import { readFigureFile } from './figure-store';
import { extractFormulaLatex } from './formula-extractor';
import { extractExplicitMarks } from './marks-extractor';
import { validateApprovedPaper } from './paper.validation';
import { extractPdfFigures } from './pdf-figures';
import { extractPdfPages } from './pdf-text';
import { QuestionClassificationService } from './question-classification.service';
import { splitPagesWithLayout } from './question-splitter';
import {
  normalizeQuestionText,
  sanitizeFilename,
  sha256Hex,
  sourceDocumentKey,
} from './source-document';

export type UploadedPdf = {
  buffer: Buffer;
  originalname?: string;
};

type SavedQuestion = {
  id: string;
  questionText: string;
  pageReference: string | null;
  sourceDocument: string | null;
  fileUrl: string | null;
};

type FailedQuestion = {
  questionText: string;
  pageReference: string;
  message: string;
};

@Injectable()
export class PapersService {
  private readonly logger = new Logger(PapersService.name);

  constructor(
    private readonly questionsService: QuestionsService,
    private readonly questionsRepository: QuestionsRepository,
    private readonly classificationService: QuestionClassificationService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async extract(file: UploadedPdf | undefined) {
    const bytes = this.requirePdf(file);
    const pages = await extractPdfPages(bytes);
    const layouts = splitPagesWithLayout(pages);
    if (layouts.length === 0) {
      throw new UnprocessableEntityException(
        'No text could be extracted from this PDF.',
      );
    }
    const fileHash = sha256Hex(bytes);
    const placements = await extractPdfFigures(bytes);
    const associated = associateFigures(layouts, placements);
    const withUrls = (figures: typeof associated.unassigned) =>
      figures.map((figure) => ({
        ...figure,
        source: 'embedded' as const,
        url: `/papers/figures/${fileHash}/${figure.page}/${figure.index}`,
      }));

    const questions = await Promise.all(
      associated.questions.map(async (question) => {
        const explicitMarks = extractExplicitMarks(question.questionText);
        const formulas = extractFormulaLatex(question.questionText);
        const classification = await this.classificationService.classifyQuestion(
          question.questionText,
        );

        return {
          questionText: question.questionText,
          pageReference: question.pageReference,
          subject: classification.subject,
          topic: classification.topic,
          subtopic: classification.subtopic,
          examYear: null,
          examType: null,
          difficulty: classification.difficulty,
          questionType: classification.questionType,
          marks: explicitMarks.explicit
            ? explicitMarks.marks
            : (classification.marks ?? explicitMarks.marks),
          marksExplicit: explicitMarks.explicit,
          formulaLatex: formulas,
          classificationConfidence: classification.confidence,
          figures: await this.maybeHostFigures(
            fileHash,
            withUrls(question.figures),
          ),
        };
      }),
    );

    return {
      sourceDocument: sanitizeFilename(file?.originalname),
      fileHash,
      pageCount: pages.length,
      storageProvider: this.storage.provider,
      ocrApplied: pages.some((p) => p.ocrApplied),
      questions,
      unassignedFigures: await this.maybeHostFigures(
        fileHash,
        withUrls(associated.unassigned),
      ),
    };
  }

  readFigure(fileHash: string, page: number, index: number): Buffer {
    return readFigureFile(fileHash, page, index);
  }

  /**
   * Upload PDF only (Cloudinary now; later S3 from the client can replace this).
   * Does not extract or save questions.
   */
  async upload(file: UploadedPdf | undefined) {
    const bytes = this.requirePdf(file);
    const filename = sanitizeFilename(file?.originalname);
    const fileHash = sha256Hex(bytes);
    const stored = await this.uploadPdfOrThrow(bytes, filename, fileHash);
    return {
      fileHash,
      filename,
      storage: stored,
    };
  }

  async approve(file: UploadedPdf | undefined, draft: unknown) {
    const bytes = this.requirePdf(file);
    await extractPdfPages(bytes);
    const paper = validateApprovedPaper(draft);
    const filename = sanitizeFilename(file?.originalname);
    const fileHash = sha256Hex(bytes);
    let sourceDocument: string;
    try {
      sourceDocument = sourceDocumentKey(filename, fileHash);
    } catch {
      throw new BadRequestException('Filename is too long.');
    }

    const fileUpload = await this.uploadPdfSafe(bytes, filename, fileHash);
    const fileUrl = fileUpload?.url ?? null;

    const saved: SavedQuestion[] = [];
    const skipped: Array<{ questionText: string; pageReference: string }> = [];
    const failed: FailedQuestion[] = [];

    for (const question of paper.questions) {
      const duplicate = await this.questionsRepository.findReadyDuplicate(
        sourceDocument,
        question.pageReference,
        normalizeQuestionText(question.questionText),
      );
      if (duplicate) {
        skipped.push({
          questionText: question.questionText,
          pageReference: question.pageReference,
        });
        continue;
      }

      try {
        const created = await this.questionsService.create({
          questionText: question.questionText,
          subject: question.subject ?? paper.subject,
          topic: question.topic ?? paper.topic,
          subtopic: question.subtopic ?? paper.subtopic,
          examYear: paper.examYear,
          examType: paper.examType,
          difficulty: question.difficulty ?? paper.difficulty,
          questionType: question.questionType ?? paper.questionType,
          sourceDocument,
          fileUrl,
          pageReference: question.pageReference,
          figureUrls: question.figureUrls,
        });
        saved.push({
          id: created.id,
          questionText: created.questionText,
          pageReference: created.pageReference,
          sourceDocument: created.sourceDocument,
          fileUrl: created.fileUrl,
        });
      } catch (error) {
        if (error instanceof ServiceUnavailableException) {
          failed.push({
            questionText: question.questionText,
            pageReference: question.pageReference,
            message: exceptionMessage(error),
          });
          continue;
        }
        throw error;
      }
    }

    return {
      fileHash,
      sourceDocument,
      fileUrl,
      storageProvider: fileUpload?.provider ?? this.storage.provider,
      saved,
      skipped,
      failed,
    };
  }

  private async maybeHostFigures<
    T extends { page: number; index: number; url: string },
  >(fileHash: string, figures: T[]): Promise<T[]> {
    if (this.storage.provider === 'none' || figures.length === 0) {
      return figures;
    }
    const hosted: T[] = [];
    for (const figure of figures) {
      try {
        const png = readFigureFile(fileHash, figure.page, figure.index);
        const stored = await this.storage.uploadImage({
          buffer: png,
          publicId: `${fileHash}/${figure.page}-${figure.index}`,
          filename: `${figure.page}-${figure.index}.png`,
        });
        hosted.push({ ...figure, url: stored.url });
      } catch (error) {
        this.logger.warn(
          `Figure upload skipped for ${fileHash} p${figure.page}-${figure.index}: ${String(error)}`,
        );
        hosted.push(figure);
      }
    }
    return hosted;
  }

  private async uploadPdfSafe(
    bytes: Buffer,
    filename: string,
    fileHash: string,
  ): Promise<StoredObject | null> {
    if (this.storage.provider === 'none') {
      return null;
    }
    try {
      return await this.storage.uploadPdf({
        buffer: bytes,
        filename,
        fileHash,
      });
    } catch (error) {
      this.logger.warn(`PDF cloud upload skipped: ${String(error)}`);
      return null;
    }
  }

  private async uploadPdfOrThrow(
    bytes: Buffer,
    filename: string,
    fileHash: string,
  ): Promise<StoredObject> {
    if (this.storage.provider === 'none') {
      throw new ServiceUnavailableException(
        'Object storage is not configured. Set Cloudinary credentials (or STORAGE_PROVIDER).',
      );
    }
    return this.storage.uploadPdf({ buffer: bytes, filename, fileHash });
  }

  private requirePdf(file: UploadedPdf | undefined): Buffer {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('A PDF file is required.');
    }
    return file.buffer;
  }
}

function exceptionMessage(error: ServiceUnavailableException): string {
  const response = error.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (
    typeof response === 'object' &&
    response !== null &&
    'message' in response &&
    typeof response.message === 'string'
  ) {
    return response.message;
  }
  return 'Embedding failed.';
}
