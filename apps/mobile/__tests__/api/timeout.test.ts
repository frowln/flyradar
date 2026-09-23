import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('../../src/core/gamification/collections', () => ({
  collectionsStore: { getDeviceToken: () => 'dev_test', setDeviceToken: () => {} }
}));
vi.mock('../../src/core/crypto/sign', () => ({ signRequest: () => null }));

const { apiClient, ApiTimeoutError } = await import('../../src/core/api/client');

/**
 * `fetch` has no timeout of its own, and the app is used where there is no
 * signal. A request that never resolves is not a slow screen — it is a spinner
 * that stays until the passenger closes the app.
 */
describe('request timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A server that accepts the connection and then says nothing at all. */
  function silentServer() {
    return vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const e = new Error('Aborted');
            e.name = 'AbortError';
            reject(e);
          });
        })
    );
  }

  it('gives up on a silent server rather than hanging', async () => {
    vi.stubGlobal('fetch', silentServer());
    const pending = apiClient.get('/social/leaderboard');
    const assertion = expect(pending).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.advanceTimersByTimeAsync(12_000);
    await assertion;
  });

  it('applies the same limit to writes', async () => {
    vi.stubGlobal('fetch', silentServer());
    const pending = apiClient.post('/social/discoveries', { poiId: 'x' });
    const assertion = expect(pending).rejects.toBeInstanceOf(ApiTimeoutError);
    await vi.advanceTimersByTimeAsync(12_000);
    await assertion;
  });

  it('leaves a prompt response untouched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) }))
    );
    await expect(apiClient.get('/social/leaderboard')).resolves.toEqual({ entries: [] });
  });

  /** A refusal is not a timeout; callers distinguish "offline" from "no". */
  it('reports a server error as an error, not a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({ error: 'Too many' }) })
      )
    );
    await expect(apiClient.get('/social/leaderboard')).rejects.toThrow('Too many');
    await expect(apiClient.get('/social/leaderboard')).rejects.not.toBeInstanceOf(ApiTimeoutError);
  });

  /**
   * The timer must be cleared on the success path too. Left running under a
   * real event loop it keeps the process awake and, worse, fires an abort into
   * a request that has already finished.
   */
  it('clears its timer once the request settles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
    );
    await apiClient.get('/social/me');
    expect(vi.getTimerCount()).toBe(0);
  });
});
