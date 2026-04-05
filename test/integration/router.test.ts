import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { getTestDb, resetDb, teardownDb } from '../helpers/db';
import worker from '../../src/index';
import { Env } from '../../src/types';

describe('router (fetch handler)', () => {
  let db: D1Database;
  let testEnv: Env;

  beforeAll(async () => {
    db = await getTestDb();
    testEnv = {
      DB: db,
      ALLOWED_ORIGIN: '*',
      SBPS_MERCHANT_ID: '30132',
      SBPS_SERVICE_ID: '101',
      SBPS_HASH_KEY: 'test-hash-key',
      SBPS_API_URL: 'https://stbfep.sps-system.com/f01/FepBuyInfoReceive.do',
      SBPS_RETURN_URL: 'https://test.example.com/api/sbps/return',
      SBPS_PAGECON_URL: 'https://test.example.com/api/sbps/pagecon',
    };
  });
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await teardownDb(); });

  it('OPTIONS returns 200 with CORS headers', async () => {
    const req = new Request('http://localhost/api/webhook/payment', { method: 'OPTIONS' });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('GET /api/health returns { status: ok }', async () => {
    const req = new Request('http://localhost/api/health');
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.status).toBe('ok');
  });

  it('unknown path returns 404 ERR_NOT_FOUND', async () => {
    const req = new Request('http://localhost/api/nonexistent');
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error.code).toBe('ERR_NOT_FOUND');
  });

  it('GET on POST-only route returns 404', async () => {
    const req = new Request('http://localhost/api/webhook/payment', { method: 'GET' });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(404);
  });

  it('invalid UUID in purchase routes returns 400', async () => {
    const req = new Request('http://localhost/api/purchase/not-uuid/status');
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error.code).toBe('ERR_INVALID_ID');
  });

  it('POST /api/webhook/payment routes correctly', async () => {
    const req = new Request('http://localhost/api/webhook/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_id: 'router-test-1', amount: 500, signature: 'mock' }),
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.status).toBe('PAID');
  });

  it('GET /api/purchase/:id/status with valid UUID routes correctly', async () => {
    const createReq = new Request('http://localhost/api/webhook/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_id: 'router-test-2', amount: 500, signature: 'mock' }),
    });
    const createRes = await worker.fetch(createReq, testEnv);
    const createBody = await createRes.json() as any;
    const purchaseId = createBody.data.purchase_id;

    const req = new Request(`http://localhost/api/purchase/${purchaseId}/status`);
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.status).toBe('PAID');
  });

  it('security headers are present', async () => {
    const req = new Request('http://localhost/api/health');
    const res = await worker.fetch(req, testEnv);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });
});
