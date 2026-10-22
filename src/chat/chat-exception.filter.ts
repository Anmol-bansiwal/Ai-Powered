import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { sanitizeDatabaseError } from '../prisma/sanitize-database-error';

@Catch()
export class ChatExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ChatExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) {
      return;
    }
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json({ error: exception.message });
      return;
    }
    this.logger.error(sanitizeDatabaseError(exception));
    response.status(500).json({ error: 'Internal server error' });
  }
}
