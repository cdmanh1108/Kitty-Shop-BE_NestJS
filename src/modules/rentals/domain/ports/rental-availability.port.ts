export interface BookableVariant {
  id: string;
  variantCode: string;
  productId: string;
  productName: string;
  allowFreeAccessory: boolean;
  sizeName: string | null;
  colorName: string | null;
  depositPerItem: number;
  productCyclePriceOverride?: number | null;
  availableInventory: Array<{ id: string; sku: string }>;
}

export const RENTAL_AVAILABILITY_READER = Symbol('RENTAL_AVAILABILITY_READER');

export interface RentalAvailabilityReader {
  getBookableVariant(input: RentalGetBookableVariantData): Promise<BookableVariant | null>;
  getBookableVariants(input: RentalGetBookableVariantsData): Promise<BookableVariant[]>;
}

export interface RentalGetBookableVariantData {
  shopId: string;
  variantId: string;
  from: Date;
  until: Date;
  /** Server-owned context set only by the Web rental application service. */
  storefrontEligibility?: true;
}

export interface RentalGetBookableVariantsData
  extends Omit<RentalGetBookableVariantData, 'variantId'> {
  variantIds: readonly string[];
}
