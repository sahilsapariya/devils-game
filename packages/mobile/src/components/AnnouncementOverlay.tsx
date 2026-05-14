/**
 * Fullscreen announcement overlay. Displayed when the system has
 * something to say. Critical-toned announcements block dismissal
 * until the countdown elapses.
 *
 * When the announcement has a voiceUrl, audio playback begins on mount
 * and the progress bar tracks the actual audio duration. Audio failure
 * falls back to the fixed-timer behavior.
 */
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { OperationalButton } from './OperationalButton';
import {
  acknowledge,
  playAnnouncementAudio,
  stopAnnouncementAudio,
  subscribeAnnouncements,
} from '../services/announcement.service';
import type { LocalAnnouncement } from '../db/repositories/announcements.repo';
import { colors, spacing, typography } from '../theme';

const DEFAULT_TIMEOUT_SECONDS = 20;
const CRITICAL_TIMEOUT_SECONDS = 30;

function isCriticalTone(tone: string): boolean {
  return tone === 'urgent' || tone === 'authoritative';
}

export function AnnouncementOverlay(): React.ReactElement | null {
  const [current, setCurrent] = useState<LocalAnnouncement | null>(null);
  const [totalSeconds, setTotalSeconds] = useState<number>(DEFAULT_TIMEOUT_SECONDS);
  const [remaining, setRemaining] = useState<number>(DEFAULT_TIMEOUT_SECONDS);

  useEffect(() => {
    const unsubscribe = subscribeAnnouncements((next) => {
      setCurrent(next);
      const baseSeconds = isCriticalTone(next.tone)
        ? CRITICAL_TIMEOUT_SECONDS
        : DEFAULT_TIMEOUT_SECONDS;
      setTotalSeconds(baseSeconds);
      setRemaining(baseSeconds);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Audio playback (best-effort). If a duration is reported, size the
  // timer to it (clamped to a sane minimum of 4s).
  useEffect(() => {
    if (!current) return undefined;
    let cancelled = false;
    void (async () => {
      const result = await playAnnouncementAudio(current);
      if (cancelled) return;
      if (result.played && result.durationMs && result.durationMs > 0) {
        const audioSeconds = Math.max(4, Math.ceil(result.durationMs / 1000));
        setTotalSeconds(audioSeconds);
        setRemaining(audioSeconds);
      }
    })();
    return () => {
      cancelled = true;
      void stopAnnouncementAudio();
    };
  }, [current]);

  useEffect(() => {
    if (!current) return undefined;
    const handle = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(handle);
  }, [current]);

  useEffect(() => {
    if (!current) return;
    if (remaining > 0) return;
    void dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, current]);

  const dismiss = async (): Promise<void> => {
    if (!current) return;
    const id = current.id;
    setCurrent(null);
    try {
      await acknowledge(id);
    } catch {
      // Acknowledgement failure is non-fatal.
    }
  };

  const critical = current ? isCriticalTone(current.tone) : false;
  const canDismiss = !!current && (!critical || remaining === 0);
  const progress = totalSeconds > 0 ? remaining / totalSeconds : 0;

  return (
    <Modal
      visible={!!current}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={() => {
        if (canDismiss) void dismiss();
      }}
    >
      <View
        style={[
          styles.scrim,
          critical && styles.scrimCritical,
        ]}
      >
        <View style={styles.frame}>
          <Text
            style={[
              styles.eyebrow,
              critical && styles.eyebrowCritical,
            ]}
          >
            {current?.category.replace(/_/g, ' ').toUpperCase() ??
              'OPERATIONAL UPDATE'}
          </Text>

          <Text
            style={[
              styles.message,
              critical && styles.messageCritical,
            ]}
          >
            {current?.message ?? ''}
          </Text>

          <View style={styles.timer}>
            <View style={styles.timerTrack}>
              <View
                style={[
                  styles.timerFill,
                  critical && styles.timerFillCritical,
                  { width: `${Math.max(0, Math.min(1, progress)) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.timerLabel}>
              {critical
                ? `LOCKED · ${remaining}s`
                : `AUTO-DISMISS · ${remaining}s`}
            </Text>
          </View>

          <View style={styles.actions}>
            {canDismiss ? (
              <OperationalButton
                label="Acknowledge"
                onPress={() => {
                  void dismiss();
                }}
                variant={critical ? 'danger' : 'primary'}
              />
            ) : (
              <Pressable disabled style={styles.lockedButton}>
                <Text style={styles.lockedText}>
                  STAND BY · DISMISSAL LOCKED
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.overlay.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
  },
  scrimCritical: {
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  frame: {
    width: '100%',
    maxWidth: 480,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.l,
  },
  eyebrow: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.widest,
  },
  eyebrowCritical: {
    color: colors.accent.operational,
  },
  message: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.title,
    letterSpacing: typography.letterSpacing.wide,
    lineHeight: typography.sizes.title * typography.lineHeights.tight,
  },
  messageCritical: {
    color: colors.text.primary,
  },
  timer: {
    gap: spacing.xs,
  },
  timerTrack: {
    height: 2,
    backgroundColor: colors.borderDim,
  },
  timerFill: {
    height: '100%',
    backgroundColor: colors.text.primary,
  },
  timerFillCritical: {
    backgroundColor: colors.accent.operational,
  },
  timerLabel: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.micro,
    letterSpacing: typography.letterSpacing.widest,
  },
  actions: {
    marginTop: spacing.s,
  },
  lockedButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedText: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.label,
    letterSpacing: typography.letterSpacing.widest,
  },
});
