import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';
import { PapersModule } from './papers/papers.module';
import { PlaygroundModule } from './playground/playground.module';
import { QuestionsModule } from './questions/questions.module';

@Module({
  imports: [
    HealthModule,
    QuestionsModule,
    PapersModule,
    ChatModule,
    PlaygroundModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
