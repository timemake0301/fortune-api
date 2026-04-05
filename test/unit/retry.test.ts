import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../../src/services/retry';

describe('withRetry', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds on second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after maxAttempts exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    // catch をつけてunhandled rejectionを防ぐ（最後にassertで検証）
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(100); // attempt 2
    await vi.advanceTimersByTimeAsync(200); // attempt 3
    await expect(promise).rejects.toThrow('always fail');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects shouldRetry returning false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('no-retry'));
    const shouldRetry = vi.fn().mockReturnValue(false);
    await expect(
      withRetry(fn, { maxAttempts: 5, baseDelayMs: 100, shouldRetry })
    ).rejects.toThrow('no-retry');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  it('applies exponential backoff delays', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 1000 });

    // After 1st failure: delay = 1000ms (1000 * 2^0)
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    // After 2nd failure: delay = 2000ms (1000 * 2^1)
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
