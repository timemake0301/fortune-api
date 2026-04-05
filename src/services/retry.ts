export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === options.maxAttempts) break;
      if (options.shouldRetry && !options.shouldRetry(error, attempt)) break;
      // Exponential backoff: 1s → 2s → 4s
      await new Promise(r => setTimeout(r, options.baseDelayMs * Math.pow(2, attempt - 1)));
    }
  }

  throw lastError;
}
