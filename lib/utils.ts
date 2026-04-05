import { UUID_REGEX } from './types';

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

export function assertUuid(value: string, name: string): string {
  if (!UUID_REGEX.test(value)) {
    throw new ApiError(400, 'ERR_INVALID_ID', `Invalid ${name}: must be a UUID`);
  }
  return value;
}
