// Loaded before AppModule so tests never inherit developer secrets/configuration.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
process.env.JWT_ACCESS_SECRET = 'kitty-test-only-signing-key-never-for-deployment';
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.REFRESH_TOKEN_TTL_DAYS = '7';
process.env.API_PREFIX = 'api/v1';
process.env.PORT = '3000';
process.env.APP_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = '';
process.env.TRUST_PROXY = 'false';
process.env.SWAGGER_ENABLED = 'false';
process.env.SKIP_DATABASE_CONNECT = 'false';
process.env.RATE_LIMIT_TTL_MS = '60000';
process.env.RATE_LIMIT_LIMIT = '300';
process.env.LOG_LEVEL = 'error';
