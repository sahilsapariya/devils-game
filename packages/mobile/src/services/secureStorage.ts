/**
 * Thin wrapper around expo-secure-store. Provides a single place to swap
 * the implementation (e.g. AsyncStorage for web) and to inject namespacing.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PREFIX = 'extraction.';

function key(name: string): string {
  return `${PREFIX}${name}`;
}

export async function setSecure(name: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    // expo-secure-store is unsupported on web. Use sessionStorage as a
    // best-effort fallback; never used for real credentials in production.
    if (typeof globalThis !== 'undefined') {
      const ss = (globalThis as { sessionStorage?: Storage }).sessionStorage;
      ss?.setItem(key(name), value);
    }
    return;
  }
  await SecureStore.setItemAsync(key(name), value);
}

export async function getSecure(name: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof globalThis !== 'undefined') {
      const ss = (globalThis as { sessionStorage?: Storage }).sessionStorage;
      return ss?.getItem(key(name)) ?? null;
    }
    return null;
  }
  return SecureStore.getItemAsync(key(name));
}

export async function deleteSecure(name: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof globalThis !== 'undefined') {
      const ss = (globalThis as { sessionStorage?: Storage }).sessionStorage;
      ss?.removeItem(key(name));
    }
    return;
  }
  await SecureStore.deleteItemAsync(key(name));
}
