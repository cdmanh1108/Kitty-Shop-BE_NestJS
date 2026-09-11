import type { Prisma } from '@prisma/client';

export function decimalToNumber(value: Prisma.Decimal | number): number {
  return Number(value);
}
