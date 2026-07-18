import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAreasData, type AreasDataAdapter } from '@/hooks/useAreasData';
import { AREAS } from '@/lib/areas';
import { DEFAULT_INTERVAL_MS } from '@/lib/mock/mockStream';
import type { AreaSnapshot } from '@/lib/types';

function makeSnapshot(id: string): AreaSnapshot {
  return {
    id,
    name: id,
    type: 'power',
    metrics: [],
    lastSeenAt: null,
    isOnline: true,
  };
}

// Adapter testowy: nie emituje nic automatycznie, żeby móc jawnie sterować
// momentem "przyjścia zdarzenia" niezależnie od interwału mocka.
function createControlledAdapter() {
  let capturedListener: ((snapshots: AreaSnapshot[]) => void) | null = null;
  const unsubscribe = vi.fn();

  const adapter: AreasDataAdapter = {
    subscribe(listener) {
      capturedListener = listener;
      return unsubscribe;
    },
  };

  return {
    adapter,
    unsubscribe,
    emit: (snapshots: AreaSnapshot[]) => {
      act(() => {
        capturedListener?.(snapshots);
      });
    },
  };
}

describe('useAreasData', () => {
  test('stan początkowy: brak obszarów, status "connecting", brak lastEventAt', () => {
    const { adapter } = createControlledAdapter();
    const { result } = renderHook(() => useAreasData(adapter));

    expect(result.current.areas).toEqual([]);
    expect(result.current.status).toBe('connecting');
    expect(result.current.lastEventAt).toBeNull();
  });

  test('po emisji zdarzenia: areas, status "live" i lastEventAt są zaktualizowane', () => {
    const { adapter, emit } = createControlledAdapter();
    const { result } = renderHook(() => useAreasData(adapter));

    const snapshots = [makeSnapshot('a'), makeSnapshot('b')];
    emit(snapshots);

    expect(result.current.areas).toEqual(snapshots);
    expect(result.current.status).toBe('live');
    expect(result.current.lastEventAt).toBeInstanceOf(Date);
  });

  test('kolejne emisje aktualizują areas i przesuwają lastEventAt', () => {
    const { adapter, emit } = createControlledAdapter();
    const { result } = renderHook(() => useAreasData(adapter));

    emit([makeSnapshot('a')]);
    const firstEventAt = result.current.lastEventAt;

    emit([makeSnapshot('a'), makeSnapshot('b')]);
    expect(result.current.areas).toHaveLength(2);
    expect(result.current.lastEventAt).not.toBe(firstEventAt);
  });

  test('odsubskrybowuje adapter przy odmontowaniu', () => {
    const { adapter, unsubscribe } = createControlledAdapter();
    const { unmount } = renderHook(() => useAreasData(adapter));

    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  describe('domyślny adapter (mock stream) z fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test('bez podanego adaptera korzysta z domyślnego mock streamu dla wszystkich obszarów', () => {
      const { result, unmount } = renderHook(() => useAreasData());

      expect(result.current.status).toBe('live');
      expect(result.current.areas).toHaveLength(AREAS.length);

      unmount();
    });

    test('emituje kolejne aktualizacje w kadencji mock streamu (DEFAULT_INTERVAL_MS)', () => {
      const { result, unmount } = renderHook(() => useAreasData());

      const firstAreasRef = result.current.areas;
      const firstEventAt = result.current.lastEventAt;

      act(() => {
        vi.advanceTimersByTime(DEFAULT_INTERVAL_MS);
      });

      expect(result.current.areas).not.toBe(firstAreasRef);
      expect(result.current.lastEventAt).not.toBe(firstEventAt);

      unmount();
    });
  });
});
