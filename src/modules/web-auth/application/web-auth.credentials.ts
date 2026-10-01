import { normalizeWebEmail } from '../domain/email';
import { webAuthError } from '../domain/web-auth.errors';

export function normalizeWebAuthEmail(raw: string): string {
  return normalizeWebEmail(raw) ?? webAuthError('INVALID_EMAIL');
}

export function validateWebAuthPassword(password: string): void {
  if (password.length < 8 || password.length > 64 || Buffer.byteLength(password, 'utf8') > 72)
    webAuthError('INVALID_PASSWORD');
}
