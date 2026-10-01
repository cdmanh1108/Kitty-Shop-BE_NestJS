import type { PrismaService } from '@database/prisma/prisma.service';
import type { RentalCreationValidator } from '../domain/ports/rental-creation.port';

export async function customerExists(
  prisma: PrismaService,
  shopId: string,
  customerId: string,
): ReturnType<RentalCreationValidator['customerExists']> {
  return (
    (await prisma.customer.count({
      where: { id: customerId, shopId, status: 'ACTIVE', archivedAt: null },
    })) > 0
  );
}

export async function locationExists(
  prisma: PrismaService,
  shopId: string,
  locationId: string,
): ReturnType<RentalCreationValidator['locationExists']> {
  return (
    (await prisma.shopLocation.count({
      where: { id: locationId, shopId, isActive: true },
    })) > 0
  );
}
