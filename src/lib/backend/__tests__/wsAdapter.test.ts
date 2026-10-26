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
          online: true,
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
  test('bez jawnego url łączy się same-origin z adresem strony (wyliczanym przy połączeniu)', () => {
    const urls: string[] = [];
    const adapter = createWebSocketAdapter({
      socketFactory: (url) => {
        urls.push(url);
        return new FakeSocket();
      },
    });

    const unsubscribe = adapter.subscribe(() => {});

    // jsdom: http://localhost:3000, testy nie ustawiają basePath.
    expect(urls).toEqual(['ws://localhost:3000/ws']);
    unsubscribe();
  });

  test('jawny url ma pierwszeństwo przed adresem wyliczonym ze strony', () => {
    const urls: string[] = [];
    const adapter = createWebSocketAdapter({
      url: 'ws://example.test/ws',
      socketFactory: (url) => {
        urls.push(url);
        return new FakeSocket();
      },
    });

    const unsubscribe = adapter.subscribe(() => {});

    expect(urls).toEqual(['ws://example.test/ws']);
    unsubscribe();
  });

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

describe('createWebSocketAdapter — utrata danych i odzyskiwanie połączenia', () => {
  const T0 = new Date('2026-10-26T10:00:00.000Z').getTime();

  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  }

  afterEach(() => {
    setVisibility('visible');
  });

  test('ramka dostaje lastFreshAt z wstrzykniętego zegara `now`', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory, now: () => 424242 });

    const unsubscribe = adapter.subscribe(listener);
    sockets[0].onmessage?.({ data: JSON.stringify(makeStateUpdate()) });

    const snapshots = listener.mock.calls[0][0] as AreaSnapshot[];
    expect(snapshots.every((s) => s.lastFreshAt === 424242)).toBe(true);
    unsubscribe();
  });

  test('zamknięcie połączenia emituje ostatnie snapshoty jako offline (z wartościami i lastFreshAt), ZANIM zgłosi status offline', () => {
    vi.setSystemTime(T0);
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const onStatus = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory });

    const unsubscribe = adapter.subscribe(listener, onStatus);
    sockets[0].onmessage?.({ data: JSON.stringify(makeStateUpdate()) });
    listener.mockClear();
    onStatus.mockClear();

    vi.setSystemTime(T0 + 5000);
    sockets[0].onclose?.();

    expect(listener).toHaveBeenCalledTimes(1);
    const snapshots = listener.mock.calls[0][0] as AreaSnapshot[];
    expect(snapshots.every((s) => !s.isOnline)).toBe(true);
    expect(snapshots.every((s) => s.lastFreshAt === T0)).toBe(true);
    expect(snapshots[0].metrics.every((m) => m.value === 1 && m.online === false)).toBe(true);
    expect(onStatus).toHaveBeenCalledWith('offline');
    expect(listener.mock.invocationCallOrder[0]).toBeLessThan(onStatus.mock.invocationCallOrder[0]);
    unsubscribe();
  });

  test('zamknięcie połączenia przed pierwszą ramką tylko zgłasza offline (nie ma czego emitować)', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const onStatus = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory });

    const unsubscribe = adapter.subscribe(listener, onStatus);
    sockets[0].onclose?.();

    expect(listener).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('offline');
    unsubscribe();
  });

  test('onerror i następujące po nim onclose emitują offline tylko raz', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory });

    const unsubscribe = adapter.subscribe(listener);
    sockets[0].onmessage?.({ data: JSON.stringify(makeStateUpdate()) });
    listener.mockClear();

    // Przeglądarka odpala najpierw error, potem close tego samego gniazda.
    sockets[0].onerror?.();
    sockets[0].onclose?.();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('lastFreshAt przeżywa cykle reconnectu — kolejne zerwanie bez ramek nie zeruje ani nie odświeża znacznika', () => {
    vi.setSystemTime(T0);
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const adapter = createWebSocketAdapter({
      socketFactory: factory,
      baseBackoffMs: 1000,
      jitter: () => 1,
      staleTimeoutMs: 60000,
    });

    const unsubscribe = adapter.subscribe(listener);
    sockets[0].onmessage?.({ data: JSON.stringify(makeStateUpdate()) });
    sockets[0].onclose?.();
    vi.advanceTimersByTime(1000); // reconnect → sockets[1], bez żadnej ramki
    listener.mockClear();

    sockets[1].onclose?.();

    const snapshots = listener.mock.calls[0][0] as AreaSnapshot[];
    expect(snapshots.every((s) => s.lastFreshAt === T0)).toBe(true);
    unsubscribe();
  });

  test('po reconnecie pierwsza ramka odświeża lastFreshAt', () => {
    vi.setSystemTime(T0);
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const adapter = createWebSocketAdapter({ socketFactory: factory, baseBackoffMs: 1000, jitter: () => 1 });

    const unsubscribe = adapter.subscribe(listener);
    sockets[0].onmessage?.({ data: JSON.stringify(makeStateUpdate()) });
    sockets[0].onclose?.();
    vi.setSystemTime(T0 + 30000);
    vi.advanceTimersByTime(1000);
    sockets[1].onmessage?.({ data: JSON.stringify(makeStateUpdate()) });

    const snapshots = listener.mock.lastCall![0] as AreaSnapshot[];
    expect(snapshots.every((s) => s.isOnline && s.lastFreshAt === T0 + 31000)).toBe(true);
    unsubscribe();
  });

  test('watchdog zatrzymanego połączenia zamyka gniazdo (bez podwójnego zdarzenia) i planuje reconnect (P4)', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const listener = vi.fn();
    const onStatus = vi.fn();
    const adapter = createWebSocketAdapter({
      socketFactory: factory,
      staleTimeoutMs: 10000,
      baseBackoffMs: 1000,
      jitter: () => 1,
    });

    const unsubscribe = adapter.subscribe(listener, onStatus);
    sockets[0].onmessage?.({ data: JSON.stringify(makeStateUpdate()) });
    listener.mockClear();

    vi.advanceTimersByTime(10000);

    expect(sockets[0].closeCalls).toBe(1);
    // Handlery odpięte PRZED close() — inaczej onclose zadziałałoby drugi raz.
    expect(sockets[0].onclose).toBeNull();
    expect(sockets[0].onerror).toBeNull();
    expect(sockets[0].onmessage).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith('offline');
    expect(sockets).toHaveLength(1);

    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    unsubscribe();
  });

  test('zdarzenie `online` przeglądarki przerywa backoff i łączy od razu, gdy nie jesteśmy live', () => {
    const { factory, sockets } = createFakeSocketFactory();
    // Długi staleTimeout, żeby watchdog nowego gniazda nie wpadł w okno testu.
    const adapter = createWebSocketAdapter({
      socketFactory: factory,
      baseBackoffMs: 30000,
      staleTimeoutMs: 120000,
      jitter: () => 1,
    });

    const unsubscribe = adapter.subscribe(vi.fn());
    sockets[0].onclose?.(); // backoff 30 s
    expect(sockets).toHaveLength(1);

    window.dispatchEvent(new Event('online'));

    expect(sockets).toHaveLength(2);
    // Stary timer backoffu został skasowany — nie ma trzeciego gniazda.
    vi.advanceTimersByTime(60000);
    expect(sockets).toHaveLength(2);
    unsubscribe();
  });

  test('zdarzenie `online` nic nie robi, gdy połączenie jest żywe', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const adapter = createWebSocketAdapter({ socketFactory: factory });

    const unsubscribe = adapter.subscribe(vi.fn());
    sockets[0].onmessage?.({ data: JSON.stringify(makeStateUpdate()) });

    window.dispatchEvent(new Event('online'));

    expect(sockets).toHaveLength(1);
    expect(sockets[0].closeCalls).toBe(0);
    unsubscribe();
  });

  test('powrót karty na pierwszy plan (visibilitychange → visible) łączy od razu, gdy nie jesteśmy live', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const adapter = createWebSocketAdapter({ socketFactory: factory, baseBackoffMs: 30000, jitter: () => 1 });

    const unsubscribe = adapter.subscribe(vi.fn());
    sockets[0].onclose?.();

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sockets).toHaveLength(1);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sockets).toHaveLength(2);
    unsubscribe();
  });

  test('po unsubscribe zdarzenia `online` i visibilitychange nie łączą ponownie', () => {
    const { factory, sockets } = createFakeSocketFactory();
    const adapter = createWebSocketAdapter({ socketFactory: factory, baseBackoffMs: 30000, jitter: () => 1 });

    const unsubscribe = adapter.subscribe(vi.fn());
    sockets[0].onclose?.();
    unsubscribe();

    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(sockets).toHaveLength(1);
  });

  test('unsubscribe zdejmuje oba nasłuchy z window/document', () => {
    const { factory } = createFakeSocketFactory();
    const windowRemove = vi.spyOn(window, 'removeEventListener');
    const documentRemove = vi.spyOn(document, 'removeEventListener');
    const adapter = createWebSocketAdapter({ socketFactory: factory });

    adapter.subscribe(vi.fn())();

    expect(windowRemove).toHaveBeenCalledWith('online', expect.any(Function));
    expect(documentRemove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    windowRemove.mockRestore();
    documentRemove.mockRestore();
  });
});
