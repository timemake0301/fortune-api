import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { getTestDb, resetDb, seedPurchase, teardownDb } from '../helpers/db';
import { createTestEnv } from '../helpers/mocks';
import { handleResult } from '../../src/routes/result';
import { hashToken } from '../../src/crypto';

describe('handleResult', () => {
  const VIEW_TOKEN = 'b'.repeat(64);
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

  function makeRequest(purchaseId: string, token?: string): Request {
    const url = token
      ? `http://localhost/api/purchase/${purchaseId}/result?view_token=${token}`
      : `http://localhost/api/purchase/${purchaseId}/result`;
    return new Request(url);
  }

  it('returns 401 without view_token', async () => {
    const { purchaseId } = await seedPurchase(db, { viewTokenHash });
    const req = makeRequest(purchaseId);
    await expect(handleResult(purchaseId, req, testEnv)).rejects.toThrow('view_token is required');
  });

  it('returns 404 for non-existent purchase', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const req = makeRequest(fakeId, VIEW_TOKEN);
    await expect(handleResult(fakeId, req, testEnv)).rejects.toThrow('Purchase not found');
  });

  it('returns 403 for wrong view_token', async () => {
    const { purchaseId } = await seedPurchase(db, { viewTokenHash });
    const req = makeRequest(purchaseId, 'wrong-token');
    await expect(handleResult(purchaseId, req, testEnv)).rejects.toThrow('Invalid view_token');
  });

  it('returns status PAID with null result', async () => {
    const { purchaseId } = await seedPurchase(db, { viewTokenHash, status: 'PAID' });
    const req = makeRequest(purchaseId, VIEW_TOKEN);
    const res = await handleResult(purchaseId, req, testEnv);
    const body = await res.json() as any;
    expect(body.data.status).toBe('PAID');
    expect(body.data.result).toBeNull();
  });

  it('returns status FAILED with null result', async () => {
    const { purchaseId } = await seedPurchase(db, { viewTokenHash, status: 'FAILED' });
    const req = makeRequest(purchaseId, VIEW_TOKEN);
    const res = await handleResult(purchaseId, req, testEnv);
    const body = await res.json() as any;
    expect(body.data.status).toBe('FAILED');
    expect(body.data.result).toBeNull();
  });

  it('returns full result when GENERATED', async () => {
    const { purchaseId } = await seedPurchase(db, {
      viewTokenHash,
      status: 'GENERATED',
      resultText: '占い結果テキスト',
      resultImageUrl: 'data:image/png;base64,abc',
    });
    const req = makeRequest(purchaseId, VIEW_TOKEN);
    const res = await handleResult(purchaseId, req, testEnv);
    const body = await res.json() as any;
    expect(body.data.status).toBe('GENERATED');
    expect(body.data.result.text).toBe('占い結果テキスト');
    expect(body.data.result.image_url).toBe('data:image/png;base64,abc');
  });
});
