import { ApplicationError } from '@common/errors/application-error';

export class HealthDependencyUnavailableError extends ApplicationError {
  constructor() {
    super('Health dependency is unavailable.');
  }
}
