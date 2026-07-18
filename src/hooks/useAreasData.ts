'use client';

import { useEffect, useState } from 'react';
import { startMockStream } from '@/lib/mock/mockStream';
import type { AreaSnapshot } from '@/lib/types';

export type ConnectionStatus = 'connecting' | 'live' | 'offline';

export interface UseAreasDataResult {
  areas: AreaSnapshot[];
  status: ConnectionStatus;
  lastEventAt: Date | null;
}

/**
 * Adapter źródła danych — jedyna granica, którą Faza 5 musi podmienić (mock
 * → SSE), żeby zrealizować decyzję #18 z Concept.md bez zmian w UI/hooku.
 */
export interface AreasDataAdapter {
  subscribe(listener: (snapshots: AreaSnapshot[]) => void): () => void;
}

const mockAdapter: AreasDataAdapter = {
  subscribe(listener) {
    const handle = startMockStream(listener);
    return () => handle.stop();
  },
};

export function useAreasData(adapter: AreasDataAdapter = mockAdapter): UseAreasDataResult {
  const [areas, setAreas] = useState<AreaSnapshot[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  useEffect(() => {
    const unsubscribe = adapter.subscribe((snapshots) => {
      setAreas(snapshots);
      setStatus('live');
      setLastEventAt(new Date());
    });

    return unsubscribe;
  }, [adapter]);

  return { areas, status, lastEventAt };
}
