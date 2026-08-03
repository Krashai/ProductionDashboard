/**
 * Config seam (Faza 5, A0): resolves the two `NEXT_PUBLIC_*` env vars that
 * pick the areas data source at runtime — real WS backend vs. the local
 * mock stream. Kept deliberately dumb (no throwing, always a safe default)
 * so a missing/misconfigured env never breaks the wallboard render.
 *
 * `process.env.NEXT_PUBLIC_*` is read as a literal static member access in
 * each function's default parameter (never a computed/bracketed key) so
 * Next.js's build-time inlining of `NEXT_PUBLIC_*` vars keeps working for
 * real app usage; tests bypass this entirely by passing an explicit `env`
 * object instead of relying on `process.env`.
 */

export type DataSource = 'ws' | 'mock';

export const DEFAULT_DATA_SOURCE: DataSource = 'ws';
export const DEFAULT_WS_URL = 'ws://localhost:8001/ws';

export interface DataSourceEnv {
  NEXT_PUBLIC_DATA_SOURCE?: string;
}

export interface WsUrlEnv {
  NEXT_PUBLIC_WS_URL?: string;
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

export function resolveWsUrl(
  env: WsUrlEnv = { NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL }
): string {
  const raw = env.NEXT_PUBLIC_WS_URL;

  if (raw === undefined) {
    return DEFAULT_WS_URL;
  }

  if (raw.startsWith('ws://') || raw.startsWith('wss://')) {
    return raw;
  }

  console.warn(
    `[backend/config] Malformed NEXT_PUBLIC_WS_URL value "${raw}" — falling back to "${DEFAULT_WS_URL}".`
  );
  return DEFAULT_WS_URL;
}
