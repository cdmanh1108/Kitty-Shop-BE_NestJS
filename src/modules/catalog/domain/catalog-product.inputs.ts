export interface CreateProductData {
  code: string;
  name: string;
  slug?: string;
  categoryId: string;
  description?: string;
  defaultDepositAmount: number;
  replacementValue?: number | null;
  facebookPostUrl?: string | null;
  isPublic: boolean;
  variants: Array<{
    variantCode: string;
    sizeId?: string;
    colorId?: string;
    depositAmountOverride?: number;
    inventoryCount: number;
    skuPrefix?: string;
    rentalRates: Array<{ durationDays: number; price: number }>;
  }>;
  media: Array<{ url: string; altText?: string; isPrimary: boolean; sortOrder: number }>;
}

export interface UpdateProductData {
  name?: string;
  slug?: string;
  categoryId?: string;
  description?: string;
  defaultDepositAmount?: number;
  replacementValue?: number | null;
  facebookPostUrl?: string | null;
  isPublic?: boolean;
  isRentable?: boolean;
  status?: string;
}

export interface ProductMediaData {
  url: string;
  storageKey?: string | null;
  altText?: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface CatalogListProductsCriteria {
  shopId: string;
  search?: string;
  categoryId?: string;
  status?: string;
  page: number;
  limit: number;
}
