import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNow } from '@/hooks/useNow';

const T0 = new Date('2026-10-26T10:00:00.000Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useNow', () => {
  test('zwraca bieżący czas klienta', () => {
    const { result } = renderHook(() => useNow(false));

    expect(result.current).toBe(T0);
  });

  test('gdy isTicking=true, odświeża czas co sekundę', () => {
    const { result } = renderHook(() => useNow(true));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(T0 + 1000);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(T0 + 4000);
  });

  test('szanuje własny interwał', () => {
    const { result } = renderHook(() => useNow(true, 250));

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(T0 + 250);
  });

  test('gdy isTicking=false, nie ustawia żadnego timera (kiosk w stanie live nie renderuje się co sekundę)', () => {
    renderHook(() => useNow(false));

    expect(vi.getTimerCount()).toBe(0);
  });

  test('start tickowania od razu podaje świeży czas, a nie wartość sprzed godzin ciszy', () => {
    const { result, rerender } = renderHook(({ ticking }) => useNow(ticking), {
      initialProps: { ticking: false },
    });
    expect(result.current).toBe(T0);

    // Godzina bez żadnego renderu (stan "live"), potem utrata danych.
    vi.setSystemTime(T0 + 3_600_000);
    rerender({ ticking: true });

    expect(result.current).toBe(T0 + 3_600_000);
  });

  test('koniec tickowania robi jedno końcowe odświeżenie i zatrzymuje timer', () => {
    const { result, rerender } = renderHook(({ ticking }) => useNow(ticking), {
      initialProps: { ticking: true },
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    vi.setSystemTime(T0 + 2500);
    rerender({ ticking: false });

    expect(result.current).toBe(T0 + 2500);
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe(T0 + 2500);
  });

  test('odmontowanie czyści timer', () => {
    const { unmount } = renderHook(() => useNow(true));

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
