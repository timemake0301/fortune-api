import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { getTestDb, resetDb, teardownDb } from '../helpers/db';
import { createTestEnv } from '../helpers/mocks';
import { handleWebhookPayment } from '../../src/routes/webhook';

describe('handleWebhookPayment', () => {
  let db: D1Database;
  let testEnv: ReturnType<typeof createTestEnv>;

  beforeAll(async () => {
    db = await getTestDb();
    testEnv = createTestEnv(db);
  });
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await teardownDb(); });

  function makeRequest(body: object): Request {
    return new Request('http://localhost/api/webhook/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('creates purchase with status PAID for valid payment_id', async () => {
    const req = makeRequest({ payment_id: 'pay-001', amount: 500, signature: 'mock' });
    const res = await handleWebhookPayment(req, testEnv);
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('PAID');
    expect(body.data.purchase_id).toBeTruthy();
    expect(body.data.view_token).toBeTruthy();
  });

  it('returns purchase_id as valid UUID', async () => {
    const req = makeRequest({ payment_id: 'pay-002', amount: 500, signature: 'mock' });
    const res = await handleWebhookPayment(req, testEnv);
    const body = await res.json() as any;
    expect(body.data.purchase_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('returns duplicate:true for same payment_id (idempotency)', async () => {
    const req1 = makeRequest({ payment_id: 'pay-dup', amount: 500, signature: 'mock' });
    await handleWebhookPayment(req1, testEnv);

    const req2 = makeRequest({ payment_id: 'pay-dup', amount: 500, signature: 'mock' });
    const res2 = await handleWebhookPayment(req2, testEnv);
    expect(res2.status).toBe(200);

    const body = await res2.json() as any;
    expect(body.data.duplicate).toBe(true);
  });

  it('throws ApiError 400 when payment_id is missing', async () => {
    const req = makeRequest({ amount: 500 });
    await expect(handleWebhookPayment(req, testEnv)).rejects.toThrow('payment_id is required');
  });

  it('stores view_token_hash in database', async () => {
    const req = makeRequest({ payment_id: 'pay-hash', amount: 500, signature: 'mock' });
    const res = await handleWebhookPayment(req, testEnv);
    const body = await res.json() as any;

    const row = await db.prepare(
      'SELECT view_token_hash FROM purchase WHERE purchase_id = ?'
    ).bind(body.data.purchase_id).first<{ view_token_hash: string }>();

    expect(row).toBeTruthy();
    expect(row!.view_token_hash).toBeTruthy();
    expect(row!.view_token_hash.length).toBe(64);
  });
});
