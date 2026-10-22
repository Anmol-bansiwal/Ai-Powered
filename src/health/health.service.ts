import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeDatabaseError } from '../prisma/sanitize-database-error';

export type HealthReport = {
  status: 'ok';
  database: 'up';
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthReport> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch (error) {
      this.logger.error(
        `Health check database query failed. ${sanitizeDatabaseError(error)}`,
      );
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
        message: 'Database is unavailable.',
      });
    }
  }
}
