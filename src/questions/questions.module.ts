import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnswerModelService } from './answer-model.service';
import { AnswersService } from './answers.service';
import { EmbeddingService } from './embedding.service';
import { QueryRewriteService } from './query-rewrite.service';
import { QuestionsController } from './questions.controller';
import { QuestionsRepository } from './questions.repository';
import { QuestionsService } from './questions.service';
import { QueryUnderstandingService } from './query-understanding.service';

@Module({
  imports: [PrismaModule],
  controllers: [QuestionsController],
  providers: [
    EmbeddingService,
    AnswerModelService,
    QueryRewriteService,
    QueryUnderstandingService,
    QuestionsRepository,
    QuestionsService,
    AnswersService,
  ],
  exports: [
    QuestionsService,
    QuestionsRepository,
    AnswersService,
    QueryUnderstandingService,
  ],
})
export class QuestionsModule {}
