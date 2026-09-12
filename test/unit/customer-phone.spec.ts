import {
  InvalidCustomerPhoneError,
  normalizeCustomerPhone,
  normalizeCustomerPhoneSearch,
} from '../../src/modules/customers/domain/customer-phone';

describe('customer phone normalization', () => {
  it.each([
    ['0912345678', '0912345678'],
    ['+84 912 345 678', '0912345678'],
    ['84-912-345-678', '0912345678'],
    ['(091) 234.5678', '0912345678'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeCustomerPhone(input)).toBe(expected);
  });

  it.each(['', '1234', '+849123456789', '0912abc678'])('rejects invalid phone %s', (input) => {
    expect(() => normalizeCustomerPhone(input)).toThrow(InvalidCustomerPhoneError);
  });

  it('normalizes phone-like partial searches without rejecting name searches', () => {
    expect(normalizeCustomerPhoneSearch('+84 912')).toBe('0912');
    expect(normalizeCustomerPhoneSearch('Nguyen Van A')).toBeUndefined();
  });
});
