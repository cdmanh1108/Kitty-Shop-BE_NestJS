import type {
  BookableVariant,
  RentalAvailabilityReader,
} from '../domain/ports/rental-availability.port';
import type {
  WebRentalItemInput,
  WebRentalLineAvailability,
  WebRentalLineIssue,
} from './web-rental.contracts';
import { WEB_RENTAL_MAX_TOTAL_QUANTITY } from './web-rental-input-validation';
import {
  assertFreeAccessoryAllowed,
  rentalAccessoryAllowance,
  rentalBillingRole,
  rentalSelectionKey,
  type RentalBillingRole,
} from '../domain/rental-accessories';

export type WebRentalSelectionFailure =
  | 'INVALID_QUANTITY'
  | 'MISSING_SELECTION'
  | 'PRODUCT_VARIANT_MISMATCH'
  | 'UNAVAILABLE';

export interface WebRentalDemand {
  variant: BookableVariant;
  quantity: number;
  billingRole: RentalBillingRole;
}

export interface WebRentalSelectionEvaluation {
  demands: WebRentalDemand[];
  /** First-request order; duplicate variant/role combinations are quantity-merged. */
  items: WebRentalLineAvailability[];
  failure?: WebRentalSelectionFailure;
}

export type WebRentalSelectionPlan =
  | { valid: true; demands: WebRentalDemand[] }
  | { valid: false; reason: WebRentalSelectionFailure };

interface CandidateLine {
  index: number;
  productId?: string;
  variantId: string;
  quantity: number;
  billingRole: RentalBillingRole;
}

interface LineGroup extends CandidateLine {
  requestedQuantity: number;
}

/** Resolves exact variant selections and merges duplicate demand before checking stock. */
export async function evaluateWebRentalSelection(
  repository: RentalAvailabilityReader,
  input: {
    shopId: string;
    items: WebRentalItemInput[];
    durationDays: number;
    from: Date;
    until: Date;
  },
): Promise<WebRentalSelectionEvaluation> {
  const candidates: CandidateLine[] = [];
  let totalQuantity = 0;
  for (const [index, item] of input.items.entries()) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      return { demands: [], items: [], failure: 'INVALID_QUANTITY' };
    }
    totalQuantity += item.quantity;
    if (!Number.isSafeInteger(totalQuantity) || totalQuantity > WEB_RENTAL_MAX_TOTAL_QUANTITY) {
      return { demands: [], items: [], failure: 'INVALID_QUANTITY' };
    }
    if (!item.variantId) return { demands: [], items: [], failure: 'MISSING_SELECTION' };
    candidates.push({
      index,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      billingRole: rentalBillingRole(item.billingRole),
    });
  }

  rentalAccessoryAllowance(input.items);
  const variantIds = [...new Set(candidates.map(({ variantId }) => variantId))];
  const variants = await repository.getBookableVariants({
    shopId: input.shopId,
    variantIds,
    durationDays: input.durationDays,
    from: input.from,
    until: input.until,
    storefrontEligibility: true,
  });
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  let failure: WebRentalSelectionFailure | undefined;
  for (const candidate of candidates) {
    const variant = variantById.get(candidate.variantId);
    if (!variant) failure ??= 'UNAVAILABLE';
    else if (candidate.productId && candidate.productId !== variant.productId)
      failure ??= 'PRODUCT_VARIANT_MISMATCH';
    if (variant) assertFreeAccessoryAllowed(candidate.billingRole, variant.allowFreeAccessory);
  }

  const groups = new Map<string, LineGroup>();
  for (const candidate of candidates) {
    const groupKey = rentalSelectionKey(candidate.variantId, candidate.billingRole);
    const current = groups.get(groupKey);
    if (current) {
      current.requestedQuantity += candidate.quantity;
      continue;
    }
    groups.set(groupKey, { ...candidate, requestedQuantity: candidate.quantity });
  }

  const demands: WebRentalDemand[] = [];
  const totalDemandByVariant = new Map<string, number>();
  for (const group of groups.values()) {
    totalDemandByVariant.set(
      group.variantId,
      (totalDemandByVariant.get(group.variantId) ?? 0) + group.requestedQuantity,
    );
  }
  const orderedItems: Array<{ index: number; result: WebRentalLineAvailability }> = [];

  for (const group of groups.values()) {
    const variant = variantById.get(group.variantId);
    if (!variant) {
      failure ??= 'UNAVAILABLE';
      orderedItems.push({
        index: group.index,
        result: {
          ...(group.productId ? { productId: group.productId } : {}),
          variantId: group.variantId,
          requestedQuantity: group.requestedQuantity,
          billingRole: group.billingRole,
          availableQuantity: 0,
          available: false,
          issue: 'NOT_RENTABLE',
        },
      });
      continue;
    }

    const availableQuantity = variant.availableInventory.length;
    const issue: WebRentalLineIssue | undefined =
      availableQuantity < (totalDemandByVariant.get(variant.id) ?? group.requestedQuantity)
        ? 'INSUFFICIENT_QUANTITY'
        : undefined;
    demands.push({ variant, quantity: group.requestedQuantity, billingRole: group.billingRole });
    orderedItems.push({
      index: group.index,
      result: {
        productId: variant.productId,
        variantId: variant.id,
        requestedQuantity: group.requestedQuantity,
        billingRole: group.billingRole,
        availableQuantity,
        available: issue === undefined,
        ...(issue ? { issue } : {}),
      },
    });
  }

  return {
    demands,
    items: orderedItems.sort((left, right) => left.index - right.index).map(({ result }) => result),
    ...(failure ? { failure } : {}),
  };
}

/** Resolves only fully bookable variant selections for authoritative booking paths. */
export async function resolveWebRentalSelection(
  repository: RentalAvailabilityReader,
  input: {
    shopId: string;
    items: WebRentalItemInput[];
    durationDays: number;
    from: Date;
    until: Date;
  },
): Promise<WebRentalSelectionPlan> {
  const evaluation = await evaluateWebRentalSelection(repository, input);
  if (evaluation.failure) return { valid: false, reason: evaluation.failure };
  return { valid: true, demands: evaluation.demands };
}
