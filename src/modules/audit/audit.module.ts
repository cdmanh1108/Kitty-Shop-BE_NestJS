import { Global, Module } from '@nestjs/common';
import { AuditController } from './api/audit.controller';
import { AuditService } from './application/audit.service';
import { AUDIT_REPOSITORY } from './domain/audit.repository';
import { PrismaAuditRepository } from './infrastructure/prisma-audit.repository';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, { provide: AUDIT_REPOSITORY, useClass: PrismaAuditRepository }],
  exports: [AuditService],
})
export class AuditModule {}
