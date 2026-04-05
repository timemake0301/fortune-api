import { Env, UUID_REGEX } from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function respond(status: number, body: unknown, env?: Env): Response {
  const origin = env?.ALLOWED_ORIGIN || '*';
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
  });
}

export function handleError(error: unknown, env?: Env): Response {
  if (error instanceof ApiError) {
    return respond(error.status, {
      success: false,
      error: { code: error.code, message: error.message },
    }, env);
  }
  console.error('Unexpected error:', error);
  return respond(500, {
    success: false,
    error: { code: 'ERR_INTERNAL', message: 'Internal server error' },
  }, env);
}

export function assertUuid(value: string, name: string): string {
  if (!UUID_REGEX.test(value)) {
    throw new ApiError(400, 'ERR_INVALID_ID', `Invalid ${name}: must be a UUID`);
  }
  return value;
}

export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}
