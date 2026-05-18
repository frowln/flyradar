const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export const apiClient = {
  async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: 'Unknown error' })) as any;
      throw new ApiError(r.status, err.error ?? `HTTP ${r.status}`);
    }
    return r.json() as Promise<T>;
  },

  async get<T>(path: string): Promise<T> {
    const r = await fetch(`${BASE_URL}${path}`);
    if (!r.ok) {
      throw new ApiError(r.status, `HTTP ${r.status}`);
    }
    return r.json() as Promise<T>;
  }
};
