/**
 * Connection banner — surfaces extended offline state to the user.
 *
 * Visibility ladder:
 *   - <10 min offline: hidden (transient drops are normal)
 *   - >=10 min offline: visible "operating offline" notice
 *   - >=30 min offline: same notice with a subtle red wash to escalate
 *
 * Operation never halts — this is purely informational.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useBackendConnection } from '../hooks/useBackendConnection';
import { colors, spacing, typography } from '../theme';

const SHOW_THRESHOLD_SEC = 10 * 60;
const ESCALATION_THRESHOLD_SEC = 30 * 60;

export function ConnectionBanner(): React.ReactElement | null {
  const { status, offlineDurationSec } = useBackendConnection();

  if (status !== 'offline' || offlineDurationSec < SHOW_THRESHOLD_SEC) {
    return null;
  }

  const escalated = offlineDurationSec >= ESCALATION_THRESHOLD_SEC;
  const minutes = Math.floor(offlineDurationSec / 60);

  return (
    <View
      style={[
        styles.banner,
        escalated && styles.bannerEscalated,
      ]}
    >
      <Text style={[styles.label, escalated && styles.labelEscalated]}>
        OFFLINE MODE · {minutes}M
      </Text>
      <Text style={styles.detail}>
        Operation continues locally. Sync resumes on reconnect.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderColor: colors.accent.warning,
    backgroundColor: colors.surface,
    padding: spacing.s,
    gap: spacing.xxs,
  },
  bannerEscalated: {
    borderColor: colors.accent.operationalDim,
    backgroundColor: colors.overlay.redWash,
  },
  label: {
    color: colors.accent.warning,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.widest,
  },
  labelEscalated: {
    color: colors.accent.operational,
  },
  detail: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.micro,
    letterSpacing: typography.letterSpacing.wide,
  },
});
