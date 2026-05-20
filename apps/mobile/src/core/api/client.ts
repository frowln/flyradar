import { collectionsStore } from '../gamification/collections';

const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function getDeviceToken(): string {
  let token = collectionsStore.getDeviceToken();
  if (!token) {
    token = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 18)}`;
    collectionsStore.setDeviceToken(token);
  }
  return token;
}

export const apiClient = {
  async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getDeviceToken()}`
      },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: 'Unknown error' })) as any;
      throw new ApiError(r.status, err.error ?? `HTTP ${r.status}`);
    }
    return r.json() as Promise<T>;
  },

  async get<T>(path: string): Promise<T> {
    const r = await fetch(`${BASE_URL}${path}`, {
      headers: {
        'Authorization': `Bearer ${getDeviceToken()}`
      }
    });
    if (!r.ok) {
      throw new ApiError(r.status, `HTTP ${r.status}`);
    }
    return r.json() as Promise<T>;
  }
};
