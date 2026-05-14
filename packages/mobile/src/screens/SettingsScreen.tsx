/**
 * Settings — operator profile and session controls.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OperationalButton } from '../components/OperationalButton';
import { useAuth } from '../store/auth.context';
import { colors, spacing, typography } from '../theme';

export function SettingsScreen(): React.ReactElement {
  const { user, logout, busy } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OPERATOR PROFILE</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Operator ID</Text>
            <Text style={styles.rowValue}>{user?.email ?? '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Callsign</Text>
            <Text style={styles.rowValue}>{user?.displayName ?? '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Reputation</Text>
            <Text style={styles.rowValue}>
              {user?.reputationScore ?? 0}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Current streak</Text>
            <Text style={styles.rowValue}>{user?.currentStreak ?? 0}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Difficulty ceiling</Text>
            <Text style={styles.rowValue}>
              {user?.difficultyCeiling?.toFixed(2) ?? '—'}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SESSION</Text>
          <OperationalButton
            label="Terminate session"
            variant="danger"
            onPress={() => {
              void logout();
            }}
            loading={busy}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            DATA RETENTION · TELEMETRY 90D · CONSEQUENCES PERMANENT
          </Text>
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
    gap: spacing.xl,
  },
  section: {
    gap: spacing.s,
  },
  sectionTitle: {
    color: colors.text.operational,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.widest,
    marginBottom: spacing.s,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  rowLabel: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.wide,
  },
  rowValue: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.body,
  },
  footer: {
    marginTop: spacing.xl,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: spacing.m,
  },
  footerText: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.micro,
    letterSpacing: typography.letterSpacing.widest,
    textAlign: 'center',
  },
});
