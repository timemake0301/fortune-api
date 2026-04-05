// LINE Webhook署名検証（HMAC-SHA256）

import { webcrypto } from 'node:crypto';

export async function verifyLineSignature(
  channelSecret: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await webcrypto.subtle.importKey(
    'raw',
    encoder.encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const mac = await webcrypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expected = Buffer.from(new Uint8Array(mac)).toString('base64');

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}
