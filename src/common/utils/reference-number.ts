import { randomBytes } from 'node:crypto';

/** Existing UTC date + 3 random bytes format. Database uniqueness remains authoritative. */
export function generateDatedReference(prefix: 'RT' | 'PAY' | 'EXP'): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `${prefix}-${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
}
