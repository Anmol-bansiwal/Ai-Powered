import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { Script } from 'vm';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { EmbeddingService } from './../src/questions/embedding.service';

describe('Playground (e2e)', () => {
  let app: INestApplication<App>;
  const embed = jest.fn();

  beforeEach(async () => {
    embed.mockReset();
    process.env.DATABASE_URL =
      'postgresql://test:test@127.0.0.1:5432/edusearch_ai_test?schema=public';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      })
      .overrideProvider(EmbeddingService)
      .useValue({ embed })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves a page that calls every endpoint without calling OpenAI', async () => {
    const response = await request(app.getHttpServer())
      .get('/playground')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    for (const path of [
      '/health',
      '/questions/search',
      '/questions/search/hybrid',
      '/questions/search/rewritten',
      '/questions/answer',
      '/api/chat',
      "'/questions'",
      '/papers/extract',
      '/papers/approve',
    ]) {
      expect(response.text).toContain(path);
    }
    expect(embed).not.toHaveBeenCalled();
  });

  it('serves the Figma-style demo page wired to the filter, answer and search endpoints', async () => {
    const response = await request(app.getHttpServer())
      .get('/demo')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Find the Right Exam');
    for (const path of [
      '/questions/filters',
      '/questions/answer',
      '/questions/search',
    ]) {
      expect(response.text).toContain(path);
    }
    const script = /<script>([\s\S]*)<\/script>/.exec(response.text)?.[1];
    expect(() => new Script(script as string)).not.toThrow();
    expect(embed).not.toHaveBeenCalled();
  });

  it('ships an inline script that parses', async () => {
    const response = await request(app.getHttpServer())
      .get('/playground')
      .expect(200);

    const script = /<script>([\s\S]*)<\/script>/.exec(response.text)?.[1];
    expect(script).toBeDefined();
    expect(() => new Script(script as string)).not.toThrow();
    expect(script).toContain("split('\\n\\n')");
  });
});
