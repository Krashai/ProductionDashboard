'use client';

import { useEffect, useState } from 'react';
import { createDefaultAdapter } from '@/lib/backend/defaultAdapter';
import type { AreaSnapshot } from '@/lib/types';

export type ConnectionStatus = 'connecting' | 'live' | 'offline';

export interface UseAreasDataResult {
  areas: AreaSnapshot[];
  status: ConnectionStatus;
  lastEventAt: Date | null;
}

/**
 * Adapter źródła danych — jedyna granica, którą Faza 5 podmienia (mock →
 * WebSocket), żeby zrealizować decyzję #18 z Concept.md bez zmian w UI/hooku.
 * `onStatus` jest opcjonalny (drugi argument), więc istniejące adaptery,
 * które go ignorują (np. mock), zachowują pełną kompatybilność wsteczną.
 */
export interface AreasDataAdapter {
  subscribe(
    listener: (snapshots: AreaSnapshot[]) => void,
    onStatus?: (status: ConnectionStatus) => void
  ): () => void;
}

export function useAreasData(
  adapter: AreasDataAdapter = createDefaultAdapter()
): UseAreasDataResult {
  const [areas, setAreas] = useState<AreaSnapshot[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  useEffect(() => {
    const unsubscribe = adapter.subscribe(
      (snapshots) => {
        setAreas(snapshots);
        setStatus('live');
        setLastEventAt(new Date());
      },
      (nextStatus) => {
        setStatus(nextStatus);
      }
    );

    return unsubscribe;
  }, [adapter]);

  return { areas, status, lastEventAt };
}
