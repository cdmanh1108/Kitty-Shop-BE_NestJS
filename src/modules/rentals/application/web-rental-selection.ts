import type { BookableVariant, RentalRepository } from '../domain/rental.repository';
import type { WebRentalItemInput } from './web-rental.contracts';

export type WebRentalSelectionFailure =
  | 'AMBIGUOUS_PRODUCT'
  | 'INVALID_QUANTITY'
  | 'MISSING_SELECTION'
  | 'PRODUCT_VARIANT_MISMATCH'
  | 'UNAVAILABLE';

export interface WebRentalDemand {
  variant: BookableVariant;
  quantity: number;
}

export type WebRentalSelectionPlan =
  | { valid: true; demands: WebRentalDemand[] }
  | { valid: false; reason: WebRentalSelectionFailure };

/**
 * Resolves a Web basket into its canonical variant demand.  A product ID is
 * only a compatibility alias when it has exactly one public, eligible variant;
 * it must never choose a "first" size or colour on the customer's behalf.
 */
export async function resolveWebRentalSelection(
  repository: Pick<RentalRepository, 'findActiveVariantIdsByProduct' | 'getBookableVariant'>,
  input: {
    shopId: string;
    items: WebRentalItemInput[];
    durationDays: number;
    from: Date;
    until: Date;
  },
): Promise<WebRentalSelectionPlan> {
  const demands = new Map<string, WebRentalDemand>();

  for (const item of input.items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      return { valid: false, reason: 'INVALID_QUANTITY' };
    }

    let variantId = item.variantId;
    if (!variantId && item.productId) {
      const variantIds = await repository.findActiveVariantIdsByProduct(
        input.shopId,
        item.productId,
        true,
      );
      if (variantIds.length !== 1) {
        return { valid: false, reason: 'AMBIGUOUS_PRODUCT' };
      }
      variantId = variantIds[0];
    }

    if (!variantId) return { valid: false, reason: 'MISSING_SELECTION' };

    const variant = await repository.getBookableVariant({
      shopId: input.shopId,
      variantId,
      durationDays: input.durationDays,
      from: input.from,
      until: input.until,
      storefrontEligibility: true,
    });
    if (!variant) return { valid: false, reason: 'UNAVAILABLE' };
    if (item.productId && item.productId !== variant.productId) {
      return { valid: false, reason: 'PRODUCT_VARIANT_MISMATCH' };
    }

    const previous = demands.get(variant.id);
    const quantity = (previous?.quantity ?? 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) {
      return { valid: false, reason: 'INVALID_QUANTITY' };
    }
    demands.set(variant.id, { variant, quantity });
  }

  return { valid: true, demands: [...demands.values()] };
}
