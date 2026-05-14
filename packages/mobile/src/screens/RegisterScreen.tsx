/**
 * Operator credential request screen.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { OperationalButton } from '../components/OperationalButton';
import { OperationalInput } from '../components/OperationalInput';
import { useAuth } from '../store/auth.context';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props): React.ReactElement {
  const { register, busy, error, clearError } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const onSubmit = async (): Promise<void> => {
    setFieldError(null);
    clearError();
    if (!email.trim() || !password) {
      setFieldError('Operator ID and key required.');
      return;
    }
    if (password.length < 8) {
      setFieldError('Authentication key must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setFieldError('Confirmation mismatch.');
      return;
    }
    try {
      await register({
        email: email.trim().toLowerCase(),
        password,
        displayName: displayName.trim() || undefined,
      });
    } catch {
      // Error surfaced via auth context state.
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>OPERATOR INTAKE</Text>
          <Text style={styles.title}>REQUEST{`\n`}CREDENTIALS</Text>
          <Text style={styles.subtitle}>
            Provide identifiers. Once submitted, your operational record begins.
          </Text>
        </View>

        <View style={styles.form}>
          <OperationalInput
            label="Display callsign (optional)"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Optional designation"
            autoCapitalize="words"
          />
          <OperationalInput
            label="Operator ID"
            value={email}
            onChangeText={setEmail}
            placeholder="name@operations.local"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <OperationalInput
            label="Authentication key"
            value={password}
            onChangeText={setPassword}
            placeholder="Minimum 8 characters"
            secureTextEntry
            textContentType="newPassword"
          />
          <OperationalInput
            label="Confirm key"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repeat authentication key"
            secureTextEntry
            error={fieldError ?? error}
          />

          <View style={styles.actions}>
            <OperationalButton
              label="Submit intake"
              onPress={onSubmit}
              loading={busy}
            />
            <View style={styles.spacer} />
            <OperationalButton
              label="Return to authentication"
              variant="ghost"
              onPress={() => {
                clearError();
                navigation.goBack();
              }}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            BY PROCEEDING YOU CONSENT TO OPERATIONAL TELEMETRY COLLECTION
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.l,
    paddingTop: spacing.xxl,
    gap: spacing.xl,
  },
  titleBlock: {
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
    fontSize: typography.sizes.title,
    letterSpacing: typography.letterSpacing.wide,
    lineHeight: typography.sizes.title * typography.lineHeights.tight,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.body,
    lineHeight: typography.sizes.body * typography.lineHeights.relaxed,
    marginTop: spacing.xs,
  },
  form: {
    gap: spacing.m,
  },
  actions: {
    marginTop: spacing.l,
  },
  spacer: {
    height: spacing.s,
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
