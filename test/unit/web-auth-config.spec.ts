import { parseWebAuthConfiguration } from '../../src/config/web-auth.configuration';
describe('web auth configuration', () => {
  it('refuses OTP bypass in production', () => {
    expect(() =>
      parseWebAuthConfiguration({
        NODE_ENV: 'production',
        AUTH_OTP_BYPASS_ENABLED: 'true',
        AUTH_OTP_BYPASS_CODE: '123456',
      }),
    ).toThrow('forbidden');
  });
  it('requires a six-digit configured development code', () => {
    expect(() =>
      parseWebAuthConfiguration({
        NODE_ENV: 'development',
        AUTH_OTP_BYPASS_ENABLED: 'true',
        AUTH_OTP_BYPASS_CODE: '123',
      }),
    ).toThrow('six digits');
  });
});
