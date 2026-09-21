import type { WebRentalItemInput } from './web-rental.contracts';

/**
 * Transport-facing resource limits for one Web rental request. They protect
 * selection, pricing, and allocation work; they are not inventory limits.
 */
export const WEB_RENTAL_MAX_ITEM_COUNT = 20;
export const WEB_RENTAL_MAX_QUANTITY_PER_ITEM = 20;
export const WEB_RENTAL_MAX_TOTAL_QUANTITY = 50;
export const WEB_RENTAL_MAX_ADDRESS_LENGTH = 500;
export const WEB_RENTAL_MAX_SOCIAL_CONTACT_LENGTH = 500;

export type WebRentalInputValidationCode =
  | 'INVALID_CALENDAR_DATE'
  | 'INVALID_RENTAL_INTERVAL'
  | 'INVALID_SELECTION'
  | 'INVALID_QUANTITY'
  | 'TOO_MANY_ITEMS'
  | 'TOTAL_QUANTITY_EXCEEDED';

export class WebRentalInputValidationError extends Error {
  constructor(readonly code: WebRentalInputValidationCode) {
    super(code);
  }
}

export interface WebRentalDateRangeInput {
  pickupDate: string;
  returnDate: string;
}

export interface WebRentalDateRange {
  from: Date;
  until: Date;
}

type WebRentalItemValidationCandidate = {
  productId?: string;
  variantId?: string;
  quantity?: number;
};

/** Parses date-only Web input without accepting JavaScript date rollovers. */
export function parseWebRentalDateRange(input: WebRentalDateRangeInput): WebRentalDateRange {
  const from = parseCalendarDate(input.pickupDate);
  const until = parseCalendarDate(input.returnDate);
  if (from >= until) throw new WebRentalInputValidationError('INVALID_RENTAL_INTERVAL');
  return { from, until };
}

/**
 * Defends the application boundary as well as the DTO boundary. This happens
 * before policy, catalog, or idempotency work. Duplicate lines remain valid;
 * their quantities are deliberately included in the request-wide cap.
 */
export function assertWebRentalItems(items: readonly WebRentalItemInput[]): void {
  if (!Array.isArray(items) || items.length === 0 || items.length > WEB_RENTAL_MAX_ITEM_COUNT) {
    throw new WebRentalInputValidationError('TOO_MANY_ITEMS');
  }

  let totalQuantity = 0;
  for (const item of items as readonly WebRentalItemValidationCandidate[]) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new WebRentalInputValidationError('INVALID_SELECTION');
    }
    if (typeof item.productId !== 'string' && typeof item.variantId !== 'string') {
      throw new WebRentalInputValidationError('INVALID_SELECTION');
    }
    if (
      typeof item.quantity !== 'number' ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > WEB_RENTAL_MAX_QUANTITY_PER_ITEM
    ) {
      throw new WebRentalInputValidationError('INVALID_QUANTITY');
    }
    totalQuantity += item.quantity;
    if (!Number.isSafeInteger(totalQuantity) || totalQuantity > WEB_RENTAL_MAX_TOTAL_QUANTITY) {
      throw new WebRentalInputValidationError('TOTAL_QUANTITY_EXCEEDED');
    }
  }
}

function parseCalendarDate(value: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new WebRentalInputValidationError('INVALID_CALENDAR_DATE');
  }

  const parts = value.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) {
    throw new WebRentalInputValidationError('INVALID_CALENDAR_DATE');
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new WebRentalInputValidationError('INVALID_CALENDAR_DATE');
  }
  return parsed;
}
