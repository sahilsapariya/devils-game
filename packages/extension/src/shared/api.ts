// Backend API client. Service worker context — uses fetch + manual auth.

import { getApiBaseUrl, getAuthToken } from './storage';

export interface ApiError extends Error {
  status?: number;
  body?: unknown;
}

function makeError(message: string, status?: number, body?: unknown): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  err.body = body;
  return err;
}

async function buildHeaders(): Promise<Headers> {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  const token = await getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

function joinUrl(base: string, endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const trimmedBase = base.replace(/\/+$/, '');
  const trimmedEndpoint = endpoint.replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedEndpoint}`;
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    return await response.text();
  } catch {
    return null;
  }
}

export async function apiPost<T = unknown>(
  endpoint: string,
  body: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const base = await getApiBaseUrl();
  const url = joinUrl(base, endpoint);
  const headers = await buildHeaders();
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
    signal: options.signal,
  });
  const parsed = await parseResponse(response);
  if (!response.ok) {
    throw makeError(`POST ${endpoint} failed: ${response.status}`, response.status, parsed);
  }
  return parsed as T;
}

export async function apiGet<T = unknown>(
  endpoint: string,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const base = await getApiBaseUrl();
  const url = joinUrl(base, endpoint);
  const headers = await buildHeaders();
  const response = await fetch(url, {
    method: 'GET',
    headers,
    signal: options.signal,
  });
  const parsed = await parseResponse(response);
  if (!response.ok) {
    throw makeError(`GET ${endpoint} failed: ${response.status}`, response.status, parsed);
  }
  return parsed as T;
}

/**
 * Lightweight health check. Returns true if backend is reachable.
 */
export async function pingBackend(): Promise<boolean> {
  try {
    await apiGet('/health');
    return true;
  } catch {
    return false;
  }
}
