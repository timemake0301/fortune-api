import { describe, it, expect } from 'vitest';
import { verifyLineSignature } from '../../src/services/lineSignature';

/** テスト用にHMAC-SHA256署名を生成 */
async function computeSignature(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

describe('verifyLineSignature', () => {
  const secret = 'test-channel-secret';

  it('returns true for valid signature', async () => {
    const body = '{"events":[]}';
    const sig = await computeSignature(secret, body);
    expect(await verifyLineSignature(secret, body, sig)).toBe(true);
  });

  it('returns false for tampered body', async () => {
    const sig = await computeSignature(secret, '{"events":[]}');
    expect(await verifyLineSignature(secret, '{"events":[{"type":"message"}]}', sig)).toBe(false);
  });

  it('returns false for wrong secret', async () => {
    const body = '{"events":[]}';
    const sig = await computeSignature('wrong-secret', body);
    expect(await verifyLineSignature(secret, body, sig)).toBe(false);
  });

  it('returns false for empty signature', async () => {
    expect(await verifyLineSignature(secret, '{}', '')).toBe(false);
  });

  it('handles Unicode body correctly', async () => {
    const body = '{"text":"日本語テスト"}';
    const sig = await computeSignature(secret, body);
    expect(await verifyLineSignature(secret, body, sig)).toBe(true);
  });
});
