import { Inject, Injectable } from '@nestjs/common';
import { HEALTH_REPOSITORY, type HealthRepository } from '../domain/health.repository';

@Injectable()
export class HealthService {
  constructor(@Inject(HEALTH_REPOSITORY) private readonly repository: HealthRepository) {}

  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  async ready() {
    await this.repository.databaseReady();
    return { status: 'ok', database: 'up', timestamp: new Date().toISOString() };
  }
}
