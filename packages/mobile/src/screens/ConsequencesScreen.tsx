/**
 * Consequences screen — lists active (unacknowledged) consequences.
 *
 * Sync sequence:
 *   1) Read local cache
 *   2) Pull from backend (best-effort) and merge into local
 *   3) Live-update via realtime 'consequence:issued' subscription
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OperationalButton } from '../components/OperationalButton';
import type { ConsequenceSeverity } from '@extraction/shared/types/models';
import type { LocalConsequence } from '../db/repositories/consequences.repo';
import {
  acknowledgeConsequence,
  listLocalConsequences,
  syncConsequences,
} from '../services/consequences.service';
import { useRealtimeEvent } from '../store/realtime.context';
import { colors, spacing, typography } from '../theme';

interface SeverityStyle {
  border: string;
  background: string;
  badge: string;
  badgeText: string;
}

const SEVERITY_STYLE: Record<ConsequenceSeverity, SeverityStyle> = {
  low: {
    border: colors.border,
    background: colors.surface,
    badge: colors.text.secondary,
    badgeText: colors.text.inverse,
  },
  medium: {
    border: colors.accent.warning,
    background: colors.surface,
    badge: colors.accent.warning,
    badgeText: colors.text.inverse,
  },
  high: {
    border: colors.accent.operationalDim,
    background: colors.overlay.redWash,
    badge: colors.accent.operationalDim,
    badgeText: colors.text.primary,
  },
  critical: {
    border: colors.accent.operational,
    background: colors.overlay.redWash,
    badge: colors.accent.operational,
    badgeText: colors.text.primary,
  },
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toTimeString().slice(0, 8)}`;
  } catch {
    return iso;
  }
}

export function ConsequencesScreen(): React.ReactElement {
  const [items, setItems] = useState<LocalConsequence[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const local = await listLocalConsequences();
    setItems(local);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await syncConsequences();
      setItems(next);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void refresh();
  }, [load, refresh]);

  useRealtimeEvent('consequence:issued', () => {
    void load();
  });

  const handleAcknowledge = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await acknowledgeConsequence(id);
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refresh();
            }}
            tintColor={colors.text.primary}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>ALERTS</Text>
          <Text style={styles.title}>OUTSTANDING CONSEQUENCES</Text>
          <Text style={styles.caption}>
            {items.length === 0
              ? 'No unacknowledged consequences. Operational integrity nominal.'
              : `${items.length} record${items.length === 1 ? '' : 's'} awaiting acknowledgement.`}
          </Text>
        </View>

        {items.map((item) => {
          const style = SEVERITY_STYLE[item.severity];
          return (
            <View
              key={item.id}
              style={[
                styles.card,
                { borderColor: style.border, backgroundColor: style.background },
              ]}
            >
              <View style={styles.cardHeader}>
                <View
                  style={[styles.badge, { backgroundColor: style.badge }]}
                >
                  <Text style={[styles.badgeText, { color: style.badgeText }]}>
                    {item.severity.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.cardType}>
                  {item.consequenceType.replace(/_/g, ' ').toUpperCase()}
                </Text>
              </View>
              <Text style={styles.description}>{item.description}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>ISSUED</Text>
                <Text style={styles.metaValue}>
                  {formatTimestamp(item.issuedAt)}
                </Text>
              </View>
              {item.reputationDelta !== 0 ? (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>REPUTATION</Text>
                  <Text style={styles.metaValue}>
                    {item.reputationDelta > 0 ? '+' : ''}
                    {item.reputationDelta}
                  </Text>
                </View>
              ) : null}
              <View style={styles.actions}>
                <OperationalButton
                  label="Acknowledge"
                  variant={
                    item.severity === 'critical' || item.severity === 'high'
                      ? 'danger'
                      : 'ghost'
                  }
                  loading={busyId === item.id}
                  onPress={() => {
                    void handleAcknowledge(item.id);
                  }}
                />
              </View>
            </View>
          );
        })}
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
    gap: spacing.m,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.s,
  },
  eyebrow: {
    color: colors.text.operational,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.widest,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.heading,
    letterSpacing: typography.letterSpacing.wide,
  },
  caption: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.wide,
  },
  card: {
    borderWidth: 1,
    padding: spacing.m,
    gap: spacing.s,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  badge: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xxs,
  },
  badgeText: {
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.micro,
    letterSpacing: typography.letterSpacing.widest,
  },
  cardType: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.widest,
  },
  description: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.body,
    lineHeight: typography.sizes.body * typography.lineHeights.relaxed,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.micro,
    letterSpacing: typography.letterSpacing.wider,
  },
  metaValue: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.wide,
  },
  actions: {
    marginTop: spacing.s,
  },
});
