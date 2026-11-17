import { Prisma, type PrismaClient } from '@prisma/client';

const SERIALIZABLE_RETRY_CODES = new Set(['P2034']);
const ENGINE_WRITE_CONFLICT =
  'Transaction failed due to a write conflict or a deadlock. Please retry your transaction';

function isSerializationConflict(error: unknown): boolean {
  // Prisma 6's query engine can surface the same aborted write conflict as an
  // UnknownRequestError. Match only the canonical engine suffix on that class,
  // never arbitrary application messages or unrelated connector failures.
  if (error instanceof Prisma.PrismaClientUnknownRequestError)
    return error.message.trimEnd().endsWith(ENGINE_WRITE_CONFLICT);
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
      if (!isSerializationConflict(error)) throw error;
      if (attempt === maxAttempts) {
        if (error instanceof Prisma.PrismaClientUnknownRequestError)
          throw new Prisma.PrismaClientKnownRequestError(ENGINE_WRITE_CONFLICT, {
            code: 'P2034',
            clientVersion: error.clientVersion,
          });
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
    }
  }
  throw lastError;
}
