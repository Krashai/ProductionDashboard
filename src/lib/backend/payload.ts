/**
 * Wire types for the backend's `/ws` broadcast, confirmed against
 * `backend/app/plc/broadcaster.py` (envelope: `{type: 'STATE_UPDATE',
 * timestamp, areas}`) and `backend/app/plc/aggregator.py::build_area_payload`
 * (per-area shape: `area_id`, `area_name`, `online`, `metrics`, `alarms`).
 *
 * `isStateUpdate` is a real runtime type guard — the socket is
 * unauthenticated and untrusted, so nothing from it is assumed valid
 * without checking first.
 *
 * Granularity is deliberate and hard-won: `isStateUpdate` validates the
 * ENVELOPE (type, timestamp, the per-area frame), but NOT each individual
 * metric. It used to do both, via `Object.values(metrics).every(...)`
 * nested inside `areas.every(...)`, which meant one malformed metric field
 * rejected the whole broadcast — all five areas — and the wallboard went
 * dark within the 10s staleness timeout. A single BOOL tag serializing as
 * `true` was enough to trigger it.
 *
 * Individual metrics are now validated one at a time by `isBackendMetric`
 * in mapPayload.ts, where a bad one degrades to "no reading" (the previous
 * value is held) while every sound metric on the wallboard keeps updating.
 * Bad data must cost one tile, never the whole screen.
 */

export interface BackendMetric {
  label: string;
  unit: string;
  decimals: number;
  value: number | null;
  alarm: boolean;
  alarm_description: string | null;
}

export interface BackendArea {
  area_id: string;
  area_name: string;
  online: boolean;
  /** Intentionally `unknown` per entry, not `BackendMetric`: the envelope
   * guard only proves this is an object, so each metric must be narrowed
   * individually with `isBackendMetric` at the point of use. Typing it as
   * pre-validated here is exactly the lie that let a boolean through the
   * compiler and into a `number` field. */
  metrics: Record<string, unknown>;
  alarms: unknown[];
}

export interface BackendStateUpdate {
  type: 'STATE_UPDATE';
  timestamp: string;
  areas: BackendArea[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Names the FIRST field that violates the `BackendMetric` contract, or
 * returns null when the metric is sound. Single source of truth for both
 * `isBackendMetric` and the operator-facing diagnostic: a message that
 * blames the wrong field is worse than no message at all, and this runs
 * precisely when someone is trying to work out why a tile went blank.
 *
 * Only `typeof` is ever reported, never the value itself — this data comes
 * off an unauthenticated socket and must not be echoed into the console.
 */
export function metricDefect(value: unknown): string | null {
  if (value === null) return 'metryka: null';
  if (Array.isArray(value)) return 'metryka: array';
  if (!isRecord(value)) return `metryka: ${typeof value}`;
  if (typeof value.label !== 'string') return `label: ${typeof value.label}`;
  if (typeof value.unit !== 'string') return `unit: ${typeof value.unit}`;
  if (typeof value.decimals !== 'number') return `decimals: ${typeof value.decimals}`;
  // `decimals` trafia prosto do `toFixed()` w Counter.tsx, a ta rzuca
  // RangeError poza 0..100 — w aplikacji bez error boundary to znów
  // czarny ekran. Zakres zgodny z walidacją API (db/schemas.py).
  if (!Number.isInteger(value.decimals) || value.decimals < 0 || value.decimals > 6) {
    return `decimals: ${value.decimals}`;
  }
  if (value.value !== null && typeof value.value !== 'number') {
    return `value: ${typeof value.value}`;
  }
  // `JSON.parse('1e400')` daje Infinity, a `typeof Infinity === 'number'`,
  // więc sam typeof tego nie zatrzyma. Infinity w `history` zatruwa trend
  // na 30 próbek i psuje ścieżkę SVG sparkline'a.
  if (value.value !== null && !Number.isFinite(value.value)) {
    return `value: ${value.value}`;
  }
  if (typeof value.alarm !== 'boolean') return `alarm: ${typeof value.alarm}`;
  if (value.alarm_description !== null && typeof value.alarm_description !== 'string') {
    return `alarm_description: ${typeof value.alarm_description}`;
  }
  return null;
}

export function isBackendMetric(value: unknown): value is BackendMetric {
  return metricDefect(value) === null;
}

function isBackendAreaEnvelope(value: unknown): value is BackendArea {
  if (!isRecord(value)) return false;
  if (typeof value.area_id !== 'string') return false;
  if (typeof value.area_name !== 'string') return false;
  if (typeof value.online !== 'boolean') return false;
  if (!isRecord(value.metrics)) return false;
  if (!Array.isArray(value.alarms)) return false;
  // NOT `.every(isBackendMetric)` — see the module docstring. A malformed
  // metric must not invalidate its area, let alone the whole payload.
  return true;
}

export function isStateUpdate(value: unknown): value is BackendStateUpdate {
  if (!isRecord(value)) return false;
  if (value.type !== 'STATE_UPDATE') return false;
  if (typeof value.timestamp !== 'string') return false;
  if (!Array.isArray(value.areas)) return false;
  return value.areas.every(isBackendAreaEnvelope);
}
