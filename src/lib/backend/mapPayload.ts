import { AREAS, type AreaDefinition, type MetricDefinition } from '@/lib/areas';
import type { AreaSnapshot, Metric } from '@/lib/types';
import type { BackendArea, BackendStateUpdate } from './payload';

export const DEFAULT_HISTORY_LENGTH = 30;

export interface MapAreasPayloadOptions {
  historyLength?: number;
}

/**
 * Pure mapper: backend `STATE_UPDATE` payload + previous frontend snapshots
 * -> next frontend snapshots. `AREAS` (areas.ts) is authoritative for
 * iteration order/`type`/metric ids — the backend payload is only ever
 * looked up by id, never iterated directly, so an unknown area_id or an
 * extra/renamed metric on the wire can never leak into the UI shape.
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

    return mapArea(areaDef, backendArea, previousSnapshot, payload.timestamp, historyLength);
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

function mapArea(
  areaDef: AreaDefinition,
  backendArea: BackendArea,
  previousSnapshot: AreaSnapshot | undefined,
  timestamp: string,
  historyLength: number
): AreaSnapshot {
  const previousMetricById = new Map(
    (previousSnapshot?.metrics ?? []).map((metric) => [metric.id, metric])
  );

  const metrics: Metric[] = areaDef.metrics.map((metricDef) => {
    const backendMetric = backendArea.metrics[metricDef.id];
    const previousMetric = previousMetricById.get(metricDef.id);
    // Never let a null backend reading (tag not yet polled, PLC offline,
    // etc.) corrupt the trend history — hold the last known value instead.
    const value = backendMetric?.value ?? previousMetric?.value ?? 0;
    const history = [...(previousMetric?.history ?? []), value].slice(-historyLength);

    return {
      id: metricDef.id,
      label: backendMetric?.label ?? metricDef.label,
      unit: backendMetric?.unit ?? metricDef.unit,
      decimals: backendMetric?.decimals ?? metricDef.decimals,
      value,
      history,
      alarm: backendMetric?.alarm ?? false,
    };
  });

  return {
    id: areaDef.id,
    name: areaDef.name,
    type: areaDef.type,
    metrics,
    lastSeenAt: timestamp,
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
