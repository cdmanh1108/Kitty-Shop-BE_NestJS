export class InvalidCustomerPhoneError extends Error {
  readonly code = 'INVALID_PHONE';

  constructor() {
    super('Số điện thoại không hợp lệ.');
  }
}

/** Canonical Vietnamese phone key used for tenant-scoped lookup and uniqueness. */
export function normalizeCustomerPhone(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d+$/.test(compact)) throw new InvalidCustomerPhoneError();

  const national = compact.startsWith('+84')
    ? `0${compact.slice(3)}`
    : compact.startsWith('84')
      ? `0${compact.slice(2)}`
      : compact;

  if (!/^0\d{9}$/.test(national)) throw new InvalidCustomerPhoneError();
  return national;
}

export function normalizeCustomerPhoneSearch(value: string): string | undefined {
  try {
    return normalizeCustomerPhone(value);
  } catch {
    const digits = value.replace(/\D/g, '');
    if (!digits) return undefined;
    if (digits.startsWith('84') && digits.length > 2) return `0${digits.slice(2)}`;
    return digits;
  }
}
