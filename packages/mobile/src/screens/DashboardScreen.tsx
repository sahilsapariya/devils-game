/**
 * Operational dashboard — the system's command center.
 *
 * Reads the active round from local SQLite (offline-safe) and live-updates
 * via socket pushes. The countdown timer is anchored to the LOCAL
 * timer-start; the backend may go silent but the operator's clock keeps
 * ticking.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedValue } from '../components/AnimatedValue';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { MetricCard } from '../components/MetricCard';
import { OperationalButton } from '../components/OperationalButton';
import { StatusDot, type StatusKind } from '../components/StatusDot';
import { useActiveRound } from '../hooks/useActiveRound';
import { useBackendConnection } from '../hooks/useBackendConnection';
import { useCountdown } from '../hooks/useCountdown';
import { listRecentLogs, type LocalLog } from '../db/repositories/logs.repo';
import { useAuth } from '../store/auth.context';
import { useRealtimeEvent } from '../store/realtime.context';
import { queueEvent, flushNow } from '../services/telemetry-uploader.service';
import { colors, spacing, typography } from '../theme';

function formatLogStamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toTimeString().slice(0, 8);
  } catch {
    return iso;
  }
}

function connectionStatusToDot(
  status: 'connected' | 'degraded' | 'offline',
): { kind: StatusKind; label: string } {
  switch (status) {
    case 'connected':
      return { kind: 'online', label: 'Operational' };
    case 'degraded':
      return { kind: 'degraded', label: 'Degraded' };
    case 'offline':
    default:
      return { kind: 'severed', label: 'Offline' };
  }
}

export function DashboardScreen(): React.ReactElement {
  const { user } = useAuth();
  const { round } = useActiveRound();
  const connection = useBackendConnection();

  const [reputation, setReputation] = useState<number>(user?.reputationScore ?? 1000);
  const [streak, setStreak] = useState<number>(user?.currentStreak ?? 0);
  const [ceiling, setCeiling] = useState<number>(user?.difficultyCeiling ?? 5.0);
  const [logs, setLogs] = useState<ReadonlyArray<LocalLog>>([]);

  // Sync stats from user once available.
  useEffect(() => {
    if (!user) return;
    setReputation(user.reputationScore);
    setStreak(user.currentStreak);
    setCeiling(user.difficultyCeiling);
  }, [user]);

  // Live stats from socket.
  useRealtimeEvent('stats:update', (payload) => {
    if (typeof payload.reputationScore === 'number') {
      setReputation(payload.reputationScore);
    } else if (typeof payload.user?.reputationScore === 'number') {
      setReputation(payload.user.reputationScore);
    }
    if (typeof payload.currentStreak === 'number') {
      setStreak(payload.currentStreak);
    } else if (typeof payload.user?.currentStreak === 'number') {
      setStreak(payload.user.currentStreak);
    }
    if (typeof payload.difficultyCeiling === 'number') {
      setCeiling(payload.difficultyCeiling);
    } else if (typeof payload.user?.difficultyCeiling === 'number') {
      setCeiling(payload.user.difficultyCeiling);
    }
  });

  // Refresh log tail.
  const refreshLogs = useCallback(async () => {
    try {
      const next = await listRecentLogs(8);
      setLogs(next);
    } catch {
      /* swallow */
    }
  }, []);

  useEffect(() => {
    void refreshLogs();
    const handle = setInterval(() => {
      void refreshLogs();
    }, 5000);
    return () => clearInterval(handle);
  }, [refreshLogs]);

  // Compute countdown target. Local timer is authoritative: anchor to
  // localTimerStart + roundDuration (endsAt - startsAt). If unavailable,
  // fall back to endsAt.
  const countdownTarget = useMemo<string | null>(() => {
    if (!round) return null;
    if (round.localTimerStart) {
      const start = new Date(round.startsAt).getTime();
      const end = new Date(round.endsAt).getTime();
      const localStart = new Date(round.localTimerStart).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(localStart)) {
        const durationMs = Math.max(0, end - start);
        return new Date(localStart + durationMs).toISOString();
      }
    }
    return round.endsAt;
  }, [round]);

  const countdown = useCountdown(countdownTarget);

  const handleCheckIn = useCallback(async () => {
    try {
      await queueEvent({
        eventType: 'manual_checkin',
        roundId: round?.id ?? null,
        eventData: { source: 'dashboard.button', at: new Date().toISOString() },
      });
      await flushNow();
    } catch {
      /* check-in is best-effort */
    }
  }, [round?.id]);

  const dotState = connectionStatusToDot(connection.status);

  const violationsCount = round?.stats.violationsCount ?? 0;
  const distractions = round?.stats.distractionsDetected ?? 0;
  const appSwitches = round?.stats.appSwitches ?? 0;
  const idleMinutes = round?.stats.totalIdleMinutes ?? 0;
  const focusMinutes = round?.stats.totalFocusMinutes ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ConnectionBanner />

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.systemLabel}>PROJECT EXTRACTION</Text>
            <Text style={styles.identity}>
              {user?.displayName || user?.email || 'UNVERIFIED OPERATOR'}
            </Text>
          </View>
          <StatusDot
            kind={dotState.kind}
            label={dotState.label}
            pulse={connection.status !== 'offline'}
          />
        </View>

        {/* Round status hero */}
        {round ? (
          <View style={styles.heroCard}>
            <View style={styles.heroLabelRow}>
              <Text style={styles.heroEyebrow}>ROUND IN PROGRESS</Text>
              <Text style={styles.heroState}>{round.operationalState}</Text>
            </View>
            <Text style={styles.chrono}>{countdown.formatted}</Text>
            <Text style={styles.chronoCaption}>
              Time remaining · local timer authoritative
            </Text>

            <View style={styles.heroFooterRow}>
              <View style={styles.heroFooterItem}>
                <Text style={styles.heroFooterLabel}>VIOLATIONS</Text>
                <AnimatedValue
                  style={styles.heroFooterValue}
                  value={violationsCount}
                />
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroFooterItem}>
                <Text style={styles.heroFooterLabel}>FOCUS MIN</Text>
                <AnimatedValue
                  style={styles.heroFooterValue}
                  value={focusMinutes}
                />
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroFooterItem}>
                <Text style={styles.heroFooterLabel}>SCORE</Text>
                <AnimatedValue
                  style={styles.heroFooterValue}
                  value={round.stats.productivityScore ?? '—'}
                />
              </View>
            </View>

            <View style={styles.heroActions}>
              <OperationalButton label="Check in" onPress={handleCheckIn} />
            </View>
          </View>
        ) : (
          <View style={styles.heroCard}>
            <View style={styles.heroLabelRow}>
              <Text style={styles.heroEyebrow}>STANDBY</Text>
              <Text style={[styles.heroState, styles.heroStateStandby]}>
                DORMANT
              </Text>
            </View>
            <Text style={styles.chronoStandby}>00:00:00</Text>
            <Text style={styles.chronoCaption}>
              No active round. Select a mission to commence operations.
            </Text>
          </View>
        )}

        {/* Behavioral metrics */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BEHAVIORAL METRICS</Text>
          <View style={styles.metricsRow}>
            <MetricCard label="Distractions" value={distractions} caption="this round" emphasized />
            <MetricCard label="App switches" value={appSwitches} caption="cumulative" />
          </View>
          <View style={styles.metricsRow}>
            <MetricCard label="Idle minutes" value={idleMinutes} caption="cumulative" />
            <MetricCard label="Violations" value={violationsCount} caption="this round" />
          </View>
        </View>

        {/* Operational log */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>OPERATIONAL LOG</Text>
          <View style={styles.logCard}>
            {logs.length === 0 ? (
              <View style={styles.logEmpty}>
                <Text style={styles.logMessage}>No events recorded.</Text>
              </View>
            ) : (
              logs.map((entry, index) => (
                <View
                  key={entry.id}
                  style={[
                    styles.logRow,
                    index < logs.length - 1 && styles.logRowDivider,
                  ]}
                >
                  <Text
                    style={[
                      styles.logBullet,
                      entry.level === 'critical' && styles.logBulletCritical,
                      entry.level === 'warning' && styles.logBulletWarning,
                    ]}
                  >
                    {'>'}
                  </Text>
                  <View style={styles.logContent}>
                    <Text style={styles.logMeta}>
                      {formatLogStamp(entry.createdAt)} · {entry.category.toUpperCase()}
                    </Text>
                    <Text style={styles.logMessage}>{entry.description}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerStat}>
            <Text style={styles.footerLabel}>REPUTATION</Text>
            <AnimatedValue style={styles.footerValue} value={reputation} />
          </View>
          <View style={styles.footerDivider} />
          <View style={styles.footerStat}>
            <Text style={styles.footerLabel}>STREAK</Text>
            <AnimatedValue style={styles.footerValue} value={streak} />
          </View>
          <View style={styles.footerDivider} />
          <View style={styles.footerStat}>
            <Text style={styles.footerLabel}>CEILING</Text>
            <AnimatedValue style={styles.footerValue} value={ceiling.toFixed(1)} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.l,
    paddingBottom: spacing.xxxl,
    gap: spacing.l,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    gap: spacing.xxs,
  },
  systemLabel: {
    color: colors.text.operational,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.widest,
  },
  identity: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.body,
    letterSpacing: typography.letterSpacing.wide,
  },
  heroCard: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    padding: spacing.l,
    gap: spacing.s,
  },
  heroLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroEyebrow: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.widest,
  },
  heroState: {
    color: colors.accent.operational,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.widest,
  },
  heroStateStandby: {
    color: colors.text.tertiary,
  },
  chrono: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.chrono,
    letterSpacing: typography.letterSpacing.tight,
    marginTop: spacing.s,
  },
  chronoStandby: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.chrono,
    letterSpacing: typography.letterSpacing.tight,
    marginTop: spacing.s,
  },
  chronoCaption: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.wide,
  },
  heroFooterRow: {
    flexDirection: 'row',
    marginTop: spacing.m,
    paddingTop: spacing.m,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  heroFooterItem: {
    flex: 1,
    gap: spacing.xxs,
  },
  heroFooterLabel: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.micro,
    letterSpacing: typography.letterSpacing.wider,
  },
  heroFooterValue: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.bodyLg,
  },
  heroDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.s,
  },
  heroActions: {
    marginTop: spacing.m,
  },
  section: {
    gap: spacing.s,
  },
  sectionLabel: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.widest,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  logCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  logRow: {
    flexDirection: 'row',
    padding: spacing.m,
    gap: spacing.s,
  },
  logRowDivider: {
    borderBottomColor: colors.borderDim,
    borderBottomWidth: 1,
  },
  logBullet: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.body,
  },
  logBulletCritical: {
    color: colors.accent.operational,
  },
  logBulletWarning: {
    color: colors.accent.warning,
  },
  logContent: {
    flex: 1,
    gap: spacing.xxs,
  },
  logMeta: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.micro,
    letterSpacing: typography.letterSpacing.wider,
  },
  logMessage: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    lineHeight: typography.sizes.caption * typography.lineHeights.relaxed,
  },
  logEmpty: {
    padding: spacing.m,
  },
  footer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.m,
    marginTop: spacing.m,
  },
  footerStat: {
    flex: 1,
    gap: spacing.xxs,
  },
  footerLabel: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.micro,
    letterSpacing: typography.letterSpacing.wider,
  },
  footerValue: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.heading,
  },
  footerDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.s,
  },
});
