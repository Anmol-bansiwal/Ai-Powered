import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsOriginDelegate } from './config/cors';
import { validateEnv } from './config/env.validation';
import { sanitizeDatabaseError } from './prisma/sanitize-database-error';

async function bootstrap() {
  const env = validateEnv(process.env);
  const app = await NestFactory.create(AppModule);

  // localhost is always allowed; CORS_ORIGINS is for deployed frontends only.
  app.enableCors({
    origin: corsOriginDelegate(env.CORS_ORIGINS),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'ngrok-skip-browser-warning',
    ],
    credentials: true,
  });

  app.enableShutdownHooks();
  await app.listen(env.PORT);
}

bootstrap().catch((error: unknown) => {
  console.error(sanitizeDatabaseError(error));
  process.exit(1);
});
