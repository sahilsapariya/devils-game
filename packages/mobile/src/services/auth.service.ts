/**
 * Authentication service.
 *
 * Handles credential exchange with the backend and persistence of JWT
 * tokens in expo-secure-store. Mobile-only — never logs tokens, never
 * stores credentials.
 */
import type { AuthTokens, User } from '@extraction/shared/types/models';

import { apiRequest } from './apiClient';
import { deleteSecure, getSecure, setSecure } from './secureStorage';

const ACCESS_KEY = 'auth.access';
const REFRESH_KEY = 'auth.refresh';
const EXPIRES_AT_KEY = 'auth.expiresAt';
const USER_KEY = 'auth.user';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthSession {
  user: User;
  tokens: AuthTokens;
}

interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

async function persistSession(session: AuthSession): Promise<void> {
  const expiresAt = Date.now() + session.tokens.expiresIn * 1000;
  await Promise.all([
    setSecure(ACCESS_KEY, session.tokens.accessToken),
    setSecure(REFRESH_KEY, session.tokens.refreshToken),
    setSecure(EXPIRES_AT_KEY, String(expiresAt)),
    setSecure(USER_KEY, JSON.stringify(session.user)),
  ]);
}

export async function login(credentials: LoginCredentials): Promise<AuthSession> {
  const response = await apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: credentials,
    timeoutMs: 15000,
  });
  await persistSession(response);
  return response;
}

export async function register(payload: RegisterPayload): Promise<AuthSession> {
  const response = await apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: payload,
    timeoutMs: 15000,
  });
  await persistSession(response);
  return response;
}

export async function logout(): Promise<void> {
  const token = await getAccessToken();
  if (token) {
    try {
      await apiRequest<void>('/auth/logout', {
        method: 'POST',
        token,
        timeoutMs: 5000,
      });
    } catch {
      // Best-effort. Token will be discarded regardless.
    }
  }
  await Promise.all([
    deleteSecure(ACCESS_KEY),
    deleteSecure(REFRESH_KEY),
    deleteSecure(EXPIRES_AT_KEY),
    deleteSecure(USER_KEY),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return getSecure(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return getSecure(REFRESH_KEY);
}

export async function getPersistedUser(): Promise<User | null> {
  const raw = await getSecure(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function getExpiresAt(): Promise<number | null> {
  const raw = await getSecure(EXPIRES_AT_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function isSessionValid(): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  const expiresAt = await getExpiresAt();
  if (!expiresAt) return true;
  return expiresAt > Date.now() + 30_000;
}

export async function refreshTokens(): Promise<AuthTokens | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  try {
    const response = await apiRequest<{ tokens: AuthTokens }>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      timeoutMs: 10000,
    });
    const tokens = response.tokens;
    const expiresAt = Date.now() + tokens.expiresIn * 1000;
    await Promise.all([
      setSecure(ACCESS_KEY, tokens.accessToken),
      setSecure(REFRESH_KEY, tokens.refreshToken),
      setSecure(EXPIRES_AT_KEY, String(expiresAt)),
    ]);
    return tokens;
  } catch {
    return null;
  }
}

export async function loadPersistedSession(): Promise<AuthSession | null> {
  const [user, access, refresh, expiresAtRaw] = await Promise.all([
    getPersistedUser(),
    getAccessToken(),
    getRefreshToken(),
    getSecure(EXPIRES_AT_KEY),
  ]);
  if (!user || !access || !refresh) return null;
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : Date.now() + 3600_000;
  const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return {
    user,
    tokens: {
      accessToken: access,
      refreshToken: refresh,
      expiresIn: remaining,
    },
  };
}
