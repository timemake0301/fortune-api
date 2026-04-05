import { Env } from '../../src/types';

export function createTestEnv(db: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    ALLOWED_ORIGIN: '*',
    OPENAI_API_KEY: 'test-openai-key',
    GEMINI_API_KEY: 'test-gemini-key',
    LINE_CHANNEL_SECRET: 'test-line-secret',
    LINE_CHANNEL_ACCESS_TOKEN: 'test-line-token',
    LP_URL: 'https://test-lp.example.com',
    SBPS_MERCHANT_ID: '30132',
    SBPS_SERVICE_ID: '101',
    SBPS_HASH_KEY: 'test-hash-key',
    SBPS_API_URL: 'https://stbfep.sps-system.com/f01/FepBuyInfoReceive.do',
    SBPS_RETURN_URL: 'https://test.example.com/api/sbps/return',
    SBPS_PAGECON_URL: 'https://test.example.com/api/sbps/pagecon',
    ...overrides,
  };
}
