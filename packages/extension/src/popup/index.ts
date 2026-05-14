// Popup UI logic. Reads status from the background service worker and
// surfaces it to the user. Also handles auth token entry, pause toggle,
// and manual flush.

import { pingBackend } from '../shared/api';
import {
  clearAuthToken,
  getApiBaseUrl,
  getAuthToken,
  isPaused,
  setApiBaseUrl,
  setAuthToken,
  setPaused,
} from '../shared/storage';
import type { OperationalStatus, RoundState } from '../shared/types';

interface StatusReply {
  ok: boolean;
  paused: boolean;
  round: RoundState | null;
  lastBatchAt: number | null;
  queueLength: number;
  activeDomain: string | null;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Popup: element #${id} not found`);
  return el;
}

function setText(id: string, text: string): void {
  $(id).textContent = text;
}

function setBackendStatus(connected: boolean): void {
  const dot = $('backend-dot');
  dot.classList.remove('ok', 'err');
  dot.classList.add(connected ? 'ok' : 'err');
  const wrapper = $('backend-status');
  // Replace text node while keeping the dot child.
  const dotEl = dot;
  wrapper.textContent = '';
  wrapper.appendChild(dotEl);
  wrapper.appendChild(document.createTextNode(connected ? 'Connected' : 'Disconnected'));
}

function formatRound(round: RoundState | null): string {
  if (!round || !round.status) return 'Unknown';
  return round.status as OperationalStatus;
}

function formatLastBatch(at: number | null): string {
  if (!at) return 'Never';
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

async function loadSettings(): Promise<void> {
  const [token, base] = await Promise.all([getAuthToken(), getApiBaseUrl()]);
  (document.getElementById('auth-token') as HTMLInputElement).value = token ?? '';
  (document.getElementById('api-base') as HTMLInputElement).value = base;
  setText('auth-status', token ? 'Signed in' : 'Not signed in');
}

async function loadStatus(): Promise<void> {
  // Backend reachability check (independent of message-bridge).
  const connected = await pingBackend();
  setBackendStatus(connected);

  try {
    const reply = (await chrome.runtime.sendMessage({ type: 'get-status' })) as StatusReply | undefined;
    if (!reply || !reply.ok) {
      setText('round-status', 'Unknown');
      setText('active-domain', '—');
      setText('queue-length', '0');
      setText('last-batch', 'Never');
      return;
    }
    setText('round-status', formatRound(reply.round));
    setText('active-domain', reply.activeDomain ?? '—');
    setText('queue-length', String(reply.queueLength));
    setText('last-batch', formatLastBatch(reply.lastBatchAt));
    const pauseBtn = $('toggle-pause') as HTMLButtonElement;
    pauseBtn.textContent = reply.paused ? 'Resume' : 'Pause';
  } catch {
    setText('round-status', 'Unknown');
  }
}

async function handleSaveSettings(): Promise<void> {
  const tokenInput = document.getElementById('auth-token') as HTMLInputElement;
  const baseInput = document.getElementById('api-base') as HTMLInputElement;
  const token = tokenInput.value.trim();
  const base = baseInput.value.trim();
  if (base) await setApiBaseUrl(base);
  if (token) {
    await setAuthToken(token);
    setText('auth-status', 'Signed in');
  }
  await loadStatus();
}

async function handleClearToken(): Promise<void> {
  await clearAuthToken();
  (document.getElementById('auth-token') as HTMLInputElement).value = '';
  setText('auth-status', 'Not signed in');
}

async function handleTogglePause(): Promise<void> {
  const paused = await isPaused();
  await setPaused(!paused);
  await loadStatus();
}

async function handleForceFlush(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'force-flush' });
  } catch {
    // background may be cold-starting; not fatal.
  }
  await loadStatus();
}

function wireEvents(): void {
  $('save-settings').addEventListener('click', () => {
    void handleSaveSettings();
  });
  $('clear-token').addEventListener('click', () => {
    void handleClearToken();
  });
  $('toggle-pause').addEventListener('click', () => {
    void handleTogglePause();
  });
  $('force-flush').addEventListener('click', () => {
    void handleForceFlush();
  });
}

async function main(): Promise<void> {
  wireEvents();
  await loadSettings();
  await loadStatus();
  // Refresh status every 3 seconds while the popup is open.
  window.setInterval(() => {
    void loadStatus();
  }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  void main();
});
