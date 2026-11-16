import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProductReqDto } from '../../src/modules/catalog/api/admin/dto/product.dto';
import { DEFAULT_RENTAL_POLICY } from '../../src/modules/settings/domain/rental-policy';
import { resolveRentalCyclePricing } from '../../src/modules/rentals/domain/rental-cycle-pricing';
import {
  readRentalCyclePricing,
  resolveRentalLinePricing,
} from '../../src/modules/rentals/domain/rental-pricing-snapshot';

describe('product rental price', () => {
  const base = {
    durationDays: 2,
    billableQuantity: 1,
    policy: DEFAULT_RENTAL_POLICY.rentalPricing,
  };
  it.each([
    [null, undefined, undefined, 50000, 'SHOP'],
    [80000, undefined, undefined, 80000, 'PRODUCT'],
    [0, undefined, undefined, 0, 'PRODUCT'],
    [80000, 70000, undefined, 70000, 'ORDER'],
    [80000, 70000, 60000, 60000, 'ITEM'],
    [80000, 0, undefined, 0, 'ORDER'],
  ] as const)('resolves product %s, order %s, item %s', (product, order, item, price, source) => {
    expect(
      resolveRentalCyclePricing({
        ...base,
        productCyclePriceOverride: product,
        orderCyclePriceOverride: order,
        itemCyclePriceOverride: item,
      }),
    ).toMatchObject({ cyclePrice: price, priceSource: source, unitRentalPrice: price + 10000 });
  });
  it('repeats the product price on each renewal while retaining the shared daily fee', () => {
    expect(
      resolveRentalCyclePricing({ ...base, durationDays: 5, productCyclePriceOverride: 80000 }),
    ).toMatchObject({ cycleCount: 2, additionalDayCount: 3, unitRentalPrice: 190000 });
  });
  it('reads existing CYCLE_V1 snapshots without a product price and captures new product prices', () => {
    const original = resolveRentalLinePricing({ ...base, quantity: 1, depositPerItem: 200000 });
    const legacy = { ...original.pricingSnapshot };
    if (legacy.version !== 'CYCLE_V1') throw new Error('Expected cycle fixture');
    delete legacy.productCyclePriceOverride;
    expect(readRentalCyclePricing({ ...legacy, policy: { ...legacy.policy } })).toMatchObject({
      cyclePrice: 50000,
      priceSource: 'SHOP',
    });
    const priced = resolveRentalLinePricing({
      ...base,
      productCyclePriceOverride: 80000,
      quantity: 1,
      depositPerItem: 200000,
    });
    if (priced.pricingSnapshot.version !== 'CYCLE_V1') throw new Error('Expected cycle fixture');
    expect(
      readRentalCyclePricing({
        ...priced.pricingSnapshot,
        policy: { ...priced.pricingSnapshot.policy },
      }),
    ).toMatchObject({ cyclePrice: 80000, priceSource: 'PRODUCT' });
    expect(
      resolveRentalLinePricing({
        ...base,
        productCyclePriceOverride: 80000,
        quantity: 1,
        depositPerItem: 200000,
        billingRole: 'FREE_ACCESSORY',
      }),
    ).toMatchObject({ unitRentalPrice: 0, lineTotal: 0, depositAmount: 0 });
  });
  it.each([null, 0, 80000, 12.34])(
    'accepts an optional product price %s',
    async (rentalPriceOverride) => {
      expect(await validate(plainToInstance(UpdateProductReqDto, { rentalPriceOverride }))).toEqual(
        [],
      );
    },
  );
  it.each([-1, 100000001, 1.234, 'invalid'])(
    'rejects invalid product price %s',
    async (rentalPriceOverride) => {
      expect(
        (await validate(plainToInstance(UpdateProductReqDto, { rentalPriceOverride }))).length,
      ).toBeGreaterThan(0);
    },
  );
});
