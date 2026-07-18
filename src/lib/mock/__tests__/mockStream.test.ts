import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { startMockStream, DEFAULT_INTERVAL_MS } from '@/lib/mock/mockStream';
import { AREAS } from '@/lib/areas';
import type { AreaSnapshot } from '@/lib/types';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startMockStream', () => {
  test('emituje snapshot dla wszystkich obszarów natychmiast po starcie', () => {
    const listener = vi.fn();
    const handle = startMockStream(listener, { random: Math.random });

    expect(listener).toHaveBeenCalledTimes(1);
    const firstCallArg = listener.mock.calls[0][0] as AreaSnapshot[];
    expect(firstCallArg).toHaveLength(AREAS.length);

    handle.stop();
  });

  test('emituje kolejny snapshot po upływie interwału (domyślnie DEFAULT_INTERVAL_MS)', () => {
    const listener = vi.fn();
    const handle = startMockStream(listener, { random: Math.random });

    vi.advanceTimersByTime(DEFAULT_INTERVAL_MS);
    expect(listener).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(DEFAULT_INTERVAL_MS);
    expect(listener).toHaveBeenCalledTimes(3);

    handle.stop();
  });

  test('respektuje niestandardowy intervalMs', () => {
    const listener = vi.fn();
    const handle = startMockStream(listener, { random: Math.random, intervalMs: 1000 });

    vi.advanceTimersByTime(999);
    expect(listener).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  test('stop() zatrzymuje dalsze emisje', () => {
    const listener = vi.fn();
    const handle = startMockStream(listener, { random: Math.random });

    handle.stop();
    vi.advanceTimersByTime(DEFAULT_INTERVAL_MS * 5);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('kolejne emisje kontynuują historię metryk (nie resetują jej za każdym razem)', () => {
    const listener = vi.fn();
    const handle = startMockStream(listener, { random: Math.random });

    vi.advanceTimersByTime(DEFAULT_INTERVAL_MS);

    const first = listener.mock.calls[0][0] as AreaSnapshot[];
    const second = listener.mock.calls[1][0] as AreaSnapshot[];

    const firstMetric = first[0].metrics[0];
    const secondMetric = second[0].metrics[0];
    expect(secondMetric.history.length).toBe(firstMetric.history.length + 1);

    handle.stop();
  });

  test('przyjmuje niestandardowy zestaw obszarów zamiast domyślnego rejestru', () => {
    const listener = vi.fn();
    const customAreas = [AREAS[0]];
    const handle = startMockStream(listener, { random: Math.random, areas: customAreas });

    const firstCallArg = listener.mock.calls[0][0] as AreaSnapshot[];
    expect(firstCallArg).toHaveLength(1);
    expect(firstCallArg[0].id).toBe(customAreas[0].id);

    handle.stop();
  });
});
