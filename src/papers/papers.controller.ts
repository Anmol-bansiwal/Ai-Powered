import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MAX_PDF_BYTES } from './pdf-text';
import { PapersService, UploadedPdf } from './papers.service';
import { reviewPage } from './review-page';
import { UploadExceptionFilter } from './upload-exception.filter';

type UploadedFileShape = {
  buffer: Buffer;
  originalname: string;
  size: number;
};

@Controller('papers')
@UseFilters(UploadExceptionFilter)
export class PapersController {
  constructor(private readonly papersService: PapersService) {}

  @Get('review')
  @Header('Content-Type', 'text/html; charset=utf-8')
  review(@Res({ passthrough: true }) response: Response) {
    response.type('html');
    return reviewPage();
  }

  @Get('figures/:fileHash/:page/:index')
  @Header('Content-Type', 'image/png')
  figure(
    @Param('fileHash') fileHash: string,
    @Param('page') page: string,
    @Param('index') index: string,
  ): StreamableFile {
    return new StreamableFile(
      this.papersService.readFigure(fileHash, Number(page), Number(index)),
    );
  }

  @Post('extract')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PDF_BYTES, files: 1 } }),
  )
  extract(@UploadedFile() file?: UploadedFileShape) {
    return this.papersService.extract(toUploadedPdf(file));
  }

  /** Upload PDF to Cloudinary (S3 from the client can replace this later). */
  @Post('upload')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PDF_BYTES, files: 1 } }),
  )
  upload(@UploadedFile() file?: UploadedFileShape) {
    return this.papersService.upload(toUploadedPdf(file));
  }

  @Post('approve')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PDF_BYTES, files: 1 } }),
  )
  async approve(
    @UploadedFile() file: UploadedFileShape | undefined,
    @Body('draft') draft: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.papersService.approve(
      toUploadedPdf(file),
      parseDraft(draft),
    );
    if (result.saved.length === 0 && result.failed.length > 0) {
      throw new ServiceUnavailableException(result);
    }
    if (result.saved.length === 0) {
      response.status(200);
    }
    return result;
  }
}

function toUploadedPdf(
  file: UploadedFileShape | undefined,
): UploadedPdf | undefined {
  if (!file) {
    return undefined;
  }
  return { buffer: file.buffer, originalname: file.originalname };
}

function parseDraft(draft: string | undefined): unknown {
  if (typeof draft !== 'string' || draft.trim() === '') {
    return undefined;
  }
  try {
    return JSON.parse(draft) as unknown;
  } catch {
    return draft;
  }
}
