import type { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SCHEDULE_MODULE_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/configure-application';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { VERIFICATION_CODE_SENDER } from '../../src/modules/web-auth/domain/verification-code';
import { connectTestDatabase } from './test-database';

export async function createTestApp(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication> {
  const testPrisma = await connectTestDatabase();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SCHEDULE_MODULE_OPTIONS)
    .useValue({ cronJobs: false, intervals: false, timeouts: false })
    .overrideProvider(PrismaService)
    .useValue(testPrisma)
    // Automated app tests must never make network calls to the configured email provider.
    .overrideProvider(VERIFICATION_CODE_SENDER)
    .useValue({ send: () => Promise.resolve() });
  if (customize) builder = customize(builder);
  const moduleRef = await builder.compile();
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
