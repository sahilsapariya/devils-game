/**
 * Hook to expose the currently active local round and keep it in sync
 * with backend pushes (round:started / round:ended).
 */
import { useCallback, useEffect, useState } from 'react';

import type { LocalRound } from '../db/repositories/rounds.repo';
import { fetchCurrentRound, getActiveRound } from '../services/round.service';
import { useRealtimeEvent } from '../store/realtime.context';

export function useActiveRound(): {
  round: LocalRound | null;
  refresh: () => Promise<void>;
} {
  const [round, setRound] = useState<LocalRound | null>(null);

  const refresh = useCallback(async () => {
    const local = await getActiveRound();
    setRound(local);
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
      // Fetch from backend in the background.
      const fromRemote = await fetchCurrentRound();
      if (fromRemote) setRound(fromRemote);
    })();
  }, [refresh]);

  useRealtimeEvent('round:started', () => {
    void refresh();
  });
  useRealtimeEvent('round:ended', () => {
    void refresh();
  });

  return { round, refresh };
}
