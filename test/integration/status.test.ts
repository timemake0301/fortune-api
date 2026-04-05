import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { getTestDb, resetDb, seedPurchase, teardownDb } from '../helpers/db';
import { createTestEnv } from '../helpers/mocks';
import { handlePurchaseStatus } from '../../src/routes/status';

describe('handlePurchaseStatus', () => {
  let db: D1Database;
  let testEnv: ReturnType<typeof createTestEnv>;

  beforeAll(async () => { db = await getTestDb(); });
  beforeEach(async () => {
    await resetDb();
    testEnv = createTestEnv(db);
  });
  afterAll(async () => { await teardownDb(); });

  it('returns 404 for non-existent purchase', async () => {
    await expect(
      handlePurchaseStatus('00000000-0000-0000-0000-000000000000', testEnv)
    ).rejects.toThrow('Purchase not found');
  });

  it('returns status PAID with has_result=false', async () => {
    const { purchaseId } = await seedPurchase(db, { status: 'PAID' });
    const res = await handlePurchaseStatus(purchaseId, testEnv);
    const body = await res.json() as any;
    expect(body.data.status).toBe('PAID');
    expect(body.data.has_result).toBe(false);
  });

  it('returns status GENERATED with has_result=true', async () => {
    const { purchaseId } = await seedPurchase(db, { status: 'GENERATED', resultText: 'result' });
    const res = await handlePurchaseStatus(purchaseId, testEnv);
    const body = await res.json() as any;
    expect(body.data.status).toBe('GENERATED');
    expect(body.data.has_result).toBe(true);
  });

  it('returns status FAILED with has_result=false', async () => {
    const { purchaseId } = await seedPurchase(db, { status: 'FAILED' });
    const res = await handlePurchaseStatus(purchaseId, testEnv);
    const body = await res.json() as any;
    expect(body.data.status).toBe('FAILED');
    expect(body.data.has_result).toBe(false);
  });
});
