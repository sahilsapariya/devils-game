/**
 * Realtime context — exposes the Socket.io connection lifecycle and
 * a typed subscribe hook to React components.
 *
 * The provider auto-connects when the user is authenticated and tears
 * the connection down on logout. Connection failure is non-fatal —
 * mobile keeps operating from local SQLite state.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ConnectionStatus,
  RealtimeEventName,
  RealtimeEventPayload,
  getRealtimeService,
} from '../services/realtime.service';
import { useAuth } from './auth.context';
import { createLogger } from '../utils/logger';

const logger = createLogger('realtime.context');

interface RealtimeContextValue {
  status: ConnectionStatus;
  subscribe: <E extends RealtimeEventName>(
    event: E,
    handler: (payload: RealtimeEventPayload<E>) => void,
  ) => () => void;
  emit: (event: string, payload: unknown) => boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

interface RealtimeProviderProps {
  children: React.ReactNode;
}

export function RealtimeProvider({
  children,
}: RealtimeProviderProps): React.ReactElement {
  const { status: authStatus, session } = useAuth();
  const service = getRealtimeService();
  const [status, setStatus] = useState<ConnectionStatus>(service.getStatus());

  // Track connection status across all reconnects.
  useEffect(() => {
    const unsubscribe = service.subscribeStatus((next) => {
      setStatus(next);
    });
    return () => {
      unsubscribe();
    };
  }, [service]);

  // Lifecycle: connect on auth, disconnect on logout.
  useEffect(() => {
    if (authStatus !== 'authenticated' || !session?.tokens.accessToken) {
      service.disconnect();
      return undefined;
    }
    try {
      service.connect(session.tokens.accessToken);
    } catch (err) {
      logger.error('connect_failed', {
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
    return () => {
      // Don't disconnect on unmount of provider — only on auth change.
    };
  }, [authStatus, session?.tokens.accessToken, service]);

  // Final teardown when provider unmounts (e.g. app shutdown).
  useEffect(() => {
    return () => {
      service.disconnect();
    };
  }, [service]);

  const subscribe = useCallback<RealtimeContextValue['subscribe']>(
    (event, handler) => service.subscribe(event, handler),
    [service],
  );

  const emit = useCallback(
    (event: string, payload: unknown) => service.emit(event, payload),
    [service],
  );

  const value = useMemo<RealtimeContextValue>(
    () => ({ status, subscribe, emit }),
    [status, subscribe, emit],
  );

  return (
    <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error('useRealtime must be used inside <RealtimeProvider>');
  }
  return ctx;
}

/**
 * Convenience hook: subscribe to a single realtime event for the
 * lifetime of the calling component.
 */
export function useRealtimeEvent<E extends RealtimeEventName>(
  event: E,
  handler: (payload: RealtimeEventPayload<E>) => void,
): void {
  const { subscribe } = useRealtime();
  useEffect(() => {
    const unsubscribe = subscribe(event, handler);
    return () => {
      unsubscribe();
    };
  }, [event, handler, subscribe]);
}
