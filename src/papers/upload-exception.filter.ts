import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class UploadExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (
      exception instanceof PayloadTooLargeException ||
      isFileTooLarge(exception)
    ) {
      response.status(413).json({
        statusCode: 413,
        message: 'PDF must be at most 10 MB.',
        error: 'Payload Too Large',
      });
      return;
    }
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      response
        .status(exception.getStatus())
        .json(
          typeof body === 'string'
            ? { statusCode: exception.getStatus(), message: body }
            : body,
        );
      return;
    }
    response.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
    });
  }
}

function isFileTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'LIMIT_FILE_SIZE'
  );
}
