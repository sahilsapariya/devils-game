/**
 * Mission list — assignments awaiting operational engagement.
 * Skeleton: shows mock missions until backend wiring lands.
 */
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../theme';

interface MockMission {
  id: string;
  designation: string;
  description: string;
  priority: 'PRIMARY' | 'SECONDARY' | 'TERTIARY';
  totalRounds: number;
  completedRounds: number;
}

const MOCK_MISSIONS: ReadonlyArray<MockMission> = [
  {
    id: 'm-001',
    designation: 'EXTRACTION ALPHA',
    description: 'Refactor authentication module. Eight focus blocks required.',
    priority: 'PRIMARY',
    totalRounds: 8,
    completedRounds: 3,
  },
  {
    id: 'm-002',
    designation: 'CHANNEL BRAVO',
    description: 'Stabilize telemetry pipeline. Three integration rounds.',
    priority: 'SECONDARY',
    totalRounds: 3,
    completedRounds: 0,
  },
  {
    id: 'm-003',
    designation: 'OUTPOST DELTA',
    description: 'Documentation pass on operational state machine.',
    priority: 'TERTIARY',
    totalRounds: 2,
    completedRounds: 0,
  },
];

export function MissionListScreen(): React.ReactElement {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>MISSION REGISTER</Text>
        <Text style={styles.subtitle}>
          Active assignments. Engagement is not optional.
        </Text>
      </View>
      <FlatList
        data={MOCK_MISSIONS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.designation}>{item.designation}</Text>
              <Text
                style={[
                  styles.priority,
                  item.priority === 'PRIMARY' && styles.priorityPrimary,
                ]}
              >
                {item.priority}
              </Text>
            </View>
            <Text style={styles.description}>{item.description}</Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(
                      100,
                      (item.completedRounds / Math.max(1, item.totalRounds)) *
                        100,
                    )}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressLabel}>
              {item.completedRounds}/{item.totalRounds} rounds completed
            </Text>
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
  },
  separator: {
    height: spacing.m,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.m,
    gap: spacing.s,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  designation: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.bodyLg,
    letterSpacing: typography.letterSpacing.wide,
  },
  priority: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.micro,
    letterSpacing: typography.letterSpacing.widest,
  },
  priorityPrimary: {
    color: colors.accent.operational,
  },
  description: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    lineHeight: typography.sizes.caption * typography.lineHeights.relaxed,
  },
  progressBar: {
    height: 2,
    backgroundColor: colors.borderDim,
    marginTop: spacing.s,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.text.primary,
  },
  progressLabel: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.micro,
    letterSpacing: typography.letterSpacing.wider,
  },
});
