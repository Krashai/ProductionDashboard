/**
 * Config seam (Faza 5, A0): resolves where the areas data comes from —
 * real WS backend vs. the local mock stream — and the WS address itself.
 * Kept deliberately dumb (no throwing, always a safe default) so a
 * missing/misconfigured env never breaks the wallboard render.
 *
 * `process.env.NEXT_PUBLIC_*` is read as a literal static member access in
 * each function's default parameter (never a computed/bracketed key) so
 * Next.js's build-time inlining of `NEXT_PUBLIC_*` vars keeps working for
 * real app usage; tests bypass this entirely by passing explicit arguments
 * instead of relying on `process.env`/`window`.
 */

export type DataSource = 'ws' | 'mock';

export const DEFAULT_DATA_SOURCE: DataSource = 'ws';
/**
 * Placeholder used only when there is no `window.location` (SSR, tests).
 * Never dialed in practice: the WS adapter resolves its URL lazily when it
 * connects, which only happens in the browser.
 */
export const FALLBACK_WS_URL = 'ws://localhost:8001/ws';

/** Backend WS route, as exposed same-origin by the Next.js rewrite in next.config.mjs. */
export const WS_PATH = '/ws';

export interface DataSourceEnv {
  NEXT_PUBLIC_DATA_SOURCE?: string;
}

function isDataSource(value: string): value is DataSource {
  return value === 'ws' || value === 'mock';
}

export function resolveDataSource(
  env: DataSourceEnv = { NEXT_PUBLIC_DATA_SOURCE: process.env.NEXT_PUBLIC_DATA_SOURCE }
): DataSource {
  const raw = env.NEXT_PUBLIC_DATA_SOURCE;

  if (raw === undefined) {
    return DEFAULT_DATA_SOURCE;
  }

  if (isDataSource(raw)) {
    return raw;
  }

  console.warn(
    `[backend/config] Unknown NEXT_PUBLIC_DATA_SOURCE value "${raw}" — falling back to "${DEFAULT_DATA_SOURCE}".`
  );
  return DEFAULT_DATA_SOURCE;
}

export interface LocationLike {
  protocol: string;
  host: string;
}

function currentLocation(): LocationLike | null {
  return typeof window === 'undefined' ? null : window.location;
}

/**
 * Same-origin WS address: the browser connects back to whatever host and
 * subpath it loaded the page from, never to a hardcoded IP. That is what
 * lets one build serve both networks —
 *   via the office reverse proxy → ws://10.0.0.211/infrastructure/ws
 *   directly on the OT subnet    → ws://10.10.0.244:3002/infrastructure/ws
 * The first is handled by the proxy exactly as before; the second by the
 * Next.js server itself, which forwards the upgrade to the backend (see the
 * `/ws` rewrite in next.config.mjs).
 *
 * `basePath` comes from `NEXT_PUBLIC_BASE_PATH`, which next.config.mjs
 * derives from the same `BASE_PATH` that sets Next's own basePath — one
 * switch, so the two can't drift apart.
 */
export function resolveWsUrl(
  location: LocationLike | null = currentLocation(),
  basePath: string = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
): string {
  if (location === null) {
    return FALLBACK_WS_URL;
  }

  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const prefix = basePath.replace(/\/+$/, '');
  return `${scheme}//${location.host}${prefix}${WS_PATH}`;
}
