// Provide the minimal env so modules that import env.ts can load during tests.
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.UNLINK_API_KEY ??= 'test-api-key';
process.env.MNEMONIC_ENCRYPTION_KEY ??=
  '0000000000000000000000000000000000000000000000000000000000000000';
