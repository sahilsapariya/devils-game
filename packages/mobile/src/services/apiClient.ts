/**
 * Lightweight fetch wrapper. Attaches bearer token, parses JSON,
 * surfaces structured errors. Intentionally minimal to avoid pulling
 * axios into the mobile bundle.
 */
import { env } from '../config/env';

export interface ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  token?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function buildError(message: string, status: number, details?: unknown): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  err.details = details;
  return err;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = path.startsWith('http')
    ? path
    : `${env.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined && options.body !== null) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const controller = new AbortController();
  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort());
  }
  const timeoutHandle =
    options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : null;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined || options.body === null
          ? undefined
          : typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    const message =
      err instanceof Error ? err.message : 'Network request failed';
    throw buildError(message, 0);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    let message: string = `Request failed with status ${response.status}`;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.message === 'string' && obj.message.length > 0) {
        message = obj.message;
      }
    }
    throw buildError(message, response.status, parsed);
  }

  return parsed as T;
}
