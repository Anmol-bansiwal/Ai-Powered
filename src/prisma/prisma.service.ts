import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { sanitizeDatabaseError } from './sanitize-database-error';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString || !/^postgres(ql)?:\/\//i.test(connectionString)) {
      throw new Error(
        'DATABASE_URL must be a PostgreSQL connection string before creating the database client.',
      );
    }

    const adapter = new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 5000,
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error(
        `Database connection failed. ${sanitizeDatabaseError(error)}`,
      );
      throw new Error(
        'Database connection failed. Check DATABASE_URL host, port, database name, and credentials.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
