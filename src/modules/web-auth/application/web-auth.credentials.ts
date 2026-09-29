import { normalizeWebEmail } from '../domain/email';
import { authError } from './web-auth.errors';

export function normalizeWebAuthEmail(raw: string): string {
  return normalizeWebEmail(raw) ?? authError('INVALID_EMAIL');
}

export function validateWebAuthPassword(password: string): void {
  if (password.length < 8 || password.length > 64 || Buffer.byteLength(password, 'utf8') > 72)
    authError('INVALID_PASSWORD');
}
