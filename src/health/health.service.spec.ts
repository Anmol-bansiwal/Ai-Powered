import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const service = new HealthService(prisma);

  beforeEach(() => {
    queryRaw.mockReset();
  });

  it('reports the database as up when SELECT 1 succeeds', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('returns a fixed unavailable response and does not log secrets', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    queryRaw.mockRejectedValue(
      new Error(
        'password authentication failed postgresql://postgres:supersecret@localhost:5432/edusearch_ai',
      ),
    );

    await expect(service.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    try {
      await service.check();
    } catch (error) {
      const response = (error as ServiceUnavailableException).getResponse();
      expect(response).toEqual({
        status: 'error',
        database: 'down',
        message: 'Database is unavailable.',
      });
      expect(JSON.stringify(response)).not.toContain('supersecret');
    }

    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((call) => String(call[0])).join(' ');
    expect(logged).not.toContain('supersecret');
    expect(logged).toContain('postgresql://[redacted]');

    errorSpy.mockRestore();
  });
});
