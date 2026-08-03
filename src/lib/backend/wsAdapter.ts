import type { AreasDataAdapter, ConnectionStatus } from '@/hooks/useAreasData';
import { AREAS } from '@/lib/areas';
import type { AreaSnapshot } from '@/lib/types';
import { resolveWsUrl } from './config';
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
  const url = opts.url ?? resolveWsUrl();
  const socketFactory = opts.socketFactory ?? defaultSocketFactory;
  const historyLength = opts.historyLength;
  const staleTimeoutMs = opts.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;
  const baseBackoffMs = opts.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const maxBackoffMs = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const jitter = opts.jitter ?? NO_JITTER;
  const setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout;

  return {
    subscribe(listener, onStatus) {
      let socket: WebSocketLike | null = null;
      let staleTimer: ReturnType<typeof setTimeout> | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let attempt = 0;
      let isTornDown = false;
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

      function scheduleStaleWatchdog() {
        clearStaleTimer();
        staleTimer = setTimeoutFn(() => {
          lastSnapshots = markAllOffline(
            lastSnapshots.length > 0 ? lastSnapshots : offlineSnapshots()
          );
          listener(lastSnapshots);
          reportStatus('offline');
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
        reportStatus('offline');
        scheduleReconnect();
      }

      function connect() {
        if (isTornDown) return;
        socket = socketFactory(url);
        scheduleStaleWatchdog();

        socket.onmessage = (event) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(event.data);
          } catch {
            return;
          }
          if (!isStateUpdate(parsed)) return;

          lastSnapshots = mapAreasPayload(parsed, lastSnapshots, { historyLength });
          listener(lastSnapshots);
          reportStatus('live');
          attempt = 0;
          scheduleStaleWatchdog();
        };
        socket.onclose = handleDisconnect;
        socket.onerror = handleDisconnect;
      }

      connect();

      return () => {
        isTornDown = true;
        clearStaleTimer();
        clearReconnectTimer();
        if (socket) {
          socket.onopen = null;
          socket.onmessage = null;
          socket.onclose = null;
          socket.onerror = null;
          socket.close();
          socket = null;
        }
      };
    },
  };
}
