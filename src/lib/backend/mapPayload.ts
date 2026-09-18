import { AREAS, type AreaDefinition, type MetricDefinition } from '@/lib/areas';
import type { AreaSnapshot, Metric } from '@/lib/types';
import {
  isBackendMetric,
  metricDefect,
  type BackendArea,
  type BackendMetric,
  type BackendStateUpdate,
} from './payload';

export const DEFAULT_HISTORY_LENGTH = 30;

export interface InvalidMetricReport {
  areaId: string;
  metricId: string;
  /** `typeof` of the offending `value`, or a short reason when the whole
   * metric object is malformed. Enough to identify the culprit without
   * dumping untrusted socket data into the console. */
  reason: string;
}

export interface MapAreasPayloadOptions {
  historyLength?: number;
  /** Called once per metric that failed validation, so the transport layer
   * can log it. The mapper stays pure with respect to its return value —
   * this is a reporting channel, not an escape hatch for mutating state. */
  onInvalidMetric?: (report: InvalidMetricReport) => void;
}

/**
 * Pure mapper: backend `STATE_UPDATE` payload + previous frontend snapshots
 * -> next frontend snapshots. `AREAS` (areas.ts) is authoritative for
 * iteration order/`type`/metric ids — the backend payload is only ever
 * looked up by id, never iterated directly, so an unknown area_id or an
 * extra/renamed metric on the wire can never leak into the UI shape.
 *
 * This is also where each metric is narrowed individually (`isBackendMetric`)
 * rather than trusting the envelope guard: a metric that fails validation is
 * treated exactly like a missing reading — the last known value is held, the
 * rest of the wallboard keeps updating, and `onInvalidMetric` reports it so
 * the failure is loud in the console instead of silent on screen.
 */
export function mapAreasPayload(
  payload: BackendStateUpdate,
  previous: AreaSnapshot[],
  opts: MapAreasPayloadOptions = {}
): AreaSnapshot[] {
  const historyLength = opts.historyLength ?? DEFAULT_HISTORY_LENGTH;
  const backendAreaById = new Map(payload.areas.map((area) => [area.area_id, area]));
  const previousSnapshotById = new Map(previous.map((snapshot) => [snapshot.id, snapshot]));

  return AREAS.map((areaDef) => {
    const backendArea = backendAreaById.get(areaDef.id);
    const previousSnapshot = previousSnapshotById.get(areaDef.id);

    if (!backendArea) {
      return carryForwardOffline(areaDef, previousSnapshot);
    }

    return mapArea(areaDef, backendArea, previousSnapshot, {
      timestamp: payload.timestamp,
      historyLength,
      onInvalidMetric: opts.onInvalidMetric,
    });
  });
}

function carryForwardOffline(
  areaDef: AreaDefinition,
  previousSnapshot: AreaSnapshot | undefined
): AreaSnapshot {
  if (previousSnapshot) {
    return {
      ...previousSnapshot,
      isOnline: false,
      metrics: previousSnapshot.metrics.map((metric) => ({ ...metric })),
    };
  }

  return {
    id: areaDef.id,
    name: areaDef.name,
    type: areaDef.type,
    metrics: areaDef.metrics.map((metricDef) => zeroedMetric(metricDef)),
    lastSeenAt: null,
    isOnline: false,
  };
}

function zeroedMetric(metricDef: MetricDefinition): Metric {
  return {
    id: metricDef.id,
    label: metricDef.label,
    unit: metricDef.unit,
    decimals: metricDef.decimals,
    value: 0,
    history: [],
    alarm: false,
  };
}

/** Narrows one raw entry of `backendArea.metrics`, reporting why it was
 * rejected. Returns `undefined` for both "absent" and "malformed" — the
 * caller treats them identically (hold the last known value), because to
 * the wallboard an unreadable metric and an unsent one mean the same thing. */
function validateMetric(
  raw: unknown,
  areaId: string,
  metricId: string,
  onInvalidMetric: ((report: InvalidMetricReport) => void) | undefined
): BackendMetric | undefined {
  if (raw === undefined) return undefined;
  if (isBackendMetric(raw)) return raw;

  onInvalidMetric?.({ areaId, metricId, reason: metricDefect(raw) ?? 'nieznany' });
  return undefined;
}

interface MapAreaContext {
  timestamp: string;
  historyLength: number;
  onInvalidMetric: ((report: InvalidMetricReport) => void) | undefined;
}

function mapArea(
  areaDef: AreaDefinition,
  backendArea: BackendArea,
  previousSnapshot: AreaSnapshot | undefined,
  ctx: MapAreaContext
): AreaSnapshot {
  const previousMetricById = new Map(
    (previousSnapshot?.metrics ?? []).map((metric) => [metric.id, metric])
  );

  const metrics: Metric[] = areaDef.metrics.map((metricDef) => {
    const backendMetric = validateMetric(
      backendArea.metrics[metricDef.id],
      areaDef.id,
      metricDef.id,
      ctx.onInvalidMetric
    );
    const previousMetric = previousMetricById.get(metricDef.id);
    // Never let a null backend reading (tag not yet polled, PLC offline,
    // etc.) corrupt the trend history — hold the last known value instead.
    const value = backendMetric?.value ?? previousMetric?.value ?? 0;
    // `alarm` must degrade exactly like `value` does. Resetting it to false
    // while the stale reading stays on screen would make an unreadable
    // metric look like a healthy, alarm-free one — the wallboard would
    // quietly drop an ACTIVE alarm and assert everything is fine. Holding
    // both keeps the tile internally consistent: one last known state.
    const alarm = backendMetric?.alarm ?? previousMetric?.alarm ?? false;
    const history = [...(previousMetric?.history ?? []), value].slice(-ctx.historyLength);

    return {
      id: metricDef.id,
      label: backendMetric?.label ?? metricDef.label,
      unit: backendMetric?.unit ?? metricDef.unit,
      decimals: backendMetric?.decimals ?? metricDef.decimals,
      value,
      history,
      alarm,
    };
  });

  return {
    id: areaDef.id,
    name: areaDef.name,
    type: areaDef.type,
    metrics,
    lastSeenAt: ctx.timestamp,
    isOnline: backendArea.online,
  };
}

/** Pure: never mutates `snapshots`, always returns new area + metric objects. */
export function markAllOffline(snapshots: AreaSnapshot[]): AreaSnapshot[] {
  return snapshots.map((snapshot) => ({
    ...snapshot,
    isOnline: false,
    metrics: snapshot.metrics.map((metric) => ({ ...metric })),
  }));
}
