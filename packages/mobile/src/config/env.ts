/**
 * Runtime configuration sourced from app.json / expo-constants.
 * Defaults target a local development backend.
 */
import Constants from 'expo-constants';

interface RuntimeExtras {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
}

function readExtras(): RuntimeExtras {
  const extras: unknown =
    (Constants?.expoConfig?.extra as unknown) ??
    (Constants as unknown as { manifest?: { extra?: unknown } })?.manifest
      ?.extra ??
    {};
  if (extras && typeof extras === 'object') {
    return extras as RuntimeExtras;
  }
  return {};
}

const extras = readExtras();

export const env = {
  apiBaseUrl: extras.apiBaseUrl ?? 'http://localhost:3001/api',
  wsBaseUrl: extras.wsBaseUrl ?? 'http://localhost:3001',
  appName: 'PROJECT EXTRACTION',
} as const;
