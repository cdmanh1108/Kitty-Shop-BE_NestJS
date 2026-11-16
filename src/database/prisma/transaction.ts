import { Prisma, type PrismaClient } from '@prisma/client';

const SERIALIZABLE_RETRY_CODES = new Set(['P2034']);

function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (SERIALIZABLE_RETRY_CODES.has(error.code)) return true;
  if (error.code !== 'P2010') return false;

  return error.meta?.code === '40001';
}

export async function serializableTransaction<T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!isSerializationConflict(error) || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
    }
  }
  throw lastError;
}
