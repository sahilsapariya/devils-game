/**
 * Compact metric tile — used in the dashboard behavioral metrics row.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';

interface Props {
  label: string;
  value: string | number;
  caption?: string;
  emphasized?: boolean;
}

export function MetricCard({
  label,
  value,
  caption,
  emphasized,
}: Props): React.ReactElement {
  return (
    <View style={[styles.card, emphasized && styles.cardEmphasized]}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Text style={[styles.value, emphasized && styles.valueEmphasized]}>
        {value}
      </Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.s,
    gap: spacing.xxs,
  },
  cardEmphasized: {
    borderColor: colors.accent.operational,
  },
  label: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.micro,
    letterSpacing: typography.letterSpacing.wider,
  },
  value: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.heading,
    letterSpacing: typography.letterSpacing.tight,
  },
  valueEmphasized: {
    color: colors.accent.operational,
  },
  caption: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.micro,
  },
});
