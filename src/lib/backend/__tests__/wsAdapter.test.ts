import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createWebSocketAdapter, type WebSocketLike } from '@/lib/backend/wsAdapter';
import { AREAS } from '@/lib/areas';
import type { BackendStateUpdate } from '@/lib/backend/payload';
import type { AreaSnapshot } from '@/lib/types';

class FakeSocket implements WebSocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  closeCalls = 0;

  close() {
    this.closeCalls += 1;
  }
}

function createFakeSocketFactory() {
  const sockets: FakeSocket[] = [];
  const factory = (_url: string): WebSocketLike => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  };
  return { factory, sockets };
}

function makeStateUpdate(): BackendStateUpdate {
  const areas = AREAS.map((areaDef) => ({
    area_id: areaDef.id,
    area_name: areaDef.name,
    online: true,
    metrics: Object.fromEntries(
      areaDef.metrics.map((m) => [
        m.id,
        {
          label: m.label,
          unit: m.unit,
          decimals: m.decimals,
          value: 1,
          alarm: false,
          alarm_description: null,
        },
      ])
    ),
    alarms: [] as unknown[],
  }));
  return { type: 'STATE_UPDATE', timestamp: '2026-01-01T00:00:00.000Z', areas };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createWebSocketAdapter', () => {
  test('emituje poprawnie zmapowane snapshoty po odebraniu poprawnej wiadomości', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory, jitter: () => 1 });

    const unsubscribe = adapter.subscribe(listener);
    sockets[0].onmessage?.({ data: JSON.stringify(makeStateUpdate()) });

    expect(listener).toHaveBeenCalledTimes(1);
    const snapshots = listener.mock.calls[0][0] as AreaSnapshot[];
    expect(snapshots).toHaveLength(AREAS.length);
    expect(snapshots[0].isOnline).toBe(true);

    unsubscribe();
  });

  test('ignoruje niepoprawny JSON bez rzucania wyjątku i bez emisji', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory });

    const unsubscribe = adapter.subscribe(listener);
    expect(() => sockets[0].onmessage?.({ data: '{not json' })).not.toThrow();

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('ignoruje wiadomość, która nie przechodzi isStateUpdate', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory });

    const unsubscribe = adapter.subscribe(listener);
    sockets[0].onmessage?.({ data: JSON.stringify({ foo: 'bar' }) });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('status przechodzi na "live" po pierwszej poprawnej wiadomości', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const onStatus = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory });

    const unsubscribe = adapter.subscribe(listener, onStatus);
    sockets[0].onmessage?.({ data: JSON.stringify(makeStateUpdate()) });

    expect(onStatus).toHaveBeenCalledWith('live');
    unsubscribe();
  });

  test('timeout bezczynności (staleTimeoutMs) przełącza status na "offline" i emituje wszystkie obszary jako offline', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const onStatus = vi.fn();
    const adapter = createWebSocketAdapter({
      socketFactory: factory,
      staleTimeoutMs: 10000,
    });

    const unsubscribe = adapter.subscribe(listener, onStatus);
    sockets[0].onmessage?.({ data: JSON.stringify(makeStateUpdate()) });
    listener.mockClear();
    onStatus.mockClear();

    vi.advanceTimersByTime(10000);

    expect(onStatus).toHaveBeenCalledWith('offline');
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshots = listener.mock.calls[0][0] as AreaSnapshot[];
    expect(snapshots.every((s) => s.isOnline === false)).toBe(true);

    unsubscribe();
  });

  test('reconnect po zamknięciu połączenia stosuje backoff 1s -> 2s -> 4s -> ... z limitem 30s', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const adapter = createWebSocketAdapter({
      socketFactory: factory,
      baseBackoffMs: 1000,
      maxBackoffMs: 30000,
      jitter: () => 1,
    });

    const unsubscribe = adapter.subscribe(listener);
    expect(sockets).toHaveLength(1);

    sockets[0].onclose?.();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    sockets[1].onclose?.();
    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    sockets[2].onclose?.();
    vi.advanceTimersByTime(3999);
    expect(sockets).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(4);

    for (let i = 0; i < 5; i += 1) {
      sockets[sockets.length - 1].onclose?.();
      vi.advanceTimersByTime(30000);
    }
    expect(sockets.length).toBeGreaterThan(4);

    unsubscribe();
  });

  test('licznik backoff resetuje się do 0 po kolejnej udanej wiadomości', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const adapter = createWebSocketAdapter({
      socketFactory: factory,
      baseBackoffMs: 1000,
      jitter: () => 1,
    });

    const unsubscribe = adapter.subscribe(listener);
    sockets[0].onclose?.();
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);

    sockets[1].onmessage?.({ data: JSON.stringify(makeStateUpdate()) });
    sockets[1].onclose?.();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    unsubscribe();
  });

  test('onerror również inicjuje reconnect z backoffem', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const onStatus = vi.fn();
    const adapter = createWebSocketAdapter({
      socketFactory: factory,
      baseBackoffMs: 1000,
      jitter: () => 1,
    });

    const unsubscribe = adapter.subscribe(listener, onStatus);
    sockets[0].onerror?.();

    expect(onStatus).toHaveBeenCalledWith('offline');
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);

    unsubscribe();
  });

  test('unsubscribe zamyka socket i gwarantuje brak dalszych prób reconnect nawet po przewinięciu czasu daleko w przód', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory, baseBackoffMs: 1000 });

    const unsubscribe = adapter.subscribe(listener);
    unsubscribe();

    expect(sockets[0].closeCalls).toBe(1);

    sockets[0].onclose?.();
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(sockets).toHaveLength(1);
  });

  test('unsubscribe wywołane w trakcie oczekującego reconnectu czyści jego timer i nie łączy ponownie', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory, baseBackoffMs: 1000 });

    const unsubscribe = adapter.subscribe(listener);
    sockets[0].onclose?.(); // planuje reconnect za 1s, ale jeszcze się nie wykonał

    unsubscribe();
    vi.advanceTimersByTime(60000);

    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('domyślny socketFactory rzuca czytelny błąd, gdy globalny WebSocket nie istnieje', () => {
    const originalWebSocket = globalThis.WebSocket;
    // @ts-expect-error - celowo usuwamy globalny WebSocket na czas testu
    delete globalThis.WebSocket;

    try {
      const adapter = createWebSocketAdapter();
      expect(() => adapter.subscribe(vi.fn())).toThrow(/WebSocket is not available/);
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  test('powtarzane cykle subscribe/unsubscribe nie zostawiają zawieszonych timerów', () => {
    const { factory } = createFakeSocketFactory();
    const listener = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory });

    for (let i = 0; i < 3; i += 1) {
      const unsubscribe = adapter.subscribe(listener);
      unsubscribe();
    }

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('createWebSocketAdapter — diagnostyka odrzuconych danych', () => {
  /** Awaria z 2026-09 była tak trudna do zdiagnozowania nie dlatego, że
   * dane były złe, tylko dlatego, że odrzucenie było CAŁKOWICIE ciche:
   * backend zdrowy, socket żywy, ekran martwy, konsola pusta. Te testy
   * pilnują, że każda odrzucona/zdegradowana dana zostawia ślad. */

  test('loguje odrzucenie niepoprawnego JSON-a', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const logger = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory, logger });

    const unsubscribe = adapter.subscribe(vi.fn());
    sockets[0].onmessage?.({ data: '{not json' });

    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger.mock.calls[0][0]).toBe('parse');
    unsubscribe();
  });

  test('loguje odrzucenie koperty niezgodnej ze STATE_UPDATE', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const logger = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory, logger });

    const unsubscribe = adapter.subscribe(vi.fn());
    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'PING' }) });

    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger.mock.calls[0][0]).toBe('envelope');
    expect(logger.mock.calls[0][1]).toContain('STATE_UPDATE');
    unsubscribe();
  });

  test('metryka BOOL jako `true` jest logowana, ale NIE gasi wallboardu', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const logger = vi.fn();
    const listener = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory, logger });

    const update = makeStateUpdate();
    const brokenId = AREAS[0].metrics[0].id;
    (update.areas[0].metrics as Record<string, unknown>)[brokenId] = {
      label: 'x',
      unit: '',
      decimals: 0,
      value: true,
      alarm: false,
      alarm_description: null,
    };

    const unsubscribe = adapter.subscribe(listener);
    sockets[0].onmessage?.({ data: JSON.stringify(update) });

    // Kluczowa różnica wobec stanu sprzed naprawy: listener DOSTAJE dane.
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshots = listener.mock.calls[0][0] as AreaSnapshot[];
    expect(snapshots).toHaveLength(AREAS.length);
    expect(snapshots.every((s) => s.isOnline)).toBe(true);

    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger.mock.calls[0][0]).toBe(`metric:${AREAS[0].id}:${brokenId}`);
    expect(logger.mock.calls[0][1]).toContain('boolean');

    unsubscribe();
  });

  test('wadliwa metryka nie wpycha wallboardu w offline po staleTimeout', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const onStatus = vi.fn();
    const adapter = createWebSocketAdapter({
      socketFactory: factory,
      logger: vi.fn(),
      staleTimeoutMs: 10000,
    });

    const update = makeStateUpdate();
    (update.areas[0].metrics as Record<string, unknown>)[AREAS[0].metrics[0].id] = {
      label: 'x',
      unit: '',
      decimals: 0,
      value: true,
      alarm: false,
      alarm_description: null,
    };

    const unsubscribe = adapter.subscribe(vi.fn(), onStatus);
    sockets[0].onmessage?.({ data: JSON.stringify(update) });
    expect(onStatus).toHaveBeenLastCalledWith('live');

    // Backend nadal nadaje co sekundę — watchdog jest resetowany, bo
    // wiadomości znów przechodzą. Wcześniej tu zapadała cisza i po 10s
    // ekran gasł mimo zdrowego połączenia.
    vi.advanceTimersByTime(9000);
    sockets[0].onmessage?.({ data: JSON.stringify(update) });
    vi.advanceTimersByTime(9000);

    expect(onStatus).toHaveBeenLastCalledWith('live');
    expect(onStatus).not.toHaveBeenCalledWith('offline');

    unsubscribe();
  });
});
