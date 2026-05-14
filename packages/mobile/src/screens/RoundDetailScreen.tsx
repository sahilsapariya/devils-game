/**
 * Round detail — drill-down on a single round.
 * Skeleton placeholder, wires up route param typing.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { colors, spacing, typography } from '../theme';
import type { AppStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'RoundDetail'>;

export function RoundDetailScreen({ route }: Props): React.ReactElement {
  const { roundId } = route.params;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>ROUND DOSSIER</Text>
        <Text style={styles.title}>{roundId.toUpperCase()}</Text>
        <Text style={styles.body}>
          Detailed operational record. Telemetry, announcements, and
          consequences associated with this round will surface here.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.l,
    gap: spacing.s,
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
  body: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.body,
    lineHeight: typography.sizes.body * typography.lineHeights.relaxed,
  },
});
