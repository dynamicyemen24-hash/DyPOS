/**
 * Test environment setup — loaded via --import before tests run.
 * MUST be ESM-compatible (no dynamic imports of server code here).
 */
process.env.NODE_ENV = 'test';
process.env.DYPOS_JWT_SECRET = 'test-secret-for-testing-only-32-chars-minimum';
process.env.DYPOS_PORT = '0';
process.env.DYPOS_DB_PATH = ':memory:';
process.env.DYPOS_CORS_ORIGIN = 'http://localhost:5173';
