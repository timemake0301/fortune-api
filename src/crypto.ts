function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateViewToken(): Promise<{ token: string; hash: string }> {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  const token = bufferToHex(buffer);
  const hash = await hashToken(token);
  return { token, hash };
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(new Uint8Array(hashBuffer));
}

export async function verifyViewToken(token: string, storedHash: string): Promise<boolean> {
  const hash = await hashToken(token);
  if (hash.length !== storedHash.length) return false;
  // Constant-time comparison
  let result = 0;
  for (let i = 0; i < hash.length; i++) {
    result |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return result === 0;
}
