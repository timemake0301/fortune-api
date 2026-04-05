import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { getTestDb, resetDb, seedPurchase, teardownDb } from '../helpers/db';
import { createTestEnv } from '../helpers/mocks';
import { handleGenerate } from '../../src/routes/generate';
import { hashToken } from '../../src/crypto';

// パイプラインをモック（外部APIを呼ばない）
vi.mock('../../src/services/pipeline', () => ({
  runGenerationPipeline: vi.fn().mockResolvedValue({
    resultText: 'テスト占い結果テキスト',
    resultImageUrl: 'data:image/png;base64,dGVzdA==',
    cardTheme: 'test theme',
  }),
  PipelineError: class PipelineError extends Error {
    stage: string;
    constructor(stage: string, message: string, public readonly cause?: unknown) {
      super(message);
      this.name = 'PipelineError';
      this.stage = stage;
    }
  },
}));

describe('handleGenerate', () => {
  const VIEW_TOKEN = 'a'.repeat(64);
  let viewTokenHash: string;
  let db: D1Database;
  let testEnv: ReturnType<typeof createTestEnv>;

  beforeAll(async () => {
    db = await getTestDb();
    viewTokenHash = await hashToken(VIEW_TOKEN);
  });
  beforeEach(async () => {
    await resetDb();
    testEnv = createTestEnv(db);
  });
  afterAll(async () => { await teardownDb(); });

  function makeRequest(body: object): Request {
    return new Request('http://localhost/api/purchase/test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('rejects missing prompt_input with 400', async () => {
    const { purchaseId } = await seedPurchase(db, { viewTokenHash });
    const req = makeRequest({ view_token: VIEW_TOKEN });
    await expect(handleGenerate(purchaseId, req, testEnv)).rejects.toThrow('prompt_input is required');
  });

  it('rejects prompt_input > 500 chars with 400', async () => {
    const { purchaseId } = await seedPurchase(db, { viewTokenHash });
    const req = makeRequest({ prompt_input: 'あ'.repeat(501), view_token: VIEW_TOKEN });
    await expect(handleGenerate(purchaseId, req, testEnv)).rejects.toThrow('1-500 characters');
  });

  it('rejects missing view_token with 401', async () => {
    const { purchaseId } = await seedPurchase(db, { viewTokenHash });
    const req = makeRequest({ prompt_input: '恋愛について' });
    await expect(handleGenerate(purchaseId, req, testEnv)).rejects.toThrow('view_token is required');
  });

  it('rejects non-existent purchase with 404', async () => {
    const req = makeRequest({ prompt_input: '恋愛について', view_token: VIEW_TOKEN });
    await expect(handleGenerate('00000000-0000-0000-0000-000000000000', req, testEnv))
      .rejects.toThrow('Purchase not found');
  });

  it('rejects wrong view_token with 403', async () => {
    const { purchaseId } = await seedPurchase(db, { viewTokenHash });
    const req = makeRequest({ prompt_input: '恋愛について', view_token: 'wrong-token' });
    await expect(handleGenerate(purchaseId, req, testEnv)).rejects.toThrow('Invalid view_token');
  });

  it('rejects already-GENERATED purchase with 409', async () => {
    const { purchaseId } = await seedPurchase(db, {
      viewTokenHash,
      status: 'GENERATED',
      resultText: 'existing result',
    });
    const req = makeRequest({ prompt_input: '恋愛について', view_token: VIEW_TOKEN });
    await expect(handleGenerate(purchaseId, req, testEnv)).rejects.toThrow('already generated');
  });

  it('on success, updates status to GENERATED', async () => {
    const { purchaseId } = await seedPurchase(db, { viewTokenHash });
    const req = makeRequest({ prompt_input: '恋愛について', view_token: VIEW_TOKEN });
    const res = await handleGenerate(purchaseId, req, testEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.status).toBe('GENERATED');

    const row = await db.prepare(
      'SELECT status, result_text FROM purchase WHERE purchase_id = ?'
    ).bind(purchaseId).first<{ status: string; result_text: string }>();
    expect(row!.status).toBe('GENERATED');
    expect(row!.result_text).toBe('テスト占い結果テキスト');
  });
});
