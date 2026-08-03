import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const ENV_KEY = 'NEXT_PUBLIC_DATA_SOURCE';

describe('createDefaultAdapter', () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env[ENV_KEY];
    vi.resetModules();
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalValue;
    }
    vi.resetModules();
  });

  test('zwraca adapter mockowy, gdy źródło danych to "mock"', async () => {
    process.env[ENV_KEY] = 'mock';
    const { createDefaultAdapter } = await import('@/lib/backend/defaultAdapter');

    const adapter = createDefaultAdapter();
    const listener = vi.fn();
    const unsubscribe = adapter.subscribe(listener);

    // Mock stream emituje natychmiast po subskrypcji.
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('zwraca adapter WebSocket, gdy źródło danych to "ws" (nie emituje synchronicznie jak mock)', async () => {
    process.env[ENV_KEY] = 'ws';
    const { createDefaultAdapter } = await import('@/lib/backend/defaultAdapter');

    const adapter = createDefaultAdapter();
    const listener = vi.fn();
    // Unlike the mock stream (synchronous first tick), a WS adapter only
    // emits once a message actually arrives over the (here: real, unopened)
    // socket — so nothing should have been delivered synchronously.
    const unsubscribe = adapter.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('zwraca ten sam (memoizowany) adapter przy kolejnych wywołaniach', async () => {
    process.env[ENV_KEY] = 'mock';
    const { createDefaultAdapter } = await import('@/lib/backend/defaultAdapter');

    expect(createDefaultAdapter()).toBe(createDefaultAdapter());
  });
});
