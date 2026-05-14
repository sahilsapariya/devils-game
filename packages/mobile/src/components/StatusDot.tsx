/**
 * Compact status dot + label. Used in headers and stat strips.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';

export type StatusKind = 'online' | 'offline' | 'degraded' | 'severed';

interface Props {
  kind: StatusKind;
  label: string;
  pulse?: boolean;
}

const KIND_COLOR: Record<StatusKind, string> = {
  online: colors.status.online,
  offline: colors.status.offline,
  degraded: colors.status.degraded,
  severed: colors.status.severed,
};

export function StatusDot({ kind, label, pulse = false }: Props): React.ReactElement {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) {
      opacity.setValue(1);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, opacity]);

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[styles.dot, { backgroundColor: KIND_COLOR[kind], opacity }]}
      />
      <Text style={styles.label}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.wider,
  },
});
