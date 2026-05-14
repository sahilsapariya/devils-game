/**
 * Stark mono-font input. No floating labels, no rounded corners.
 */
import React, { useState } from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputFocusEventData,
  View,
} from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

interface Props {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric';
  textContentType?: 'username' | 'password' | 'newPassword' | 'emailAddress';
  error?: string | null;
  accessibilityLabel?: string;
}

export function OperationalInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = 'none',
  autoCorrect = false,
  keyboardType = 'default',
  textContentType,
  error,
  accessibilityLabel,
}: Props): React.ReactElement {
  const [focused, setFocused] = useState(false);

  const handleFocus = (
    _e: NativeSyntheticEvent<TextInputFocusEventData>,
  ): void => {
    setFocused(true);
  };
  const handleBlur = (
    _e: NativeSyntheticEvent<TextInputFocusEventData>,
  ): void => {
    setFocused(false);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.fieldShell,
          focused && styles.fieldShellFocused,
          !!error && styles.fieldShellError,
        ]}
      >
        <Text style={styles.cursor}>{'>'}</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.text.tertiary}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          keyboardType={keyboardType}
          textContentType={textContentType}
          onFocus={handleFocus}
          onBlur={handleBlur}
          accessibilityLabel={accessibilityLabel ?? label}
          selectionColor={colors.text.operational}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginBottom: spacing.m,
  },
  label: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.wider,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  fieldShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.s,
    borderRadius: radius.sharp,
    minHeight: 48,
  },
  fieldShellFocused: {
    borderColor: colors.text.primary,
  },
  fieldShellError: {
    borderColor: colors.accent.operational,
  },
  cursor: {
    color: colors.text.operational,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.body,
    marginRight: spacing.s,
  },
  input: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.bodyLg,
    paddingVertical: spacing.s,
  },
  error: {
    color: colors.accent.operational,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    marginTop: spacing.xs,
    letterSpacing: typography.letterSpacing.wide,
  },
});
