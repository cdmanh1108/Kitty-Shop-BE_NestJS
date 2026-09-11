import type { DecimalValue } from '@common/types/decimal';
import type { JsonValue } from '@common/types/json';

export interface CustomerRecord {
  id: string;
  shopId: string;
  customerCode: string;
  fullName: string;
  phone: string;
  normalizedPhone: string;
  email: string | null;
  facebook: string | null;
  zalo: string | null;
  birthday: Date | null;
  gender: string | null;
  customerType: string;
  status: string;
  source: string | null;
  metadata: JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface CustomerNoteRecord {
  id: string;
  customerId: string;
  content: string;
  isPinned: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerAddressRecord {
  id: string;
  customerId: string;
  label: string | null;
  recipientName: string | null;
  phone: string | null;
  addressLine: string;
  ward: string | null;
  district: string | null;
  city: string | null;
  province: string | null;
  country: string;
  latitude: DecimalValue | null;
  longitude: DecimalValue | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
