/**
 * Auth context — holds the current authenticated session in memory.
 * The single source of truth for "is the operator authenticated".
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { User } from '@extraction/shared/types/models';

import {
  AuthSession,
  LoginCredentials,
  RegisterPayload,
  loadPersistedSession,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from '../services/auth.service';

interface AuthState {
  status: 'initializing' | 'unauthenticated' | 'authenticated';
  session: AuthSession | null;
  user: User | null;
  error: string | null;
  busy: boolean;
}

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const INITIAL_STATE: AuthState = {
  status: 'initializing',
  session: null,
  user: null,
  error: null,
  busy: false,
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const persisted = await loadPersistedSession();
        if (!mounted.current) return;
        if (persisted) {
          setState({
            status: 'authenticated',
            session: persisted,
            user: persisted.user,
            error: null,
            busy: false,
          });
        } else {
          setState({
            status: 'unauthenticated',
            session: null,
            user: null,
            error: null,
            busy: false,
          });
        }
      } catch {
        if (!mounted.current) return;
        setState({
          status: 'unauthenticated',
          session: null,
          user: null,
          error: null,
          busy: false,
        });
      }
    })();
  }, []);

  const handleLogin = useCallback(async (credentials: LoginCredentials) => {
    setState((prev) => ({ ...prev, busy: true, error: null }));
    try {
      const session = await loginRequest(credentials);
      if (!mounted.current) return;
      setState({
        status: 'authenticated',
        session,
        user: session.user,
        error: null,
        busy: false,
      });
    } catch (err) {
      if (!mounted.current) return;
      const message =
        err instanceof Error ? err.message : 'Authentication failed';
      setState((prev) => ({ ...prev, busy: false, error: message }));
      throw err;
    }
  }, []);

  const handleRegister = useCallback(async (payload: RegisterPayload) => {
    setState((prev) => ({ ...prev, busy: true, error: null }));
    try {
      const session = await registerRequest(payload);
      if (!mounted.current) return;
      setState({
        status: 'authenticated',
        session,
        user: session.user,
        error: null,
        busy: false,
      });
    } catch (err) {
      if (!mounted.current) return;
      const message =
        err instanceof Error ? err.message : 'Registration failed';
      setState((prev) => ({ ...prev, busy: false, error: message }));
      throw err;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setState((prev) => ({ ...prev, busy: true }));
    try {
      await logoutRequest();
    } finally {
      if (mounted.current) {
        setState({
          status: 'unauthenticated',
          session: null,
          user: null,
          error: null,
          busy: false,
        });
      }
    }
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login: handleLogin,
      register: handleRegister,
      logout: handleLogout,
      clearError,
    }),
    [state, handleLogin, handleRegister, handleLogout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
