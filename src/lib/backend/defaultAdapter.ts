import type { AreasDataAdapter } from '@/hooks/useAreasData';
import { startMockStream } from '@/lib/mock/mockStream';
import { resolveDataSource, resolveWsUrl } from './config';
import { createWebSocketAdapter } from './wsAdapter';

const mockAdapter: AreasDataAdapter = {
  subscribe(listener) {
    const handle = startMockStream(listener);
    return () => handle.stop();
  },
};

let cachedAdapter: AreasDataAdapter | null = null;

/**
 * `useAreasData`'s default data source — resolved once from
 * `NEXT_PUBLIC_DATA_SOURCE`/`NEXT_PUBLIC_WS_URL` (see lib/backend/config.ts)
 * and memoized as a module-level singleton, so the hook's `useEffect`
 * dependency array never churns across re-renders just because nobody
 * passed an explicit adapter.
 */
export function createDefaultAdapter(): AreasDataAdapter {
  if (cachedAdapter) {
    return cachedAdapter;
  }

  const dataSource = resolveDataSource();
  cachedAdapter =
    dataSource === 'mock' ? mockAdapter : createWebSocketAdapter({ url: resolveWsUrl() });

  return cachedAdapter;
}
