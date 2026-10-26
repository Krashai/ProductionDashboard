import type { AreasDataAdapter, ConnectionStatus } from '@/hooks/useAreasData';
import { AREAS } from '@/lib/areas';
import type { AreaSnapshot } from '@/lib/types';
import { resolveWsUrl } from './config';
import { createRateLimitedLogger, type RateLimitedLogger } from './diagnostics';
import { mapAreasPayload, markAllOffline } from './mapPayload';
import { isStateUpdate } from './payload';

/**
 * Minimal injectable subset of the browser `WebSocket` API — lets tests
 * (and any future transport swap) drive the adapter without touching a
 * real socket or real timers.
 */
export interface WebSocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event?: unknown) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  close(): void;
}

export type SocketFactory = (url: string) => WebSocketLike;

export interface CreateWebSocketAdapterOptions {
  url?: string;
  socketFactory?: SocketFactory;
  historyLength?: number;
  /** Ile ms bez wiadomości, zanim adapter uzna połączenie za martwe. */
  staleTimeoutMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  jitter?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  /** Zegar klienta (epoch ms) stemplujący `lastFreshAt` ramek. Wstrzykiwalny
   * dla testów; domyślnie `Date.now`. */
  now?: () => number;
  /** Injectable for tests. Defaults to a console.warn logger rate-limited
   * per distinct problem — see `./diagnostics`. */
  logger?: RateLimitedLogger;
}

const DEFAULT_STALE_TIMEOUT_MS = 10000;
const DEFAULT_BASE_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 30000;
const NO_JITTER = () => 1;

function defaultSocketFactory(url: string): WebSocketLike {
  if (typeof WebSocket === 'undefined') {
    throw new Error('WebSocket is not available in this environment — inject a socketFactory.');
  }
  return new WebSocket(url) as unknown as WebSocketLike;
}

function offlineSnapshots(): AreaSnapshot[] {
  return AREAS.map((areaDef) => ({
    id: areaDef.id,
    name: areaDef.name,
    type: areaDef.type,
    metrics: areaDef.metrics.map((metricDef) => ({
      id: metricDef.id,
      label: metricDef.label,
      unit: metricDef.unit,
      decimals: metricDef.decimals,
      value: 0,
      history: [],
      alarm: false,
    })),
    lastSeenAt: null,
    isOnline: false,
    lastFreshAt: null,
  }));
}

/**
 * Resilient `AreasDataAdapter` backed by the backend's unauthenticated
 * `/ws` broadcast: reconnects with exponential backoff on close/error,
 * and independently detects a silently-stalled connection via a
 * staleness watchdog reset on every valid message.
 */
export function createWebSocketAdapter(
  opts: CreateWebSocketAdapterOptions = {}
): AreasDataAdapter {
  const socketFactory = opts.socketFactory ?? defaultSocketFactory;
  const historyLength = opts.historyLength;
  const staleTimeoutMs = opts.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;
  const baseBackoffMs = opts.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const maxBackoffMs = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const jitter = opts.jitter ?? NO_JITTER;
  const setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout;
  const now = opts.now ?? Date.now;
  const logger = opts.logger ?? createRateLimitedLogger();

  return {
    subscribe(listener, onStatus) {
      let socket: WebSocketLike | null = null;
      let staleTimer: ReturnType<typeof setTimeout> | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let attempt = 0;
      let isTornDown = false;
      // Czy od ostatniego (re)połączenia dotarła choć jedna poprawna ramka.
      // Steruje wyłącznie natychmiastowym reconnectem po powrocie sieci/karty.
      let isLive = false;
      // Żyje przez wszystkie cykle reconnectu i NIGDY nie jest zerowane:
      // `lastFreshAt` obszarów (a z niego wiek danych na ekranie) liczy się od
      // ostatniej ramki, nie od ostatniego połączenia.
      let lastSnapshots: AreaSnapshot[] = [];

      const reportStatus = (status: ConnectionStatus) => onStatus?.(status);

      function clearStaleTimer() {
        if (staleTimer !== null) {
          clearTimeoutFn(staleTimer);
          staleTimer = null;
        }
      }

      function clearReconnectTimer() {
        if (reconnectTimer !== null) {
          clearTimeoutFn(reconnectTimer);
          reconnectTimer = null;
        }
      }

      // Odpina handlery PRZED close(): zamykane przez nas gniazdo odpaliłoby
      // jeszcze `onclose` i drugi raz uruchomiło obsługę rozłączenia (podwójna
      // emisja, podwójny backoff) — albo, gdy zdarzenie spóźni się już po
      // nowym połączeniu, po cichu zepsułoby to nowe.
      function dropSocket() {
        if (!socket) return;
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
        socket = null;
      }

      // Wartości zostają, każdy obszar i metryka dostają offline — to ekran
      // (`areaDataState`) decyduje, jak długo jeszcze je pokazywać. Bez tej
      // emisji (Z1) po zerwaniu WS hook trzymał ostatnie ramki z
      // `isOnline: true` i kafle w ogóle nie wiedziały o awarii.
      function emitOffline(fallbackToEmpty: boolean) {
        if (lastSnapshots.length === 0 && !fallbackToEmpty) return;
        lastSnapshots = markAllOffline(lastSnapshots.length > 0 ? lastSnapshots : offlineSnapshots());
        listener(lastSnapshots);
      }

      function scheduleStaleWatchdog() {
        clearStaleTimer();
        staleTimer = setTimeoutFn(() => {
          staleTimer = null;
          isLive = false;
          emitOffline(true);
          reportStatus('offline');
          // Samo zgłoszenie offline nie wystarczało (P4): gniazdo, które
          // przestało nadawać bez `close`, zostawało otwarte i nic go nie
          // wznawiało — a ekran obiecywałby "Wznawianie połączenia" w
          // nieskończoność.
          dropSocket();
          scheduleReconnect();
        }, staleTimeoutMs);
      }

      function scheduleReconnect() {
        if (isTornDown) return;
        clearReconnectTimer();
        const delay = Math.min(baseBackoffMs * 2 ** attempt, maxBackoffMs) * jitter();
        attempt += 1;
        reconnectTimer = setTimeoutFn(() => {
          reconnectTimer = null;
          if (isTornDown) return;
          connect();
        }, delay);
      }

      function handleDisconnect() {
        if (isTornDown) return;
        clearStaleTimer();
        isLive = false;
        dropSocket();
        emitOffline(false);
        reportStatus('offline');
        scheduleReconnect();
      }

      // Powrót sieci / karty na pierwszy plan: czekanie do 30 s na kolejny
      // krok backoffu jest bez sensu, skoro właśnie wiemy, że warto próbować.
      // Gdy połączenie jest żywe, nie ruszamy go — pilnuje go watchdog.
      function reconnectNow() {
        if (isTornDown || isLive) return;
        clearReconnectTimer();
        clearStaleTimer();
        dropSocket();
        connect();
      }

      function handleVisibilityChange() {
        if (document.visibilityState === 'visible') reconnectNow();
      }

      function handleMessage(event: { data: string }) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          // Silence here is what made the BOOL outage undiagnosable:
          // healthy backend, live socket, dead screen, empty console.
          logger('parse', 'Odrzucono wiadomość WS: nie jest poprawnym JSON-em.');
          return;
        }
        if (!isStateUpdate(parsed)) {
          logger(
            'envelope',
            'Odrzucono wiadomość WS: koperta nie odpowiada kontraktowi STATE_UPDATE ' +
              '(sprawdź type/timestamp/areas). Wallboard przejdzie w offline po ' +
              `${staleTimeoutMs / 1000}s mimo żywego połączenia.`
          );
          return;
        }

        lastSnapshots = mapAreasPayload(parsed, lastSnapshots, {
          // Zegar klienta w chwili odbioru — patrz `AreaSnapshot.lastFreshAt`.
          receivedAt: now(),
          historyLength,
          onInvalidMetric: ({ areaId, metricId, reason }) => {
            // Rate-limited per metric, not globally: two different broken
            // tags are two different problems and both deserve a line.
            logger(
              `metric:${areaId}:${metricId}`,
              `Pominięto metrykę "${metricId}" (obszar ${areaId}) — niezgodna z ` +
                `kontraktem [${reason}]. Kafelek trzyma ostatnią znaną wartość; ` +
                'reszta wallboardu działa normalnie.'
            );
          },
        });
        isLive = true;
        listener(lastSnapshots);
        reportStatus('live');
        attempt = 0;
        scheduleStaleWatchdog();
      }

      function connect() {
        if (isTornDown) return;
        // Resolved per connect, not at creation: the default adapter is built
        // during render, which also runs server-side where there is no
        // window.location to derive a same-origin address from.
        socket = socketFactory(opts.url ?? resolveWsUrl());
        scheduleStaleWatchdog();

        socket.onmessage = handleMessage;
        socket.onclose = handleDisconnect;
        socket.onerror = handleDisconnect;
      }

      // SSR / środowiska bez okna: adapter bywa budowany po stronie serwera.
      const canListenToBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
      if (canListenToBrowser) {
        window.addEventListener('online', reconnectNow);
        document.addEventListener('visibilitychange', handleVisibilityChange);
      }

      connect();

      return () => {
        isTornDown = true;
        clearStaleTimer();
        clearReconnectTimer();
        if (canListenToBrowser) {
          window.removeEventListener('online', reconnectNow);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
        dropSocket();
      };
    },
  };
}
