// Thin wrappers around chrome.storage.local. All state lives here — we never
// use localStorage (service workers and per-tab contexts don't share it).

import type { RoundState, TelemetryEvent } from './types';

const KEYS = {
  authToken: 'auth_token',
  apiBaseUrl: 'api_base_url',
  deviceId: 'device_id',
  roundState: 'round_state',
  queue: 'telemetry_queue',
  paused: 'monitoring_paused',
  lastBatchAt: 'last_batch_at',
  lastBatchStatus: 'last_batch_status',
  retryAttempts: 'retry_attempts',
} as const;

export const DEFAULT_API_BASE_URL = 'http://localhost:3001/api';

// Hard cap so a long offline period doesn't blow up storage.
const MAX_QUEUE_LENGTH = 500;

async function getValue<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

async function setValue<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

async function removeKey(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}

// --- Auth ---------------------------------------------------------------

export async function getAuthToken(): Promise<string | null> {
  return (await getValue<string>(KEYS.authToken)) ?? null;
}

export async function setAuthToken(token: string): Promise<void> {
  await setValue(KEYS.authToken, token);
}

export async function clearAuthToken(): Promise<void> {
  await removeKey(KEYS.authToken);
}

// --- API base -----------------------------------------------------------

export async function getApiBaseUrl(): Promise<string> {
  return (await getValue<string>(KEYS.apiBaseUrl)) ?? DEFAULT_API_BASE_URL;
}

export async function setApiBaseUrl(url: string): Promise<void> {
  await setValue(KEYS.apiBaseUrl, url);
}

// --- Device id ----------------------------------------------------------

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getValue<string>(KEYS.deviceId);
  if (existing) return existing;
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await setValue(KEYS.deviceId, id);
  return id;
}

// --- Round state --------------------------------------------------------

export async function getRoundState(): Promise<RoundState | null> {
  return (await getValue<RoundState>(KEYS.roundState)) ?? null;
}

export async function setRoundState(state: RoundState): Promise<void> {
  await setValue(KEYS.roundState, state);
}

// --- Pause toggle -------------------------------------------------------

export async function isPaused(): Promise<boolean> {
  return Boolean(await getValue<boolean>(KEYS.paused));
}

export async function setPaused(paused: boolean): Promise<void> {
  await setValue(KEYS.paused, paused);
}

// --- Telemetry queue ----------------------------------------------------

export async function getQueue(): Promise<TelemetryEvent[]> {
  return (await getValue<TelemetryEvent[]>(KEYS.queue)) ?? [];
}

export async function addToQueue(event: TelemetryEvent): Promise<void> {
  const queue = await getQueue();
  queue.push(event);
  // Drop oldest if we exceed the cap — better to lose old events than block.
  const trimmed =
    queue.length > MAX_QUEUE_LENGTH ? queue.slice(queue.length - MAX_QUEUE_LENGTH) : queue;
  await setValue(KEYS.queue, trimmed);
}

export async function clearQueue(): Promise<void> {
  await setValue(KEYS.queue, []);
}

export async function replaceQueue(events: TelemetryEvent[]): Promise<void> {
  await setValue(KEYS.queue, events);
}

// --- Batch metadata -----------------------------------------------------

export async function getLastBatchAt(): Promise<number | null> {
  return (await getValue<number>(KEYS.lastBatchAt)) ?? null;
}

export async function getLastBatchStatus(): Promise<string | null> {
  return (await getValue<string>(KEYS.lastBatchStatus)) ?? null;
}

export async function setLastBatch(at: number, status: string): Promise<void> {
  await setValue(KEYS.lastBatchAt, at);
  await setValue(KEYS.lastBatchStatus, status);
}

// --- Retry backoff ------------------------------------------------------

export async function getRetryAttempts(): Promise<number> {
  return (await getValue<number>(KEYS.retryAttempts)) ?? 0;
}

export async function setRetryAttempts(attempts: number): Promise<void> {
  await setValue(KEYS.retryAttempts, attempts);
}
