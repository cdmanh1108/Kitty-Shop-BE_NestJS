export function normalizeWebPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, '');
  const national = compact.startsWith('+84')
    ? `0${compact.slice(3)}`
    : compact.startsWith('84')
      ? `0${compact.slice(2)}`
      : compact;
  return /^0[35789]\d{8}$/.test(national) ? `+84${national.slice(1)}` : null;
}
