import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { sanitizeDatabaseError } from './sanitize-database-error';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString || !/^postgres(ql)?:\/\//i.test(connectionString)) {
      throw new Error(
        'DATABASE_URL must be a PostgreSQL connection string before creating the database client.',
      );
    }

    const pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 10000,
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
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
    await this.pool.end();
  }
}
