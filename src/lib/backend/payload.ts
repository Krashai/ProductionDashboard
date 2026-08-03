/**
 * Wire types for the backend's `/ws` broadcast, confirmed against
 * `backend/app/plc/broadcaster.py` (envelope: `{type: 'STATE_UPDATE',
 * timestamp, areas}`) and `backend/app/plc/aggregator.py::build_area_payload`
 * (per-area shape: `area_id`, `area_name`, `online`, `metrics`, `alarms`).
 *
 * `isStateUpdate` is a real runtime type guard — the socket is
 * unauthenticated and untrusted, so nothing from it is assumed valid
 * without checking first.
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
  metrics: Record<string, BackendMetric>;
  alarms: unknown[];
}

export interface BackendStateUpdate {
  type: 'STATE_UPDATE';
  timestamp: string;
  areas: BackendArea[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBackendMetric(value: unknown): value is BackendMetric {
  if (!isRecord(value)) return false;
  if (typeof value.label !== 'string') return false;
  if (typeof value.unit !== 'string') return false;
  if (typeof value.decimals !== 'number') return false;
  if (value.value !== null && typeof value.value !== 'number') return false;
  if (typeof value.alarm !== 'boolean') return false;
  if (value.alarm_description !== null && typeof value.alarm_description !== 'string') {
    return false;
  }
  return true;
}

function isBackendArea(value: unknown): value is BackendArea {
  if (!isRecord(value)) return false;
  if (typeof value.area_id !== 'string') return false;
  if (typeof value.area_name !== 'string') return false;
  if (typeof value.online !== 'boolean') return false;
  if (!isRecord(value.metrics)) return false;
  if (!Array.isArray(value.alarms)) return false;
  return Object.values(value.metrics).every(isBackendMetric);
}

export function isStateUpdate(value: unknown): value is BackendStateUpdate {
  if (!isRecord(value)) return false;
  if (value.type !== 'STATE_UPDATE') return false;
  if (typeof value.timestamp !== 'string') return false;
  if (!Array.isArray(value.areas)) return false;
  return value.areas.every(isBackendArea);
}
