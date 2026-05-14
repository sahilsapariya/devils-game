/**
 * Hook to expose the count of unacknowledged consequences in local SQLite.
 * Refreshes on mount, on focus, and whenever a 'consequence:issued'
 * realtime event lands.
 */
import { useCallback, useEffect, useState } from 'react';

import { listLocalConsequences } from '../services/consequences.service';
import { useRealtimeEvent } from '../store/realtime.context';

const REFRESH_INTERVAL_MS = 30_000;

export function useUnacknowledgedConsequences(): {
  count: number;
  refresh: () => Promise<void>;
} {
  const [count, setCount] = useState<number>(0);

  const refresh = useCallback(async () => {
    const items = await listLocalConsequences();
    setCount(items.length);
  }, []);

  useEffect(() => {
    void refresh();
    const handle = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [refresh]);

  useRealtimeEvent('consequence:issued', () => {
    void refresh();
  });

  return { count, refresh };
}
