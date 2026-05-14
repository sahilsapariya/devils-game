/**
 * Operational button. Stark, no rounded corners beyond a hairline,
 * no shadows, no playful states. Built for clarity, not flourish.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

export type OperationalButtonVariant = 'primary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  variant?: OperationalButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}

export function OperationalButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  accessibilityHint,
}: Props): React.ReactElement {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.base,
        VARIANT_STYLES[variant].container,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator
            color={VARIANT_STYLES[variant].text.color}
            size="small"
          />
        ) : null}
        <Text style={[styles.label, VARIANT_STYLES[variant].text]}>
          {label.toUpperCase()}
        </Text>
      </View>
    </Pressable>
  );
}

const VARIANT_STYLES: Record<
  OperationalButtonVariant,
  { container: object; text: { color: string } }
> = {
  primary: {
    container: {
      backgroundColor: colors.text.primary,
      borderColor: colors.text.primary,
    },
    text: { color: colors.text.inverse },
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
      borderColor: colors.borderStrong,
    },
    text: { color: colors.text.primary },
  },
  danger: {
    container: {
      backgroundColor: colors.accent.operational,
      borderColor: colors.accent.operational,
    },
    text: { color: colors.text.primary },
  },
};

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderWidth: 1,
    borderRadius: radius.sharp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.label,
    letterSpacing: typography.letterSpacing.wider,
  },
});
