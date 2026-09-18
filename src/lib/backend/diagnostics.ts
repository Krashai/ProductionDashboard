/**
 * Rate-limited diagnostic logging for the WS data path.
 *
 * The backend broadcasts at ~1 Hz, and the failures worth logging here are
 * by nature persistent (a misconfigured tag emits a bad value on every
 * single tick, not once). Logging unconditionally would push thousands of
 * identical lines per hour and bury the first — and only useful —
 * occurrence. Logging nothing is what made the BOOL outage undiagnosable:
 * backend healthy, socket connected, screen dead, console empty.
 *
 * So: log the first occurrence of each distinct problem immediately, then
 * at most once per `intervalMs` for that same key, and say how many
 * repeats were swallowed in between so the reader can tell "happened once"
 * from "happening constantly".
 */

export const DEFAULT_LOG_INTERVAL_MS = 60000;

/**
 * Deduplication identity. Typed rather than a bare `string` so a typo can't
 * silently open a second rate-limit bucket, and so nothing can collide with
 * the `metric:` namespace.
 */
export type LogKey = 'parse' | 'envelope' | `metric:${string}:${string}`;

export type RateLimitedLogger = (key: LogKey, message: string) => void;

export interface CreateRateLimitedLoggerOptions {
  intervalMs?: number;
  /** Injectable for tests; defaults to `console.warn`. */
  sink?: (message: string) => void;
  /** Injectable for tests; defaults to `Date.now`. */
  now?: () => number;
}

interface KeyState {
  lastLoggedAt: number;
  suppressed: number;
}

export function createRateLimitedLogger(
  opts: CreateRateLimitedLoggerOptions = {}
): RateLimitedLogger {
  const intervalMs = opts.intervalMs ?? DEFAULT_LOG_INTERVAL_MS;
  const sink = opts.sink ?? ((message: string) => console.warn(message));
  const now = opts.now ?? (() => Date.now());
  // Bounded by construction: `metric:` keys are built from AREAS (static
  // frontend config), never from socket data. Keep it that way — keying
  // this on a backend-supplied id would turn it into an unbounded map fed
  // by untrusted input on a display that runs for weeks at a time.
  const stateByKey = new Map<LogKey, KeyState>();

  return (key, message) => {
    const timestamp = now();
    const state = stateByKey.get(key);

    if (state !== undefined && timestamp - state.lastLoggedAt < intervalMs) {
      state.suppressed += 1;
      return;
    }

    const suppressedNote =
      state !== undefined && state.suppressed > 0
        ? ` (pominięto ${state.suppressed} powtórzeń w ciągu ostatnich ${intervalMs / 1000}s)`
        : '';
    stateByKey.set(key, { lastLoggedAt: timestamp, suppressed: 0 });
    sink(`[dashboard/ws] ${message}${suppressedNote}`);
  };
}
