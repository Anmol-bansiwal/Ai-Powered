import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { StorageModule } from '../storage/storage.module';
import { PapersController } from './papers.controller';
import { PapersService } from './papers.service';

@Module({
  imports: [QuestionsModule, StorageModule],
  controllers: [PapersController],
  providers: [PapersService],
})
export class PapersModule {}
