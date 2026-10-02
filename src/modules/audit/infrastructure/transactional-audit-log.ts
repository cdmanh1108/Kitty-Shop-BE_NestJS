import type { Prisma } from '@prisma/client';
import type { CreateAuditLogData } from '../domain/audit.repository';

/** Audit-owned persistence capability that joins the caller's transaction. */
export async function writeTransactionalAuditLog(
  tx: Prisma.TransactionClient,
  input: CreateAuditLogData,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      ...input,
      oldValues: input.oldValues as Prisma.InputJsonValue | undefined,
      newValues: input.newValues as Prisma.InputJsonValue | undefined,
    },
  });
}
