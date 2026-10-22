import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { AnswersService } from './answers.service';
import { validateSearchQuestion } from './question.validation';
import { QuestionsService } from './questions.service';

@Controller('questions')
export class QuestionsController {
  constructor(
    private readonly questionsService: QuestionsService,
    private readonly answersService: AnswersService,
  ) {}

  @Get('filters')
  filters() {
    return this.questionsService.filters();
  }

  /** Admin: list questions from DB (any embedding status). */
  @Get('list')
  list(
    @Query('subject') subject?: string,
    @Query('embeddingStatus') embeddingStatus?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.questionsService.listForAdmin({
      subject,
      embeddingStatus,
      limit: limit !== undefined ? Number(limit) : undefined,
      offset: offset !== undefined ? Number(offset) : undefined,
    });
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: unknown) {
    return this.questionsService.create(body);
  }

  @Post('search')
  @HttpCode(200)
  search(@Body() body: unknown) {
    return this.questionsService.search(body);
  }

  @Post('search/hybrid')
  @HttpCode(200)
  hybridSearch(@Body() body: unknown) {
    return this.questionsService.hybridSearch(body);
  }

  @Post('search/rewritten')
  @HttpCode(200)
  rewrittenSearch(@Body() body: unknown) {
    return this.questionsService.rewrittenSearch(body);
  }

  @Post('answer')
  @HttpCode(200)
  answer(@Body() body: unknown) {
    // Same 400s as /questions/search before any model or database call.
    validateSearchQuestion(body);
    return this.answersService.answer(body);
  }
}
