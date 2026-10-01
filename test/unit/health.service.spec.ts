import { HealthService } from '../../src/modules/health/application/health.service';
import { HealthDependencyUnavailableError } from '../../src/modules/health/application/health.errors';
import type { HealthRepository } from '../../src/modules/health/domain/health.repository';

function repository(): jest.Mocked<HealthRepository> {
  return { databaseReady: jest.fn() };
}

describe('HealthService', () => {
  it('reports liveness without checking dependencies', () => {
    const persistence = repository();
    const service = new HealthService(persistence);

    expect(service.live()).toMatchObject({ status: 'ok' });
    expect(persistence.databaseReady.mock.calls).toHaveLength(0);
  });

  it('reports readiness when PostgreSQL is reachable', async () => {
    const persistence = repository();
    persistence.databaseReady.mockResolvedValue(undefined);
    const service = new HealthService(persistence);

    await expect(service.ready()).resolves.toMatchObject({ status: 'ok', database: 'up' });
  });

  it('reports dependency failure as an application error when PostgreSQL cannot be reached', async () => {
    const persistence = repository();
    persistence.databaseReady.mockRejectedValue(new Error('connection refused'));
    const service = new HealthService(persistence);

    let thrown: unknown;
    try {
      await service.ready();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HealthDependencyUnavailableError);
    expect(thrown).toMatchObject({
      message: 'Dịch vụ phụ thuộc của hệ thống hiện không khả dụng.',
    });
  });
});
