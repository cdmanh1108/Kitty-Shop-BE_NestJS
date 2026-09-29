const EMAIL_PATTERN =
  /^[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Z0-9\p{L}\p{N}](?:[A-Z0-9\p{L}\p{N}-]{0,61}[A-Z0-9\p{L}\p{N}])?\.)+[\p{L}]{2,}$/iu;

/** The canonical Web Auth identity is a trimmed, lowercase email address. */
export function normalizeWebEmail(rawEmail: string): string | null {
  if (typeof rawEmail !== 'string') return null;

  const email = rawEmail.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}
