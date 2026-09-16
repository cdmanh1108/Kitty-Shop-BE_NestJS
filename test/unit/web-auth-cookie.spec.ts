import type { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../../src/config/configuration';
import { WebAuthCookies } from '../../src/modules/web-auth/api/web-jwt-auth';

const cookiesFor = (nodeEnv: string): WebAuthCookies => {
  const values = { nodeEnv, apiPrefix: 'api/v1' };
  const config = {
    get: (key: keyof typeof values) => values[key],
  } as unknown as ConfigService<AppConfiguration, true>;
  return new WebAuthCookies(config);
};

describe('Web Auth cookies', () => {
  it('uses local cookie names without Secure in development', () => {
    const cookies = cookiesFor('development');
    expect(cookies.accessName).toBe('kitty_web_access');
    expect(cookies.refreshName).toBe('kitty_web_refresh');
    expect(cookies.accessOptions).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api',
    });
    expect(cookies.refreshOptions.path).toBe('/api/v1/web/auth');
  });

  it('uses __Secure names and Secure cookies in production', () => {
    const cookies = cookiesFor('production');
    expect(cookies.accessName).toBe('__Secure-kitty_web_access');
    expect(cookies.refreshName).toBe('__Secure-kitty_web_refresh');
    expect(cookies.accessOptions.secure).toBe(true);
    expect(cookies.refreshOptions.secure).toBe(true);
  });
});
