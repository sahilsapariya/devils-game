/**
 * Root navigator. Splits between authenticated and unauthenticated stacks.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  DarkTheme,
  NavigationContainer,
  Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { ConsequencesScreen } from '../screens/ConsequencesScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MissionListScreen } from '../screens/MissionListScreen';
import { OperationalLogScreen } from '../screens/OperationalLogScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { RoundDetailScreen } from '../screens/RoundDetailScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

import { useUnacknowledgedConsequences } from '../hooks/useUnacknowledgedConsequences';
import { useAuth } from '../store/auth.context';
import { colors, typography } from '../theme';
import type {
  AppStackParamList,
  AppTabParamList,
  AuthStackParamList,
} from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<AppTabParamList>();

const navTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.text.primary,
    border: colors.border,
    primary: colors.text.primary,
    notification: colors.accent.operational,
  },
};

function AuthenticatedTabs(): React.ReactElement {
  const { count: alertCount } = useUnacknowledgedConsequences();

  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.text.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle: {
          fontFamily: typography.fonts.mono,
          fontSize: typography.sizes.micro,
          letterSpacing: typography.letterSpacing.wider,
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.accent.operational,
          color: colors.text.primary,
          fontFamily: typography.fonts.mono,
          fontSize: typography.sizes.micro,
        },
        tabBarIconStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: 'DASH' }}
      />
      <Tabs.Screen
        name="Missions"
        component={MissionListScreen}
        options={{ tabBarLabel: 'MISSIONS' }}
      />
      <Tabs.Screen
        name="Alerts"
        component={ConsequencesScreen}
        options={{
          tabBarLabel: 'ALERTS',
          tabBarBadge: alertCount > 0 ? alertCount : undefined,
        }}
      />
      <Tabs.Screen
        name="OperationalLogTab"
        component={OperationalLogScreen}
        options={{ tabBarLabel: 'LOG' }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'OPS' }}
      />
    </Tabs.Navigator>
  );
}

function AuthenticatedStack(): React.ReactElement {
  return (
    <AppStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <AppStack.Screen name="Tabs" component={AuthenticatedTabs} />
      <AppStack.Screen
        name="RoundDetail"
        component={RoundDetailScreen}
        options={{ headerShown: false }}
      />
    </AppStack.Navigator>
  );
}

function UnauthenticatedStack(): React.ReactElement {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator(): React.ReactElement {
  const { status } = useAuth();

  if (status === 'initializing') {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.text.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {status === 'authenticated' ? (
        <AuthenticatedStack />
      ) : (
        <UnauthenticatedStack />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
