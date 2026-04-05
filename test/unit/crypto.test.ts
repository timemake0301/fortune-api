import { describe, it, expect } from 'vitest';
import { generateViewToken, hashToken, verifyViewToken } from '../../src/crypto';

describe('generateViewToken', () => {
  it('returns token of 64 hex characters', async () => {
    const { token } = await generateViewToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns hash of 64 hex characters', async () => {
    const { hash } = await generateViewToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('token and hash are different values', async () => {
    const { token, hash } = await generateViewToken();
    expect(token).not.toBe(hash);
  });

  it('generates unique tokens on repeated calls', async () => {
    const a = await generateViewToken();
    const b = await generateViewToken();
    expect(a.token).not.toBe(b.token);
  });
});

describe('hashToken', () => {
  it('produces consistent hash for same input', async () => {
    const h1 = await hashToken('test-token');
    const h2 = await hashToken('test-token');
    expect(h1).toBe(h2);
  });

  it('produces different hash for different input', async () => {
    const h1 = await hashToken('token-a');
    const h2 = await hashToken('token-b');
    expect(h1).not.toBe(h2);
  });
});

describe('verifyViewToken', () => {
  it('returns true for matching token+hash pair', async () => {
    const { token, hash } = await generateViewToken();
    expect(await verifyViewToken(token, hash)).toBe(true);
  });

  it('returns false for wrong token', async () => {
    const { hash } = await generateViewToken();
    expect(await verifyViewToken('wrong-token-value', hash)).toBe(false);
  });

  it('returns false for different hash length', async () => {
    const { token } = await generateViewToken();
    expect(await verifyViewToken(token, 'short')).toBe(false);
  });
});
