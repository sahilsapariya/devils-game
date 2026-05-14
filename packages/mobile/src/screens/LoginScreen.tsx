/**
 * Login screen — authentication entry.
 * Procedural tone: "Authenticate to continue."
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
import { StatusDot } from '../components/StatusDot';
import { useAuth } from '../store/auth.context';
import { colors, spacing, typography } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props): React.ReactElement {
  const { login, busy, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const onSubmit = async (): Promise<void> => {
    setFieldError(null);
    clearError();
    if (!email.trim() || !password) {
      setFieldError('Operator ID and key required.');
      return;
    }
    try {
      await login({ email: email.trim().toLowerCase(), password });
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
        <View style={styles.headerStrip}>
          <StatusDot kind="online" label="Channel secure" />
          <Text style={styles.versionText}>v0.1.0</Text>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>PROJECT EXTRACTION</Text>
          <Text style={styles.title}>AUTHENTICATE{`\n`}TO PROCEED</Text>
          <Text style={styles.subtitle}>
            Operator identity required. The system remembers.
          </Text>
        </View>

        <View style={styles.form}>
          <OperationalInput
            label="Operator ID"
            value={email}
            onChangeText={setEmail}
            placeholder="name@operations.local"
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
          />
          <OperationalInput
            label="Authentication key"
            value={password}
            onChangeText={setPassword}
            placeholder="********"
            secureTextEntry
            textContentType="password"
            error={fieldError ?? error}
          />

          <View style={styles.actions}>
            <OperationalButton
              label="Initiate session"
              onPress={onSubmit}
              loading={busy}
            />
            <View style={styles.spacer} />
            <OperationalButton
              label="Request operator credentials"
              variant="ghost"
              onPress={() => {
                clearError();
                navigation.navigate('Register');
              }}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            ALL TRANSMISSIONS LOGGED · NO ANONYMITY GUARANTEED
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
  headerStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  versionText: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.wider,
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
