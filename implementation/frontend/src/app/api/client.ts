/**
 * Centralized API client for DocBridge backend.
 * Injects x-user-id header from active persona, handles errors, logs in dev.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

// Lightweight persona accessor (avoids circular deps with React context)
const STORAGE_KEY = 'docbridge.personaId';

export function getActivePersonaId(): string {
  return localStorage.getItem(STORAGE_KEY) || import.meta.env.VITE_DEFAULT_PERSONA || 'user-1';
}

async function request<T>(
  method: string,
  path: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const personaId = getActivePersonaId();

  const headers: Record<string, string> = {
    'x-user-id': personaId,
    ...options?.headers,
  };

  // Only set Content-Type for JSON bodies
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (import.meta.env.DEV) {
    console.log(`[API] ${method} ${url}`, options?.body ?? '');
  }

  const res = await fetch(url, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (import.meta.env.DEV) {
      console.error(`[API] ${method} ${url} → ${res.status}`, body);
    }
    throw new ApiError(res.status, res.statusText, body);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  const data = await res.json();
  if (import.meta.env.DEV) {
    console.log(`[API] ${method} ${url} → ${res.status}`, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
