import { webAuthError } from './web-auth.errors';
import type { WebAccount, WebProfile } from './web-auth.repository';

export interface UpdateWebProfileInput {
  fullName: string;
  phone: string;
}

export function normalizeWebContact(input: UpdateWebProfileInput): {
  fullName: string;
  contactPhone: string;
} {
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
  if (fullName.length < 2 || fullName.length > 100) webAuthError('INVALID_PROFILE_NAME');
  const compact =
    typeof input.phone === 'string' ? input.phone.trim().replace(/[\s().-]/g, '') : '';
  const contactPhone = compact.startsWith('+84') ? `0${compact.slice(3)}` : compact;
  if (!/^0\d{9}$/.test(contactPhone)) webAuthError('INVALID_PHONE');
  return { fullName, contactPhone };
}

export function webAccountProfile(account: WebAccount): WebProfile {
  return {
    id: account.id,
    email: account.email,
    fullName: account.fullName ?? null,
    phone: account.contactPhone ?? null,
    emailVerifiedAt: account.emailVerifiedAt,
    createdAt: account.createdAt,
  };
}
