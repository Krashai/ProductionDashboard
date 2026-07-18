import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCarousel, ROTATION_TIME_MS } from '@/hooks/useCarousel';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCarousel', () => {
  test('stan początkowy: index 0, isPlaying true, progress 0', () => {
    const { result } = renderHook(() => useCarousel(5));
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.progress).toBe(0);
  });

  test('progress rośnie w trakcie interwału 100ms', () => {
    const { result } = renderHook(() => useCarousel(5));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.progress).toBeGreaterThan(0);
    expect(result.current.currentIndex).toBe(0);
  });

  test('po upływie ROTATION_TIME_MS przechodzi do kolejnego indeksu i resetuje progress', () => {
    const { result } = renderHook(() => useCarousel(5));

    act(() => {
      vi.advanceTimersByTime(ROTATION_TIME_MS);
    });

    expect(result.current.currentIndex).toBe(1);
    expect(result.current.progress).toBe(0);
  });

  test('zawija się na końcu listy (5 obszarów, index 4 -> 0)', () => {
    const { result } = renderHook(() => useCarousel(5));

    act(() => {
      vi.advanceTimersByTime(ROTATION_TIME_MS * 5);
    });

    expect(result.current.currentIndex).toBe(0);
  });

  test('togglePlay z playing->paused zatrzymuje dalsze auto-advance', () => {
    const { result } = renderHook(() => useCarousel(5));

    act(() => {
      result.current.togglePlay();
    });
    expect(result.current.isPlaying).toBe(false);

    act(() => {
      vi.advanceTimersByTime(ROTATION_TIME_MS * 2);
    });
    expect(result.current.currentIndex).toBe(0);
  });

  test('togglePlay z paused->playing wznawia auto-advance i resetuje progress', () => {
    const { result } = renderHook(() => useCarousel(5));

    act(() => {
      result.current.togglePlay(); // pause
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      result.current.togglePlay(); // resume
    });
    expect(result.current.progress).toBe(0);

    act(() => {
      vi.advanceTimersByTime(ROTATION_TIME_MS);
    });
    expect(result.current.currentIndex).toBe(1);
  });

  test('selectIndex ustawia indeks ręcznie i resetuje progress', () => {
    const { result } = renderHook(() => useCarousel(5));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.progress).toBeGreaterThan(0);

    act(() => {
      result.current.selectIndex(3);
    });

    expect(result.current.currentIndex).toBe(3);
    expect(result.current.progress).toBe(0);
  });

  test('itemCount===0 nie crashuje i nie uruchamia rotacji', () => {
    const { result } = renderHook(() => useCarousel(0));

    act(() => {
      vi.advanceTimersByTime(ROTATION_TIME_MS * 2);
    });

    expect(result.current.currentIndex).toBe(0);
  });

  test('enabled=false wyłącza rotację niezależnie od isPlaying (np. tryb pinned)', () => {
    const { result } = renderHook(() => useCarousel(5, { enabled: false }));

    act(() => {
      vi.advanceTimersByTime(ROTATION_TIME_MS * 3);
    });

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.progress).toBe(0);
  });

  test('respektuje niestandardowy rotationTimeMs', () => {
    const { result } = renderHook(() => useCarousel(5, { rotationTimeMs: 2000 }));

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.currentIndex).toBe(1);
  });
});
