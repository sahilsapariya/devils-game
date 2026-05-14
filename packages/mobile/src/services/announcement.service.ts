/**
 * Announcement service — queue, dispatch, acknowledge, play audio.
 *
 * Announcements are persisted locally; this service is the only path
 * by which the UI receives a "play next" instruction. Backend pushes
 * announcements into the local queue via Socket.io; this service then
 * surfaces them to the active overlay subscriber AND triggers TTS
 * playback via expo-av when a voiceUrl is available.
 *
 * Audio failures are silent — the announcement still displays visually.
 */
import { Audio, AVPlaybackStatus } from 'expo-av';

import {
  EnqueueAnnouncementInput,
  LocalAnnouncement,
  enqueueAnnouncement as repoEnqueue,
  getNextQueued,
  markAcknowledged,
  markFailed,
  markPlayed,
} from '../db/repositories/announcements.repo';
import { appendLog } from '../db/repositories/logs.repo';
import { apiRequest } from './apiClient';
import { getAccessToken } from './auth.service';
import { queueEvent } from './telemetry-uploader.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('announcement');

type Subscriber = (announcement: LocalAnnouncement) => void;

const subscribers = new Set<Subscriber>();
let pollHandle: ReturnType<typeof setInterval> | null = null;
let dispatching = false;

const POLL_INTERVAL_MS = 2000;
const VOICE_CACHE_MAX = 10;
const voiceCache = new Map<string, string>(); // announcementId -> voiceUrl (preserves recency)

// Currently-playing sound object (if any).
let activeSound: Audio.Sound | null = null;

function notify(announcement: LocalAnnouncement): void {
  for (const sub of subscribers) {
    try {
      sub(announcement);
    } catch {
      // Subscribers are not allowed to break the dispatch loop.
    }
  }
}

function rememberVoiceUrl(id: string, url: string): void {
  if (voiceCache.has(id)) voiceCache.delete(id);
  voiceCache.set(id, url);
  while (voiceCache.size > VOICE_CACHE_MAX) {
    const first = voiceCache.keys().next();
    if (first.done || first.value === undefined) break;
    voiceCache.delete(first.value);
  }
}

interface PlaybackResult {
  played: boolean;
  durationMs: number | null;
}

async function unloadActiveSound(): Promise<void> {
  if (!activeSound) return;
  const ref = activeSound;
  activeSound = null;
  try {
    await ref.unloadAsync();
  } catch {
    /* swallow */
  }
}

/**
 * Load + play the announcement audio. Returns {played, durationMs} so the
 * overlay can size its progress bar to the actual audio duration.
 */
export async function playAnnouncementAudio(
  announcement: LocalAnnouncement,
): Promise<PlaybackResult> {
  if (!announcement.voiceUrl) {
    return { played: false, durationMs: null };
  }
  rememberVoiceUrl(announcement.id, announcement.voiceUrl);

  await unloadActiveSound();

  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
    });

    const { sound, status } = await Audio.Sound.createAsync(
      { uri: announcement.voiceUrl },
      { shouldPlay: true, volume: 1.0 },
    );
    activeSound = sound;

    let durationMs: number | null = null;
    if (status.isLoaded) {
      durationMs = status.durationMillis ?? null;
    }

    sound.setOnPlaybackStatusUpdate((s: AVPlaybackStatus) => {
      if (!s.isLoaded) return;
      if (s.didJustFinish) {
        void (async () => {
          try {
            await sound.unloadAsync();
          } catch {
            /* swallow */
          }
          if (activeSound === sound) activeSound = null;
        })();
      }
    });

    return { played: true, durationMs };
  } catch (err) {
    logger.warn('audio_play_failed', {
      id: announcement.id,
      message: err instanceof Error ? err.message : 'unknown',
    });
    return { played: false, durationMs: null };
  }
}

export async function stopAnnouncementAudio(): Promise<void> {
  await unloadActiveSound();
}

async function tick(): Promise<void> {
  if (dispatching || subscribers.size === 0) return;
  try {
    dispatching = true;
    const next = await getNextQueued();
    if (next) {
      await markPlayed(next.id);
      notify(next);
      void queueEvent({
        eventType: 'manual_checkin',
        roundId: next.roundId,
        eventData: { kind: 'announcement.played', id: next.id, tone: next.tone },
      });
      void notifyBackendPlayed(next.id);
      await appendLog({
        category: 'announcement',
        level: next.tone === 'urgent' ? 'warning' : 'info',
        description: `Announcement dispatched: ${next.category}`,
        roundId: next.roundId,
        context: { id: next.id, tone: next.tone },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    logger.warn('dispatch_failed', { message });
    await appendLog({
      category: 'announcement',
      level: 'warning',
      description: `Announcement dispatch failed: ${message}`,
    }).catch(() => undefined);
  } finally {
    dispatching = false;
  }
}

async function notifyBackendPlayed(id: string): Promise<void> {
  try {
    const token = await getAccessToken();
    if (!token) return;
    await apiRequest<void>(
      `/announcements/${encodeURIComponent(id)}/played`,
      { method: 'POST', token, timeoutMs: 5000 },
    );
  } catch {
    /* backend sync is best-effort */
  }
}

async function notifyBackendAcknowledged(id: string): Promise<void> {
  try {
    const token = await getAccessToken();
    if (!token) return;
    await apiRequest<void>(
      `/announcements/${encodeURIComponent(id)}/acknowledge`,
      { method: 'PATCH', token, timeoutMs: 5000 },
    );
  } catch {
    /* best-effort */
  }
}

export function startAnnouncementDispatcher(): void {
  if (pollHandle) return;
  pollHandle = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
}

export function stopAnnouncementDispatcher(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

export function subscribeAnnouncements(sub: Subscriber): () => void {
  subscribers.add(sub);
  return () => {
    subscribers.delete(sub);
  };
}

export async function queueAnnouncement(
  input: EnqueueAnnouncementInput,
): Promise<LocalAnnouncement> {
  return repoEnqueue(input);
}

export async function acknowledge(id: string): Promise<void> {
  await markAcknowledged(id);
  await stopAnnouncementAudio();
  void queueEvent({
    eventType: 'manual_checkin',
    eventData: { kind: 'announcement.acknowledged', id },
  });
  void notifyBackendAcknowledged(id);
}

export async function failAnnouncement(id: string): Promise<void> {
  await markFailed(id);
  await stopAnnouncementAudio();
}
