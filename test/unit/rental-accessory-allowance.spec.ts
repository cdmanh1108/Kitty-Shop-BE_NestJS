import {
  rentalAccessoryAllowance,
  RENTAL_BILLING_ROLE,
} from '../../src/modules/rentals/domain/rental-accessories';
import {
  rentalBillableQuantity,
  resolveRentalLinePricing,
} from '../../src/modules/rentals/domain/rental-pricing-snapshot';
import { DEFAULT_RENTAL_POLICY } from '../../src/modules/settings/domain/rental-policy';
import { calculateRentalReturnFees } from '../../src/modules/rentals/domain/rental-return-fees';

const paid = (quantity: number) => ({ quantity, billingRole: RENTAL_BILLING_ROLE.PAID });
const free = (quantity: number) => ({ quantity, billingRole: RENTAL_BILLING_ROLE.FREE_ACCESSORY });

describe('Two complimentary accessories per paid physical unit', () => {
  it.each([
    [1, 0, 2],
    [1, 1, 1],
    [1, 2, 0],
    [2, 3, 1],
    [2, 4, 0],
  ])(
    'gives %i paid units capacity for %i free selections and %i remaining',
    (paidQuantity, freeQuantity, remaining) => {
      const items = [paid(paidQuantity), ...(freeQuantity ? [free(freeQuantity)] : [])];
      expect(rentalAccessoryAllowance(items)).toEqual({
        billableQuantity: paidQuantity,
        freeAccessoryQuantity: freeQuantity,
        remainingFreeAccessoryQuantity: remaining,
      });
    },
  );
  it('counts physical quantities across paid lines without giving free lines another allowance', () => {
    expect(
      rentalAccessoryAllowance([paid(1), paid(2), free(6)]).remainingFreeAccessoryQuantity,
    ).toBe(0);
    expect(() => rentalAccessoryAllowance([paid(1), free(3)])).toThrow(/tối đa 2/);
    expect(() => rentalAccessoryAllowance([paid(2), free(5)])).toThrow(/tối đa 2/);
    expect(() => rentalAccessoryAllowance([free(2)])).toThrow(/ít nhất một món/);
  });
  it('includes zero-priced PAID units while keeping paid pricing quantity below the three-unit tier', () => {
    const items = [{ ...paid(2), cyclePriceOverride: 0 }, free(4)];
    const billableQuantity = rentalBillableQuantity(items);
    expect(billableQuantity).toBe(2);
    const pricing = resolveRentalLinePricing({
      durationDays: 5,
      billableQuantity,
      quantity: 2,
      depositPerItem: 200000,
      itemCyclePriceOverride: 0,
      policy: DEFAULT_RENTAL_POLICY.rentalPricing,
    });
    expect(pricing.pricingSnapshot).toMatchObject({
      version: 'CYCLE_V1',
      billableQuantity: 2,
      renewalDay: 5,
    });
  });
  it('keeps both free units at zero rent, deposit and automatic return fees', () => {
    const pricing = resolveRentalLinePricing({
      durationDays: 2,
      billableQuantity: 1,
      quantity: 2,
      depositPerItem: 200000,
      billingRole: RENTAL_BILLING_ROLE.FREE_ACCESSORY,
      policy: DEFAULT_RENTAL_POLICY.rentalPricing,
    });
    expect(pricing).toMatchObject({ unitRentalPrice: 0, lineTotal: 0, depositAmount: 0 });
    if (pricing.pricingSnapshot.version !== 'FREE_ACCESSORY_V1')
      throw new Error('Expected free pricing fixture');
    const fees = calculateRentalReturnFees({
      rentalStartAt: new Date('2026-11-20T00:00:00Z'),
      dueAt: new Date('2026-11-22T00:00:00Z'),
      returnedAt: new Date('2026-11-26T00:00:00Z'),
      policy: DEFAULT_RENTAL_POLICY,
      items: [
        {
          id: 'free-line',
          quantity: 2,
          billingRole: RENTAL_BILLING_ROLE.FREE_ACCESSORY,
          pricingSnapshot: { ...pricing.pricingSnapshot },
          allocations: [{ inventoryItemId: 'free-1' }, { inventoryItemId: 'free-2' }],
        },
      ],
    });
    expect(fees.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ inventoryItemId: 'free-1', lateFee: 0, additionalRentalFee: 0 }),
        expect.objectContaining({ inventoryItemId: 'free-2', lateFee: 0, additionalRentalFee: 0 }),
      ]),
    );
  });
  it('rejects unsafe doubled capacity before calculating an allowance', () => {
    expect(() => rentalAccessoryAllowance([paid(Number.MAX_SAFE_INTEGER)])).toThrow(/Tổng số món/);
  });
});
