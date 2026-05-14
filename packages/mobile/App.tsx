/**
 * App entry. Wires global providers, initializes the local database,
 * starts the announcement dispatcher, and (when authenticated) the
 * telemetry uploader worker.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnnouncementOverlay } from './src/components/AnnouncementOverlay';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AuthProvider, useAuth } from './src/store/auth.context';
import { RealtimeProvider } from './src/store/realtime.context';
import { initDatabase } from './src/db/database';
import {
  startAnnouncementDispatcher,
  stopAnnouncementDispatcher,
} from './src/services/announcement.service';
import {
  startTelemetryUploader,
  stopTelemetryUploader,
} from './src/services/telemetry-uploader.service';
import { colors, spacing, typography } from './src/theme';

function TelemetryWorker(): null {
  const { status } = useAuth();
  useEffect(() => {
    if (status === 'authenticated') {
      startTelemetryUploader();
      return () => {
        stopTelemetryUploader();
      };
    }
    return undefined;
  }, [status]);
  return null;
}

export default function App(): React.ReactElement {
  const [bootState, setBootState] = useState<'initializing' | 'ready' | 'error'>(
    'initializing',
  );
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initDatabase();
        startAnnouncementDispatcher();
        if (!cancelled) setBootState('ready');
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Unknown initialization error';
        setBootError(message);
        setBootState('error');
      }
    })();
    return () => {
      cancelled = true;
      stopAnnouncementDispatcher();
      stopTelemetryUploader();
    };
  }, []);

  if (bootState === 'initializing') {
    return (
      <View style={styles.boot}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.text.primary} size="small" />
        <Text style={styles.bootText}>INITIALIZING OPERATIONAL RUNTIME</Text>
      </View>
    );
  }

  if (bootState === 'error') {
    return (
      <View style={styles.boot}>
        <StatusBar style="light" />
        <Text style={styles.errorLabel}>RUNTIME FAILURE</Text>
        <Text style={styles.errorText}>
          {bootError ?? 'Local persistence unavailable.'}
        </Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <RealtimeProvider>
            <TelemetryWorker />
            <View style={styles.flex}>
              <RootNavigator />
              <AnnouncementOverlay />
            </View>
          </RealtimeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  boot: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
    gap: spacing.m,
  },
  bootText: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.widest,
  },
  errorLabel: {
    color: colors.accent.operational,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.caption,
    letterSpacing: typography.letterSpacing.widest,
  },
  errorText: {
    color: colors.text.primary,
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.body,
    textAlign: 'center',
  },
});
