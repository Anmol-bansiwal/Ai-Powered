import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { ChatController } from './chat.controller';
import { CHAT_PACING, ChatService, DEFAULT_CHAT_PACING } from './chat.service';

@Module({
  imports: [QuestionsModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    { provide: CHAT_PACING, useValue: DEFAULT_CHAT_PACING },
  ],
})
export class ChatModule {}
