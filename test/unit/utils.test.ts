import { describe, it, expect } from 'vitest';
import { assertUuid, normalizePath, ApiError, respond, handleError } from '../../src/utils';

describe('assertUuid', () => {
  it('accepts valid lowercase UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(assertUuid(uuid, 'test_id')).toBe(uuid);
  });

  it('accepts valid uppercase UUID', () => {
    const uuid = '550E8400-E29B-41D4-A716-446655440000';
    expect(assertUuid(uuid, 'test_id')).toBe(uuid);
  });

  it('throws ApiError 400 for empty string', () => {
    expect(() => assertUuid('', 'test_id')).toThrow(ApiError);
    try { assertUuid('', 'test_id'); } catch (e) {
      expect((e as ApiError).status).toBe(400);
      expect((e as ApiError).code).toBe('ERR_INVALID_ID');
    }
  });

  it('throws ApiError 400 for non-UUID string', () => {
    expect(() => assertUuid('not-a-uuid', 'test_id')).toThrow(ApiError);
  });

  it('throws ApiError 400 for UUID-like but wrong length', () => {
    expect(() => assertUuid('550e8400-e29b-41d4-a716', 'test_id')).toThrow(ApiError);
  });

  it('includes field name in error message', () => {
    try { assertUuid('bad', 'purchase_id'); } catch (e) {
      expect((e as ApiError).message).toContain('purchase_id');
    }
  });
});

describe('normalizePath', () => {
  it('removes trailing slash', () => {
    expect(normalizePath('/api/test/')).toBe('/api/test');
  });

  it('removes multiple trailing slashes', () => {
    expect(normalizePath('/api/test///')).toBe('/api/test');
  });

  it('returns / for root', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('leaves path without trailing slash unchanged', () => {
    expect(normalizePath('/api/test')).toBe('/api/test');
  });
});

describe('respond', () => {
  it('returns correct status code', () => {
    const res = respond(201, { ok: true });
    expect(res.status).toBe(201);
  });

  it('sets Content-Type to application/json', () => {
    const res = respond(200, {});
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('sets CORS to * when env is undefined', () => {
    const res = respond(200, {});
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('sets CORS from env.ALLOWED_ORIGIN', () => {
    const res = respond(200, {}, { ALLOWED_ORIGIN: 'https://example.com' } as any);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
  });

  it('sets security headers', () => {
    const res = respond(200, {});
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('serializes body as JSON', async () => {
    const res = respond(200, { key: 'value' });
    const body = await res.json();
    expect(body).toEqual({ key: 'value' });
  });
});

describe('handleError', () => {
  it('converts ApiError to structured JSON with correct status', async () => {
    const error = new ApiError(403, 'ERR_FORBIDDEN', 'Access denied');
    const res = handleError(error);
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ERR_FORBIDDEN');
    expect(body.error.message).toBe('Access denied');
  });

  it('converts unknown error to 500 ERR_INTERNAL', async () => {
    const res = handleError(new Error('something broke'));
    expect(res.status).toBe(500);
    const body = await res.json() as any;
    expect(body.error.code).toBe('ERR_INTERNAL');
  });
});
