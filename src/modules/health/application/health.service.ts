import { Inject, Injectable } from '@nestjs/common';
import { HEALTH_REPOSITORY, type HealthRepository } from '../domain/health.repository';
import { HealthDependencyUnavailableError } from './health.errors';

@Injectable()
export class HealthService {
  constructor(@Inject(HEALTH_REPOSITORY) private readonly repository: HealthRepository) {}

  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  async ready() {
    try {
      await this.repository.databaseReady();
    } catch {
      throw new HealthDependencyUnavailableError();
    }
    return { status: 'ok', database: 'up', timestamp: new Date().toISOString() };
  }
}
