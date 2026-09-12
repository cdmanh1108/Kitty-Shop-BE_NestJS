import { validateEnvironment } from '../src/config/env.validation';
import configuration from '../src/config/configuration';

describe('environment validation and configuration', () => {
  const originalEnv = process.env;
  const validSecret = 'a'.repeat(32);
  const baseConfig = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test',
    JWT_ACCESS_SECRET: validSecret,
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validateEnvironment', () => {
    it('accepts minimal valid configuration', () => {
      expect(() => validateEnvironment(baseConfig)).not.toThrow();
    });

    it('throws when required DATABASE_URL is missing', () => {
      expect(() => validateEnvironment({ JWT_ACCESS_SECRET: validSecret })).toThrow(
        'Thiếu biến môi trường bắt buộc: DATABASE_URL.',
      );
    });

    it('allows omitting DATABASE_URL when SKIP_DATABASE_CONNECT is true', () => {
      expect(() =>
        validateEnvironment({
          SKIP_DATABASE_CONNECT: 'true',
          JWT_ACCESS_SECRET: validSecret,
        }),
      ).not.toThrow();
    });

    it('throws when JWT_ACCESS_SECRET is missing or too short', () => {
      expect(() => validateEnvironment({ DATABASE_URL: baseConfig.DATABASE_URL })).toThrow(
        'Thiếu biến môi trường bắt buộc: JWT_ACCESS_SECRET.',
      );

      expect(() => validateEnvironment({ ...baseConfig, JWT_ACCESS_SECRET: 'too-short' })).toThrow(
        'JWT_ACCESS_SECRET phải là khóa bí mật thực tế có ít nhất 32 ký tự.',
      );

      expect(() =>
        validateEnvironment({
          ...baseConfig,
          JWT_ACCESS_SECRET: 'replace-with-at-least-32-random-characters',
        }),
      ).toThrow('JWT_ACCESS_SECRET phải là khóa bí mật thực tế có ít nhất 32 ký tự.');
    });

    it('rejects weak secrets in production without leaking the secret value', () => {
      const weakSecret = 'password-secret-changeme-1234567890';
      let caughtError: Error | undefined;
      try {
        validateEnvironment({
          ...baseConfig,
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: weakSecret,
          DEFAULT_ADMIN_PASSWORD: 'SecureProductionPassword123!',
        });
      } catch (error) {
        caughtError = error as Error;
      }
      expect(caughtError).toBeDefined();
      expect(caughtError?.message).toContain('JWT_ACCESS_SECRET chứa giá trị yếu hoặc giá trị mẫu');
      expect(caughtError?.message).not.toContain(weakSecret);
    });

    it.each(['0', '-1', '65536', 'abc', '3000.5'])('rejects invalid PORT value %s', (port) => {
      expect(() => validateEnvironment({ ...baseConfig, PORT: port })).toThrow(
        'PORT phải là số nguyên từ 1 đến 65535.',
      );
    });

    it.each(['1', '3000', '8080', '65535'])('accepts valid PORT value %s', (port) => {
      expect(() => validateEnvironment({ ...baseConfig, PORT: port })).not.toThrow();
    });

    it.each(['0', '-100', 'abc', '10.5'])('rejects invalid RATE_LIMIT_TTL_MS %s', (ttl) => {
      expect(() => validateEnvironment({ ...baseConfig, RATE_LIMIT_TTL_MS: ttl })).toThrow(
        'RATE_LIMIT_TTL_MS phải là số nguyên dương.',
      );
    });

    it.each(['0', '-5', 'abc'])('rejects invalid RATE_LIMIT_LIMIT %s', (limit) => {
      expect(() => validateEnvironment({ ...baseConfig, RATE_LIMIT_LIMIT: limit })).toThrow(
        'RATE_LIMIT_LIMIT phải là số nguyên dương.',
      );
    });

    it.each(['yes', 'no', '1', '0', 'TRUE_VALUE'])('rejects non-boolean TRUST_PROXY %s', (val) => {
      expect(() => validateEnvironment({ ...baseConfig, TRUST_PROXY: val })).toThrow(
        'TRUST_PROXY phải là "true" hoặc "false".',
      );
    });

    it.each(['true', 'false', 'TRUE', 'FALSE'])('accepts valid boolean TRUST_PROXY %s', (val) => {
      expect(() => validateEnvironment({ ...baseConfig, TRUST_PROXY: val })).not.toThrow();
    });

    it.each(['yes', 'no', 'disabled'])('rejects non-boolean SWAGGER_ENABLED %s', (val) => {
      expect(() => validateEnvironment({ ...baseConfig, SWAGGER_ENABLED: val })).toThrow(
        'SWAGGER_ENABLED phải là "true" hoặc "false".',
      );
    });

    it.each(['staging', 'prod', 'local'])('rejects invalid NODE_ENV %s', (env) => {
      expect(() => validateEnvironment({ ...baseConfig, NODE_ENV: env })).toThrow(
        'NODE_ENV phải là development, test hoặc production.',
      );
    });

    it('rejects CORS wildcard in production with credentials', () => {
      expect(() =>
        validateEnvironment({
          ...baseConfig,
          NODE_ENV: 'production',
          CORS_ORIGINS: 'https://admin.example.com, *',
          DEFAULT_ADMIN_PASSWORD: 'SecureProductionPassword123!',
        }),
      ).toThrow(
        'CORS_ORIGINS không được chứa ký tự đại diện "*" trong môi trường production khi cho phép thông tin xác thực.',
      );
    });

    it('rejects default admin password in production', () => {
      expect(() =>
        validateEnvironment({
          ...baseConfig,
          NODE_ENV: 'production',
          DEFAULT_ADMIN_PASSWORD: 'ChangeMe123!',
        }),
      ).toThrow('Phải thay đổi DEFAULT_ADMIN_PASSWORD trước khi chạy trong môi trường production.');
    });
  });

  describe('configuration factory', () => {
    it('defaults swaggerEnabled to true in development/test and false in production', () => {
      delete process.env.SWAGGER_ENABLED;
      process.env.NODE_ENV = 'development';
      expect(configuration().swaggerEnabled).toBe(true);

      process.env.NODE_ENV = 'production';
      expect(configuration().swaggerEnabled).toBe(false);
    });

    it('honors explicit SWAGGER_ENABLED in any environment', () => {
      process.env.NODE_ENV = 'production';
      process.env.SWAGGER_ENABLED = 'true';
      expect(configuration().swaggerEnabled).toBe(true);

      process.env.NODE_ENV = 'development';
      process.env.SWAGGER_ENABLED = 'false';
      expect(configuration().swaggerEnabled).toBe(false);
    });

    it('parses corsOrigins with trimming and empty token removal', () => {
      process.env.CORS_ORIGINS = ' http://localhost:3000 , , https://app.example.com ';
      expect(configuration().corsOrigins).toEqual([
        'http://localhost:3000',
        'https://app.example.com',
      ]);
    });
  });
});
