/**
 * Centralized API client for DocBridge backend.
 * Uses Cognito JWT token for authentication when available,
 * falls back to x-user-id for backward compatibility.
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

// Token storage (set by App after Cognito login)
let _authToken: string | null = null;
let _userId: string | null = null;

export function setAuthCredentials(token: string | null, userId: string | null) {
  _authToken = token;
  _userId = userId;
}

// Lightweight persona accessor (fallback when no Cognito token)
const STORAGE_KEY = 'docbridge.personaId';

export function getActivePersonaId(): string {
  return _userId || localStorage.getItem(STORAGE_KEY) || 'user-1';
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

  const headers: Record<string, string> = {
    ...options?.headers,
  };

  // Auth: prefer JWT token, fallback to x-user-id
  if (_authToken) {
    headers['Authorization'] = `Bearer ${_authToken}`;
  }
  // Always send x-user-id for backward compat with current backend
  headers['x-user-id'] = getActivePersonaId();

  // Only set Content-Type for JSON bodies
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, res.statusText, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
