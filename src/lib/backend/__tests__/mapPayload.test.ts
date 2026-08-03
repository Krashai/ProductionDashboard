import { describe, expect, test } from 'vitest';
import { mapAreasPayload, markAllOffline } from '@/lib/backend/mapPayload';
import type { BackendArea, BackendMetric, BackendStateUpdate } from '@/lib/backend/payload';
import { AREAS } from '@/lib/areas';
import type { AreaSnapshot } from '@/lib/types';

function makeMetric(overrides: Partial<BackendMetric> = {}): BackendMetric {
  return {
    label: 'Backend label',
    unit: 'X',
    decimals: 2,
    value: 1,
    alarm: false,
    alarm_description: null,
    ...overrides,
  };
}

function makeBackendArea(overrides: Partial<BackendArea> = {}): BackendArea {
  return {
    area_id: 'chlodnia-1',
    area_name: 'Chłodnia 1',
    online: true,
    metrics: {},
    alarms: [],
    ...overrides,
  };
}

function makePayload(areas: BackendArea[], timestamp = '2026-01-01T00:00:00.000Z'): BackendStateUpdate {
  return { type: 'STATE_UPDATE', timestamp, areas };
}

/** Buduje payload z wszystkimi 5 obszarami znanymi z AREAS, z jedną metryką
 * o wartości 1 per metryka (chyba że nadpisane w `perArea`). */
function fullPayload(perArea: Record<string, Partial<BackendArea>> = {}): BackendStateUpdate {
  const areas = AREAS.map((areaDef) => {
    const metrics: Record<string, BackendMetric> = {};
    for (const metricDef of areaDef.metrics) {
      metrics[metricDef.id] = makeMetric();
    }
    return makeBackendArea({
      area_id: areaDef.id,
      area_name: areaDef.name,
      metrics,
      ...perArea[areaDef.id],
    });
  });
  return makePayload(areas);
}

describe('mapAreasPayload', () => {
  test('mapuje wszystkie 5 obszarów z AREAS, w tej samej kolejności i z poprawnym `type`', () => {
    const payload = fullPayload();

    const result = mapAreasPayload(payload, []);

    expect(result).toHaveLength(AREAS.length);
    result.forEach((snapshot, index) => {
      expect(snapshot.id).toBe(AREAS[index].id);
      expect(snapshot.type).toBe(AREAS[index].type);
    });
  });

  test('wartość null z backendu zachowuje ostatnią znaną wartość i nie wpycha null do historii', () => {
    const metricId = AREAS[0].metrics[0].id;
    const previous: AreaSnapshot[] = [
      {
        id: AREAS[0].id,
        name: AREAS[0].name,
        type: AREAS[0].type,
        metrics: AREAS[0].metrics.map((m) => ({
          id: m.id,
          label: m.label,
          unit: m.unit,
          decimals: m.decimals,
          value: m.id === metricId ? 42 : 0,
          history: m.id === metricId ? [40, 41, 42] : [],
          alarm: false,
        })),
        lastSeenAt: '2025-01-01T00:00:00.000Z',
        isOnline: true,
      },
    ];

    const payload = fullPayload({
      [AREAS[0].id]: {
        metrics: {
          ...Object.fromEntries(AREAS[0].metrics.map((m) => [m.id, makeMetric()])),
          [metricId]: makeMetric({ value: null }),
        },
      },
    });

    const result = mapAreasPayload(payload, previous);
    const metric = result[0].metrics.find((m) => m.id === metricId)!;

    expect(metric.value).toBe(42);
    expect(metric.history).toEqual([40, 41, 42, 42]);
    expect(metric.history).not.toContain(null);
  });

  test('historia jest ucinana do skonfigurowanej długości i rośnie poprawnie przy kolejnych wywołaniach', () => {
    const metricId = AREAS[0].metrics[0].id;
    const payload = fullPayload({
      [AREAS[0].id]: {
        metrics: {
          ...Object.fromEntries(AREAS[0].metrics.map((m) => [m.id, makeMetric()])),
          [metricId]: makeMetric({ value: 5 }),
        },
      },
    });

    let previous: AreaSnapshot[] = [];
    for (let i = 0; i < 5; i += 1) {
      previous = mapAreasPayload(payload, previous, { historyLength: 3 });
    }

    const metric = previous[0].metrics.find((m) => m.id === metricId)!;
    expect(metric.history).toEqual([5, 5, 5]);
  });

  test('nieznany area_id w payloadzie jest ignorowany', () => {
    const payload = fullPayload();
    payload.areas.push(
      makeBackendArea({ area_id: 'nieznany-obszar', area_name: 'Nieznany', metrics: {} })
    );

    const result = mapAreasPayload(payload, []);

    expect(result.map((s) => s.id)).toEqual(AREAS.map((a) => a.id));
  });

  test('obszar nieobecny w payloadzie (bez wcześniejszego snapshotu) -> offline z zerowymi wartościami', () => {
    const areas = AREAS.filter((a) => a.id !== AREAS[0].id).map((areaDef) => {
      const metrics: Record<string, BackendMetric> = {};
      for (const metricDef of areaDef.metrics) {
        metrics[metricDef.id] = makeMetric();
      }
      return makeBackendArea({ area_id: areaDef.id, area_name: areaDef.name, metrics });
    });
    const payload = makePayload(areas);

    const result = mapAreasPayload(payload, []);
    const missing = result.find((s) => s.id === AREAS[0].id)!;

    expect(missing.isOnline).toBe(false);
    expect(missing.metrics.every((m) => m.value === 0)).toBe(true);
    expect(missing.metrics.every((m) => m.history.length === 0)).toBe(true);
  });

  test('obszar nieobecny w payloadzie (z wcześniejszym snapshotem) -> carry-forward z isOnline:false', () => {
    const previousSnapshot: AreaSnapshot = {
      id: AREAS[0].id,
      name: AREAS[0].name,
      type: AREAS[0].type,
      metrics: AREAS[0].metrics.map((m) => ({
        id: m.id,
        label: m.label,
        unit: m.unit,
        decimals: m.decimals,
        value: 7,
        history: [7],
        alarm: false,
      })),
      lastSeenAt: '2025-01-01T00:00:00.000Z',
      isOnline: true,
    };

    const areas = AREAS.filter((a) => a.id !== AREAS[0].id).map((areaDef) => {
      const metrics: Record<string, BackendMetric> = {};
      for (const metricDef of areaDef.metrics) {
        metrics[metricDef.id] = makeMetric();
      }
      return makeBackendArea({ area_id: areaDef.id, area_name: areaDef.name, metrics });
    });
    const payload = makePayload(areas);

    const result = mapAreasPayload(payload, [previousSnapshot]);
    const carried = result.find((s) => s.id === AREAS[0].id)!;

    expect(carried.isOnline).toBe(false);
    expect(carried.metrics[0].value).toBe(7);
    expect(carried.metrics[0].history).toEqual([7]);
    expect(carried.lastSeenAt).toBe('2025-01-01T00:00:00.000Z');
  });

  test('etykieta/jednostka z backendu ma pierwszeństwo przed statyczną definicją', () => {
    const metricId = AREAS[0].metrics[0].id;
    const payload = fullPayload({
      [AREAS[0].id]: {
        metrics: {
          ...Object.fromEntries(AREAS[0].metrics.map((m) => [m.id, makeMetric()])),
          [metricId]: makeMetric({ label: 'Etykieta z PLC', unit: 'psi', decimals: 3 }),
        },
      },
    });

    const result = mapAreasPayload(payload, []);
    const metric = result[0].metrics.find((m) => m.id === metricId)!;

    expect(metric.label).toBe('Etykieta z PLC');
    expect(metric.unit).toBe('psi');
    expect(metric.decimals).toBe(3);
  });

  test('alarm:true z backendu jest widoczny na zmapowanej metryce', () => {
    const metricId = AREAS[0].metrics[0].id;
    const payload = fullPayload({
      [AREAS[0].id]: {
        metrics: {
          ...Object.fromEntries(AREAS[0].metrics.map((m) => [m.id, makeMetric()])),
          [metricId]: makeMetric({ alarm: true }),
        },
      },
    });

    const result = mapAreasPayload(payload, []);
    const metric = result[0].metrics.find((m) => m.id === metricId)!;

    expect(metric.alarm).toBe(true);
  });

  test('metryka całkowicie nieobecna w area.metrics (nie tylko null) używa wartości domyślnych z definicji statycznej', () => {
    const metricId = AREAS[0].metrics[0].id;
    const metrics = Object.fromEntries(AREAS[0].metrics.map((m) => [m.id, makeMetric()]));
    delete metrics[metricId];
    const payload = fullPayload({ [AREAS[0].id]: { metrics } });

    const result = mapAreasPayload(payload, []);
    const metric = result[0].metrics.find((m) => m.id === metricId)!;

    expect(metric.label).toBe(AREAS[0].metrics[0].label);
    expect(metric.unit).toBe(AREAS[0].metrics[0].unit);
    expect(metric.decimals).toBe(AREAS[0].metrics[0].decimals);
    expect(metric.value).toBe(0);
    expect(metric.alarm).toBe(false);
    expect(metric.history).toEqual([0]);
  });

  test('isOnline i lastSeenAt są ustawiane z payloadu dla obszaru obecnego w danych', () => {
    const payload = fullPayload({ [AREAS[1].id]: { online: false } }, );
    const result = mapAreasPayload(payload, []);

    expect(result.find((s) => s.id === AREAS[1].id)!.isOnline).toBe(false);
    expect(result[0].lastSeenAt).toBe(payload.timestamp);
  });
});

describe('markAllOffline', () => {
  test('nie mutuje przekazanych snapshotów i zwraca nowe obiekty', () => {
    const original: AreaSnapshot[] = [
      {
        id: AREAS[0].id,
        name: AREAS[0].name,
        type: AREAS[0].type,
        metrics: [
          {
            id: AREAS[0].metrics[0].id,
            label: AREAS[0].metrics[0].label,
            unit: AREAS[0].metrics[0].unit,
            decimals: AREAS[0].metrics[0].decimals,
            value: 10,
            history: [10],
            alarm: false,
          },
        ],
        lastSeenAt: '2025-01-01T00:00:00.000Z',
        isOnline: true,
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(original));

    const result = markAllOffline(original);

    expect(result).not.toBe(original);
    expect(result[0]).not.toBe(original[0]);
    expect(original).toEqual(snapshot);
    expect(result[0].isOnline).toBe(false);
    expect(result.every((s) => s.isOnline === false)).toBe(true);
  });
});
