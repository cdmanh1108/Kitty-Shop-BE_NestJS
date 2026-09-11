import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SCHEDULE_MODULE_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/configure-application';
import { connectTestDatabase } from './test-database';
import { PrismaService } from '../../src/database/prisma/prisma.service';

export async function createTestApp(): Promise<INestApplication> {
  const testPrisma = await connectTestDatabase();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SCHEDULE_MODULE_OPTIONS)
    .useValue({ cronJobs: false, intervals: false, timeouts: false })
    .overrideProvider(PrismaService)
    .useValue(testPrisma)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  try {
    configureApplication(app);
    await app.init();
    if (app.get(SchedulerRegistry).getCronJobs().size !== 0)
      throw new Error('Scheduled jobs must be disabled in E2E');
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
