import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { getTestDb, resetDb, teardownDb } from '../helpers/db';
import { checkRateLimit, getClientIp } from '../../src/services/rateLimit';

describe('getClientIp', () => {
  it('extracts cf-connecting-ip header', () => {
    const req = new Request('http://localhost', {
      headers: { 'cf-connecting-ip': '1.2.3.4' },
    });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-forwarded-for (first IP)', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '5.6.7.8, 10.0.0.1' },
    });
    expect(getClientIp(req)).toBe('5.6.7.8');
  });

  it('defaults to 127.0.0.1 when no header', () => {
    const req = new Request('http://localhost');
    expect(getClientIp(req)).toBe('127.0.0.1');
  });

  it('prefers cf-connecting-ip over x-forwarded-for', () => {
    const req = new Request('http://localhost', {
      headers: { 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' },
    });
    expect(getClientIp(req)).toBe('1.1.1.1');
  });
});

describe('checkRateLimit', () => {
  let db: D1Database;

  beforeAll(async () => { db = await getTestDb(); });
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await teardownDb(); });

  it('allows first request', async () => {
    expect(await checkRateLimit(db, '10.0.0.1', 'generate')).toBe(true);
  });

  it('allows up to maxRequests within window', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await checkRateLimit(db, '10.0.0.2', 'generate')).toBe(true);
    }
  });

  it('blocks request exceeding maxRequests', async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(db, '10.0.0.3', 'generate');
    }
    expect(await checkRateLimit(db, '10.0.0.3', 'generate')).toBe(false);
  });

  it('different IPs have separate limits', async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(db, '10.0.0.4', 'generate');
    }
    expect(await checkRateLimit(db, '10.0.0.4', 'generate')).toBe(false);
    expect(await checkRateLimit(db, '10.0.0.5', 'generate')).toBe(true);
  });

  it('returns true for unknown endpoint', async () => {
    expect(await checkRateLimit(db, '10.0.0.6', 'unknown')).toBe(true);
  });

  it('payment endpoint allows 10 requests', async () => {
    for (let i = 0; i < 10; i++) {
      expect(await checkRateLimit(db, '10.0.0.7', 'payment')).toBe(true);
    }
    expect(await checkRateLimit(db, '10.0.0.7', 'payment')).toBe(false);
  });
});
