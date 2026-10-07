export interface BookableVariant {
  id: string;
  variantCode: string;
  productId: string;
  productName: string;
  allowFreeAccessory: boolean;
  sizeName: string | null;
  colorName: string | null;
  depositPerItem: number;
  ratePrice: number | null;
  availableInventory: Array<{ id: string; sku: string }>;
}

export const RENTAL_AVAILABILITY_READER = Symbol('RENTAL_AVAILABILITY_READER');

export interface RentalAvailabilityReader {
  getBookableVariant(input: RentalGetBookableVariantData): Promise<BookableVariant | null>;
  getBookableVariants(input: RentalGetBookableVariantsData): Promise<BookableVariant[]>;
  findActiveVariantIdsByProduct(
    shopId: string,
    productId: string,
    storefrontEligibility?: boolean,
  ): Promise<string[]>;
  findActiveVariantIdsByProducts(
    shopId: string,
    productIds: readonly string[],
    storefrontEligibility?: boolean,
  ): Promise<Record<string, string[]>>;
}

export interface RentalGetBookableVariantData {
  shopId: string;
  variantId: string;
  durationDays: number;
  from: Date;
  until: Date;
  /** Server-owned context set only by the Web rental application service. */
  storefrontEligibility?: true;
}

export interface RentalGetBookableVariantsData
  extends Omit<RentalGetBookableVariantData, 'variantId'> {
  variantIds: readonly string[];
}
