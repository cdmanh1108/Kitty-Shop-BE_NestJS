import {
  assertWebRentalItems,
  parseWebRentalDateRange,
  WEB_RENTAL_MAX_ITEM_COUNT,
  WEB_RENTAL_MAX_QUANTITY_PER_ITEM,
  WEB_RENTAL_MAX_TOTAL_QUANTITY,
  WebRentalInputValidationError,
} from '../../src/modules/rentals/application/web-rental-input-validation';

describe('Web rental input validation', () => {
  it.each(['2026-02-29', '2026-04-31', '2026-2-03', '2026-10-03T00:00:00Z'])(
    'rejects non-calendar Web date %s',
    (pickupDate) => {
      expect(() => parseWebRentalDateRange({ pickupDate, returnDate: '2026-10-04' })).toThrow(
        WebRentalInputValidationError,
      );
    },
  );

  it('accepts leap-day dates and preserves date-only UTC values', () => {
    expect(parseWebRentalDateRange({ pickupDate: '2028-02-29', returnDate: '2028-03-01' })).toEqual(
      {
        from: new Date('2028-02-29T00:00:00.000Z'),
        until: new Date('2028-03-01T00:00:00.000Z'),
      },
    );
  });

  it('rejects an inverted or empty rental interval', () => {
    expect(() =>
      parseWebRentalDateRange({ pickupDate: '2026-10-04', returnDate: '2026-10-04' }),
    ).toThrow(WebRentalInputValidationError);
  });

  it('guards raw item count, per-line quantity, and merged-demand total before resolution', () => {
    const line = { variantId: 'variant', quantity: 1 };
    expect(() =>
      assertWebRentalItems(Array.from({ length: WEB_RENTAL_MAX_ITEM_COUNT + 1 }, () => line)),
    ).toThrow(WebRentalInputValidationError);
    expect(() =>
      assertWebRentalItems([
        { variantId: 'variant', quantity: WEB_RENTAL_MAX_QUANTITY_PER_ITEM + 1 },
      ]),
    ).toThrow(WebRentalInputValidationError);
    expect(() =>
      assertWebRentalItems([
        { variantId: 'variant-a', quantity: WEB_RENTAL_MAX_QUANTITY_PER_ITEM },
        { variantId: 'variant-a', quantity: WEB_RENTAL_MAX_QUANTITY_PER_ITEM },
        { variantId: 'variant-b', quantity: WEB_RENTAL_MAX_TOTAL_QUANTITY - 39 },
      ]),
    ).toThrow(WebRentalInputValidationError);
  });
});
