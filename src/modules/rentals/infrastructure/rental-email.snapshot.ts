import type { JsonValue } from '@common/types/json';
import type { RentalEmailSnapshot } from '../domain/rental-email';

function record(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Invalid stored payloads become terminal queue errors; no unsafe JSON cast reaches the worker. */
export function readRentalEmailSnapshot(value: JsonValue): RentalEmailSnapshot | null {
  if (
    !record(value) ||
    value.version !== 1 ||
    typeof value.accountOwned !== 'boolean' ||
    !Array.isArray(value.details) ||
    !Array.isArray(value.items)
  )
    return null;
  const { event, orderCode, customerName, shopName, contactPhone, contactEmail } = value;
  if (event !== 'CONFIRMED' && event !== 'COMPLETED') return null;
  if (
    typeof orderCode !== 'string' ||
    typeof customerName !== 'string' ||
    typeof shopName !== 'string' ||
    typeof contactPhone !== 'string' ||
    typeof contactEmail !== 'string'
  )
    return null;
  const details: RentalEmailSnapshot['details'] = [];
  for (const row of value.details) {
    if (!record(row) || typeof row.label !== 'string' || typeof row.value !== 'string') return null;
    details.push({ label: row.label, value: row.value });
  }
  const items: RentalEmailSnapshot['items'] = [];
  for (const row of value.items) {
    if (
      !record(row) ||
      typeof row.name !== 'string' ||
      typeof row.variant !== 'string' ||
      typeof row.free !== 'boolean' ||
      typeof row.quantity !== 'number' ||
      !Number.isSafeInteger(row.quantity) ||
      row.quantity < 1
    )
      return null;
    items.push({ name: row.name, variant: row.variant, free: row.free, quantity: row.quantity });
  }
  return {
    version: 1,
    event,
    orderCode,
    customerName,
    shopName,
    contactPhone,
    contactEmail,
    accountOwned: value.accountOwned,
    details,
    items,
  };
}
