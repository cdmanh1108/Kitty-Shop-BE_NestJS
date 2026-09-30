import type { BookableVariant, RentalAvailabilityReader } from '../domain/rental.repository';
import type {
  WebRentalItemInput,
  WebRentalLineAvailability,
  WebRentalLineIssue,
} from './web-rental.contracts';
import { WEB_RENTAL_MAX_TOTAL_QUANTITY } from './web-rental-input-validation';

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

export interface WebRentalSelectionEvaluation {
  demands: WebRentalDemand[];
  /** Items are returned in first-request order; duplicate variants are quantity-merged. */
  items: WebRentalLineAvailability[];
  failure?: WebRentalSelectionFailure;
}

export type WebRentalSelectionPlan =
  | { valid: true; demands: WebRentalDemand[] }
  | { valid: false; reason: WebRentalSelectionFailure };

interface CandidateLine {
  index: number;
  productId?: string;
  variantId?: string;
  quantity: number;
  unresolvedIssue?: 'AMBIGUOUS_PRODUCT' | 'UNAVAILABLE';
}

interface LineGroup {
  index: number;
  productId?: string;
  variantId?: string;
  requestedQuantity: number;
  unresolvedIssue?: 'AMBIGUOUS_PRODUCT' | 'UNAVAILABLE';
}

/**
 * Resolves a Web basket into canonical variant demand with one batch variant read.
 * Product-only compatibility aliases are also read as a batch. Duplicate variants
 * are merged before stock is checked so a repeated ID can never undercount demand.
 */
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
  const productIds = [
    ...new Set(
      input.items.flatMap((item) => (!item.variantId && item.productId ? [item.productId] : [])),
    ),
  ];
  const productVariants = productIds.length
    ? await repository.findActiveVariantIdsByProducts(input.shopId, productIds, true)
    : {};

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

    const productId = item.productId;
    if (item.variantId) {
      candidates.push({ index, productId, variantId: item.variantId, quantity: item.quantity });
      continue;
    }
    if (!productId) return { demands: [], items: [], failure: 'MISSING_SELECTION' };

    const variantIds = productVariants[productId] ?? [];
    candidates.push({
      index,
      productId,
      ...(variantIds.length === 1 ? { variantId: variantIds[0] } : {}),
      quantity: item.quantity,
      ...(variantIds.length === 0
        ? { unresolvedIssue: 'UNAVAILABLE' as const }
        : variantIds.length > 1
          ? { unresolvedIssue: 'AMBIGUOUS_PRODUCT' as const }
          : {}),
    });
  }

  const variantIds = [
    ...new Set(
      candidates.flatMap((candidate) => (candidate.variantId ? [candidate.variantId] : [])),
    ),
  ];
  const variants = variantIds.length
    ? await repository.getBookableVariants({
        shopId: input.shopId,
        variantIds,
        durationDays: input.durationDays,
        from: input.from,
        until: input.until,
        storefrontEligibility: true,
      })
    : [];
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  let failure: WebRentalSelectionFailure | undefined;
  for (const candidate of candidates) {
    if (candidate.unresolvedIssue) {
      failure ??= candidate.unresolvedIssue;
      continue;
    }
    const variant = candidate.variantId ? variantById.get(candidate.variantId) : undefined;
    if (!variant) failure ??= 'UNAVAILABLE';
    else if (candidate.productId && candidate.productId !== variant.productId)
      failure ??= 'PRODUCT_VARIANT_MISMATCH';
  }

  const groups = new Map<string, LineGroup>();
  for (const candidate of candidates) {
    const groupKey = candidate.variantId
      ? `variant:${candidate.variantId}`
      : `product:${candidate.productId}`;
    const current = groups.get(groupKey);
    if (current) {
      current.requestedQuantity += candidate.quantity;
      current.unresolvedIssue ??= candidate.unresolvedIssue;
      continue;
    }
    groups.set(groupKey, {
      index: candidate.index,
      ...(candidate.productId ? { productId: candidate.productId } : {}),
      ...(candidate.variantId ? { variantId: candidate.variantId } : {}),
      requestedQuantity: candidate.quantity,
      ...(candidate.unresolvedIssue ? { unresolvedIssue: candidate.unresolvedIssue } : {}),
    });
  }

  const demands: WebRentalDemand[] = [];
  const orderedItems: Array<{ index: number; result: WebRentalLineAvailability }> = [];

  for (const group of groups.values()) {
    const variant = group.variantId ? variantById.get(group.variantId) : undefined;
    if (!variant) {
      failure ??= group.unresolvedIssue ?? 'UNAVAILABLE';
      orderedItems.push({
        index: group.index,
        result: {
          ...(group.productId ? { productId: group.productId } : {}),
          ...(group.variantId ? { variantId: group.variantId } : {}),
          requestedQuantity: group.requestedQuantity,
          availableQuantity: 0,
          available: false,
          issue: 'NOT_RENTABLE',
        },
      });
      continue;
    }

    const availableQuantity = variant.availableInventory.length;
    const issue: WebRentalLineIssue | undefined =
      availableQuantity < group.requestedQuantity
        ? 'INSUFFICIENT_QUANTITY'
        : variant.ratePrice === null
          ? 'PRICE_UNAVAILABLE'
          : undefined;
    demands.push({ variant, quantity: group.requestedQuantity });
    orderedItems.push({
      index: group.index,
      result: {
        productId: variant.productId,
        variantId: variant.id,
        requestedQuantity: group.requestedQuantity,
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
