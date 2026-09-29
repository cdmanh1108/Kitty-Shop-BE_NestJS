import { toBookableVariant, bookableVariantInclude } from './rental-prisma.mapper';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { RentalAvailabilityReader } from '../domain/rental.repository';
import { storefrontProductEligibility } from '@modules/catalog/domain/storefront-eligibility';

export async function getBookableVariant(
  prisma: PrismaService,
  input: Parameters<RentalAvailabilityReader['getBookableVariant']>[0],
): ReturnType<RentalAvailabilityReader['getBookableVariant']> {
  const variant = await prisma.productVariant.findFirst({
    where: {
      id: input.variantId,
      shopId: input.shopId,
      status: 'ACTIVE',
      archivedAt: null,
      product: input.storefrontEligibility
        ? storefrontProductEligibility
        : { status: 'ACTIVE', isRentable: true, archivedAt: null },
    },
    include: bookableVariantInclude(input),
  });
  return toBookableVariant(variant, input.durationDays);
}
