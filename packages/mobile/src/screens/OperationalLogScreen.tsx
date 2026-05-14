/**
 * Operational log screen — full historical timeline.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listRecentLogs, LocalLog } from '../db/repositories/logs.repo';
import { initDatabase } from '../db/database';
import { colors, spacing, typography } from '../theme';

function formatStamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().replace('T', ' ').slice(0, 19) + ' Z';
  } catch {
    return iso;
  }
}

export function OperationalLogScreen(): React.ReactElement {
  const [logs, setLogs] = useState<LocalLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      await initDatabase();
      const rows = await listRecentLogs(100);
      setLogs(rows);
    } catch {
      setLogs([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>OPERATIONAL LOG</Text>
        <Text style={styles.subtitle}>
          Append-only timeline. Nothing here is forgotten.
        </Text>
      </View>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {'>'} no operational events recorded.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text
              style={[
                styles.bullet,
                item.level === 'critical' && styles.bulletCritical,
                item.level === 'warning' && styles.bulletWarning,
              ]}
            >
              {'>'}
            </Text>
            <View style={styles.content}>
              <Text style={styles.timestamp}>
                {formatStamp(item.createdAt)} · {item.category.toUpperCase()}
              </Text>
              <Text style={styles.description}>{item.description}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.l,
    paddingBottom: spacing.m,
    gap: spacing.xs,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.heading,
    letterSpacing: typography.letterSpacing.wider,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.wide,
  },
  list: {
    padding: spacing.l,
    paddingBottom: spacing.xxxl,
  },
  empty: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.wider,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.s,
    marginBottom: spacing.m,
  },
  bullet: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.body,
  },
  bulletCritical: {
    color: colors.accent.operational,
  },
  bulletWarning: {
    color: colors.accent.warning,
  },
  content: {
    flex: 1,
  },
  timestamp: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.micro,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom: spacing.xxs,
  },
  description: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    lineHeight: typography.sizes.caption * typography.lineHeights.relaxed,
  },
});
