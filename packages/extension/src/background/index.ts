// Background service worker. Owns tab tracking, telemetry queueing,
// batch uploads, and signaling content scripts to inject overlays.

import { classifyDomain, extractHostname } from '../shared/classification';
import { apiGet, apiPost } from '../shared/api';
import type {
  ExtensionMessage,
  RoundState,
  TelemetryBatch,
  TelemetryEvent,
  TelemetryEventType,
} from '../shared/types';
import {
  addToQueue,
  getLastBatchAt,
  getOrCreateDeviceId,
  getQueue,
  getRetryAttempts,
  getRoundState,
  isPaused,
  replaceQueue,
  setLastBatch,
  setRetryAttempts,
  setRoundState,
} from '../shared/storage';

// --- Alarm names --------------------------------------------------------

const ALARM_DWELL = 'extraction.dwell';
const ALARM_BATCH = 'extraction.batch';
const ALARM_ROUND_REFRESH = 'extraction.round_refresh';

const DWELL_PERIOD_MIN = 1; // 60 seconds
const BATCH_PERIOD_MIN = 5; // 5 minutes
const ROUND_REFRESH_PERIOD_MIN = 2;

// --- In-memory dwell tracker -------------------------------------------
// Service workers can be torn down, so we treat this as a soft cache only.
// Persistent state lives in chrome.storage.local.

interface ActiveDomainState {
  domain: string;
  classification: ReturnType<typeof classifyDomain>['type'];
  tabId: number;
  startedAt: number;
}

let activeDomain: ActiveDomainState | null = null;

// --- Helpers ------------------------------------------------------------

function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function enqueueEvent(
  type: TelemetryEventType,
  domain: string,
  classification: ActiveDomainState['classification'],
  extra: { tabId?: number; dwellMs?: number } = {},
): Promise<void> {
  const round = await getRoundState();
  const event: TelemetryEvent = {
    id: newEventId(),
    type,
    timestamp: Date.now(),
    domain,
    classification,
    roundId: round?.roundId ?? null,
    ...extra,
  };
  await addToQueue(event);
}

async function handleActiveTab(tab: chrome.tabs.Tab): Promise<void> {
  if (await isPaused()) return;
  const url = tab.url ?? tab.pendingUrl ?? undefined;
  const hostname = extractHostname(url);
  if (!hostname) {
    // Flush any in-progress dwell when navigating to a non-trackable URL.
    await flushActiveDwell();
    activeDomain = null;
    return;
  }
  const classification = classifyDomain(hostname);
  const now = Date.now();

  // If we are switching domains, flush dwell for the previous one.
  if (activeDomain && activeDomain.domain !== hostname) {
    await flushActiveDwell();
  }

  activeDomain = {
    domain: hostname,
    classification: classification.type,
    tabId: tab.id ?? -1,
    startedAt: now,
  };

  await enqueueEvent('tab_activated', hostname, classification.type, { tabId: tab.id });

  if (classification.isDistraction) {
    await enqueueEvent('distraction_detected', hostname, classification.type, { tabId: tab.id });
    await maybeWarn(tab, hostname);
  }
}

async function flushActiveDwell(): Promise<void> {
  if (!activeDomain) return;
  const dwellMs = Date.now() - activeDomain.startedAt;
  if (dwellMs < 1000) return; // ignore sub-second flickers
  await enqueueEvent('domain_dwell', activeDomain.domain, activeDomain.classification, {
    tabId: activeDomain.tabId,
    dwellMs,
  });
  // Reset the dwell window — next tick starts a new measurement.
  activeDomain = { ...activeDomain, startedAt: Date.now() };
}

async function maybeWarn(tab: chrome.tabs.Tab, hostname: string): Promise<void> {
  if (tab.id == null) return;
  const round = await getRoundState();
  const operational = round?.status === 'OPERATIONAL' || round?.status === 'CRITICAL';
  if (!operational) return;
  const message: ExtensionMessage = {
    type: 'distraction-warning',
    domain: hostname,
    operational: true,
  };
  try {
    await chrome.tabs.sendMessage(tab.id, message);
    await enqueueEvent('overlay_shown', hostname, 'distraction', { tabId: tab.id });
  } catch {
    // Content script may not be loaded (e.g. chrome:// pages). Safe to ignore.
  }
}

// --- Listeners ----------------------------------------------------------

chrome.tabs.onActivated.addListener(async (info) => {
  try {
    const tab = await chrome.tabs.get(info.tabId);
    await handleActiveTab(tab);
  } catch {
    // Tab may have closed before we could read it.
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // We only care about URL changes on the focused tab.
  if (!changeInfo.url) return;
  if (!tab.active) return;
  await handleActiveTab(tab);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // No window focused — flush dwell.
    await flushActiveDwell();
    activeDomain = null;
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab) await handleActiveTab(tab);
  } catch {
    // ignore
  }
});

// --- Alarms -------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  await setupAlarms();
  await getOrCreateDeviceId();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupAlarms();
});

async function setupAlarms(): Promise<void> {
  await chrome.alarms.create(ALARM_DWELL, { periodInMinutes: DWELL_PERIOD_MIN });
  await chrome.alarms.create(ALARM_BATCH, { periodInMinutes: BATCH_PERIOD_MIN });
  await chrome.alarms.create(ALARM_ROUND_REFRESH, {
    periodInMinutes: ROUND_REFRESH_PERIOD_MIN,
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_DWELL) {
    await flushActiveDwell();
  } else if (alarm.name === ALARM_BATCH) {
    await uploadBatch();
  } else if (alarm.name === ALARM_ROUND_REFRESH) {
    await refreshRoundState();
  }
});

// --- Batch upload -------------------------------------------------------

async function uploadBatch(): Promise<void> {
  if (await isPaused()) return;
  const queue = await getQueue();
  if (queue.length === 0) return;

  const deviceId = await getOrCreateDeviceId();
  const batch: TelemetryBatch = {
    batchId: newEventId(),
    deviceId,
    browser: detectBrowser(),
    events: queue,
  };

  try {
    await apiPost('/telemetry/batch', batch);
    await replaceQueue([]);
    await setRetryAttempts(0);
    await setLastBatch(Date.now(), 'ok');
  } catch (err) {
    const attempts = (await getRetryAttempts()) + 1;
    await setRetryAttempts(attempts);
    await setLastBatch(Date.now(), `error: ${(err as Error).message}`);
    await scheduleRetry(attempts);
  }
}

async function scheduleRetry(attempts: number): Promise<void> {
  // Exponential backoff capped at 30 minutes.
  const minutes = Math.min(30, Math.pow(2, Math.min(attempts, 5)));
  await chrome.alarms.create(ALARM_BATCH, { delayInMinutes: minutes });
}

function detectBrowser(): string {
  // Service workers don't expose navigator.userAgent reliably; we just label
  // the runtime by extension API surface.
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) return 'chrome';
  return 'unknown';
}

// --- Round state refresh ------------------------------------------------

async function refreshRoundState(): Promise<void> {
  try {
    const data = (await apiGet('/rounds/current')) as Partial<RoundState> | null;
    if (data && typeof data.status === 'string') {
      await setRoundState({
        status: data.status,
        roundId: data.roundId ?? null,
        startedAt: data.startedAt ?? null,
        cachedAt: Date.now(),
      });
    }
  } catch {
    // Backend may be down — keep last cached state.
  }
}

// --- Message bridge -----------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return false;
  }
  const type = (message as { type: string }).type;

  if (type === 'force-flush') {
    void (async () => {
      await flushActiveDwell();
      await uploadBatch();
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (type === 'get-status') {
    void (async () => {
      const [paused, round, lastAt] = await Promise.all([
        isPaused(),
        getRoundState(),
        getLastBatchAt(),
      ]);
      const queue = await getQueue();
      sendResponse({
        ok: true,
        paused,
        round,
        lastBatchAt: lastAt,
        queueLength: queue.length,
        activeDomain: activeDomain?.domain ?? null,
      });
    })();
    return true;
  }

  return false;
});
