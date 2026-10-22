import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createUIMessageStream, type UIMessageChunk } from 'ai';
import { sanitizeDatabaseError } from '../prisma/sanitize-database-error';
import { AnswersService } from '../questions/answers.service';
import { chatReply, deltasOf } from './chat-markdown';
import type { ChatQuery } from './chat-request';

export const CHAT_PACING = Symbol('CHAT_PACING');

export type ChatPacing = {
  wordsPerDelta: number;
  delayMs: number;
};

export const DEFAULT_CHAT_PACING: ChatPacing = {
  wordsPerDelta: 3,
  delayMs: 25,
};

export const UNAVAILABLE_TEXT =
  'The answer service is temporarily unavailable. Please try again.';
export const FAILED_TEXT =
  'Something went wrong while answering. Please try again.';

const TEXT_ID = 'text-1';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly answers: AnswersService,
    @Inject(CHAT_PACING) private readonly pacing: ChatPacing,
  ) {}

  // The reply is verified in full before the first word is sent, so streaming
  // only paces delivery; no unchecked text reaches the client.
  stream(
    query: ChatQuery,
    signal: AbortSignal,
  ): ReadableStream<UIMessageChunk> {
    return createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: 'start' });
        writer.write({ type: 'start-step' });

        const result = await this.answers.answerWithHits(query);
        const reply = chatReply(result);

        writer.write({ type: 'text-start', id: TEXT_ID });
        for (const delta of deltasOf(
          reply.markdown,
          this.pacing.wordsPerDelta,
        )) {
          if (signal.aborted) {
            return;
          }
          writer.write({ type: 'text-delta', id: TEXT_ID, delta });
          await pause(this.pacing.delayMs);
        }
        writer.write({ type: 'text-end', id: TEXT_ID });

        for (const source of reply.sources) {
          writer.write({
            type: 'source-document',
            sourceId: source.id,
            mediaType:
              source.figureUrls.length > 0 ? 'image/png' : 'text/plain',
            title: source.title,
            ...(source.filename ? { filename: source.filename } : {}),
            providerMetadata: {
              edusearch: {
                questionText: source.questionText,
                figureUrls: source.figureUrls,
                fromPaper: true,
              },
            },
          });
        }
        writer.write({ type: 'finish-step' });
        writer.write({
          type: 'finish',
          finishReason: 'stop',
          messageMetadata: {
            status: result.response.status,
            activeSubject: result.understanding?.activeSubject ?? null,
            kind: result.understanding?.kind ?? null,
            answerOrigin: result.response.answerOrigin ?? null,
          },
        });
      },
      onError: (error) => this.errorText(error),
    });
  }

  private errorText(error: unknown): string {
    this.logger.error(sanitizeDatabaseError(error));
    if (error instanceof ServiceUnavailableException) {
      return UNAVAILABLE_TEXT;
    }
    if (error instanceof HttpException && error.getStatus() < 500) {
      return error.message;
    }
    return FAILED_TEXT;
  }
}

function pause(ms: number): Promise<void> {
  return ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();
}
