import 'reflect-metadata';
import { ServiceUnavailableException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import * as request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { HealthController } from '../src/modules/health/api/health.controller';
import { HealthService } from '../src/modules/health/application/health.service';

describe('Health HTTP probes', () => {
  let app: INestApplication;
  let server: Server;
  const health = {
    live: jest.fn(),
    ready: jest.fn(),
  };

  beforeEach(async () => {
    health.live.mockReset().mockReturnValue({ status: 'ok' });
    health.ready.mockReset().mockResolvedValue({ status: 'ok', database: 'up' });
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: health }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => app.close());

  it('reports liveness and readiness while dependencies are healthy', async () => {
    await request(server).get('/health/live').expect(200).expect({ status: 'ok' });
    await request(server).get('/health/ready').expect(200).expect({ status: 'ok', database: 'up' });
  });

  it('returns 503 for an unavailable dependency without changing liveness', async () => {
    health.ready.mockRejectedValue(new ServiceUnavailableException());

    await request(server).get('/health/ready').expect(503);
    await request(server).get('/health/live').expect(200).expect({ status: 'ok' });
  });
});
