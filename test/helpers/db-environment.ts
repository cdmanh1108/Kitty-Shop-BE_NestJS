// Loaded before AppModule so tests never inherit developer secrets/configuration.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
process.env.JWT_ACCESS_SECRET = 'kitty-test-only-signing-key-never-for-deployment';
process.env.WEB_JWT_ACCESS_SECRET = 'kitty-web-test-signing-key-never-for-deployment';
process.env.AUTH_OTP_HASH_SECRET = 'kitty-otp-test-hash-key-never-for-deployment';
process.env.WEB_JWT_ACCESS_TTL_SECONDS = '900';
process.env.WEB_REFRESH_TOKEN_TTL_DAYS = '7';
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.REFRESH_TOKEN_TTL_DAYS = '7';
process.env.API_PREFIX = 'api/v1';
process.env.PORT = '3000';
process.env.APP_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = '';
// Test HTTP server is the only trusted hop; suites may isolate rate-limit buckets by client IP.
process.env.TRUST_PROXY = 'true';
process.env.SWAGGER_ENABLED = 'false';
process.env.SKIP_DATABASE_CONNECT = 'false';
process.env.RATE_LIMIT_TTL_MS = '60000';
process.env.RATE_LIMIT_LIMIT = '300';
process.env.LOG_LEVEL = 'error';
process.env.AUTH_OTP_BYPASS_ENABLED = 'true';
process.env.AUTH_OTP_BYPASS_CODE = '123456';
process.env.AUTH_OTP_TTL_SECONDS = '300';
process.env.AUTH_OTP_MAX_ATTEMPTS = '5';
process.env.AUTH_OTP_RESEND_COOLDOWN_SECONDS = '60';
