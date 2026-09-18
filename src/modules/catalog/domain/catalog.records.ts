import type { DecimalValue } from '@common/types/decimal';
import type { JsonValue } from '@common/types/json';

export interface CategoryRecord {
  id: string;
  shopId: string;
  parentId: string | null;
  code: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SizeRecord {
  id: string;
  shopId: string;
  code: string;
  name: string;
  sortOrder: number;
  createdAt: Date;
}

export interface ColorRecord {
  id: string;
  shopId: string;
  code: string;
  name: string;
  hexColor: string | null;
  createdAt: Date;
}

export interface ProductRecord {
  id: string;
  shopId: string;
  categoryId: string;
  code: string;
  name: string;
  slug: string | null;
  description: string | null;
  defaultDepositAmount: DecimalValue;
  replacementValue: DecimalValue | null;
  facebookPostUrl: string | null;
  currency: string;
  status: string;
  isRentable: boolean;
  isPublic: boolean;
  metadata: JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface ProductVariantRecord {
  id: string;
  shopId: string;
  productId: string;
  variantCode: string;
  sizeId: string | null;
  colorId: string | null;
  depositAmountOverride: DecimalValue | null;
  status: string;
  metadata: JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface ProductMediaRecord {
  id: string;
  shopId: string;
  productId: string;
  variantId: string | null;
  mediaType: string;
  storageKey: string | null;
  url: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
  metadata: JsonValue | null;
  createdAt: Date;
}

export interface InventoryItemRecord {
  id: string;
  shopId: string;
  variantId: string;
  locationId: string | null;
  sku: string;
  barcode: string | null;
  currentStatus: string;
  condition: string;
  purchasePrice: DecimalValue | null;
  purchaseDate: Date | null;
  acquiredFrom: string | null;
  totalRentalCount: number;
  lastRentedAt: Date | null;
  notes: string | null;
  metadata: JsonValue | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface RentalRateRecord {
  id: string;
  shopId: string;
  productId: string;
  variantId: string | null;
  durationDays: number;
  price: DecimalValue;
  currency: string;
  validFrom: Date | null;
  validUntil: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryStatusHistoryRecord {
  id: string;
  shopId: string;
  inventoryItemId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  orderId: string | null;
  serviceRecordId: string | null;
  notes: string | null;
  changedBy: string | null;
  changedAt: Date;
}

export interface InventoryServiceRecord {
  id: string;
  shopId: string;
  inventoryItemId: string;
  orderId: string | null;
  serviceType: string;
  status: string;
  description: string | null;
  vendorName: string | null;
  cost: DecimalValue;
  currency: string;
  startedAt: Date;
  completedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
