import type { PaginatedResult, PaginationParams } from '@common/types/pagination';

export type WebAccountVerification = 'verified' | 'unverified';

/** Read projection only. Credentials and sessions never enter the Admin read model. */
export interface AdminWebAccountRecord {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  emailVerifiedAt: Date | null;
  disabledAt: Date | null;
  createdAt: Date;
  rentalOrderCount: number;
  lastRentalAt: Date | null;
}

export interface AdminWebAccountListCriteria extends PaginationParams {
  shopId: string;
  search?: string;
  verification?: WebAccountVerification;
  /** Actual booking relationship; never inferred from contact defaults. */
  customerId?: string;
}

export const ADMIN_WEB_ACCOUNT_READER = Symbol('ADMIN_WEB_ACCOUNT_READER');

export interface AdminWebAccountReader {
  list(input: AdminWebAccountListCriteria): Promise<PaginatedResult<AdminWebAccountRecord>>;
  get(shopId: string, id: string): Promise<AdminWebAccountRecord | null>;
}
