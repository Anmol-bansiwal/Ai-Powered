import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { demoPage } from './demo-page';
import { playgroundPage } from './playground-page';

@Controller()
export class PlaygroundController {
  @Get('playground')
  @Header('Content-Type', 'text/html; charset=utf-8')
  page(@Res({ passthrough: true }) response: Response) {
    response.type('html');
    return playgroundPage();
  }

  @Get('demo')
  @Header('Content-Type', 'text/html; charset=utf-8')
  demo(@Res({ passthrough: true }) response: Response) {
    response.type('html');
    return demoPage();
  }
}
