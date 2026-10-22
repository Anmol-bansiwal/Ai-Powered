import { Body, Controller, Post, Res, UseFilters } from '@nestjs/common';
import { pipeUIMessageStreamToResponse } from 'ai';
import type { Response } from 'express';
import { ChatExceptionFilter } from './chat-exception.filter';
import { parseChatRequest } from './chat-request';
import { ChatService } from './chat.service';

@Controller('api/chat')
@UseFilters(ChatExceptionFilter)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  async send(@Body() body: unknown, @Res() response: Response): Promise<void> {
    const query = parseChatRequest(body);
    const disconnected = new AbortController();
    response.on('close', () => disconnected.abort());
    await pipeUIMessageStreamToResponse({
      response,
      stream: this.chat.stream(query, disconnected.signal),
    });
  }
}
