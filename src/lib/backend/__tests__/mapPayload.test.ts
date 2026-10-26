import { describe, expect, test } from 'vitest';
import { mapAreasPayload, markAllOffline } from '@/lib/backend/mapPayload';
import type { InvalidMetricReport, MapAreasPayloadOptions } from '@/lib/backend/mapPayload';
import type { BackendArea, BackendMetric, BackendStateUpdate } from '@/lib/backend/payload';
import { AREAS } from '@/lib/areas';
import type { AreaSnapshot } from '@/lib/types';

// Mapper jest czysty i sam nie czyta zegara — moment odbioru ramki dostaje od
// wywołującego. Stała wartość robi z testów porównania deterministyczne.
const RECEIVED_AT = 1_700_000_000_000;
// Starszy znacznik z poprzedniej ramki — musi być różny od RECEIVED_AT, żeby
// test odróżniał "zachowano poprzedni" od "nadpisano nowym".
const PREVIOUS_FRESH_AT = 1_699_999_000_000;

function mapAt(
  payload: BackendStateUpdate,
  previous: AreaSnapshot[],
  opts: Partial<MapAreasPayloadOptions> = {}
): AreaSnapshot[] {
  return mapAreasPayload(payload, previous, { receivedAt: RECEIVED_AT, ...opts });
}

function makeMetric(overrides: Partial<BackendMetric> = {}): BackendMetric {
  return {
    label: 'Backend label',
    unit: 'X',
    decimals: 2,
    value: 1,
    alarm: false,
    alarm_description: null,
    online: true,
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

    const result = mapAt(payload, []);

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
        lastFreshAt: PREVIOUS_FRESH_AT,
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

    const result = mapAt(payload, previous);
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
      previous = mapAt(payload, previous, { historyLength: 3 });
    }

    const metric = previous[0].metrics.find((m) => m.id === metricId)!;
    expect(metric.history).toEqual([5, 5, 5]);
  });

  test('nieznany area_id w payloadzie jest ignorowany', () => {
    const payload = fullPayload();
    payload.areas.push(
      makeBackendArea({ area_id: 'nieznany-obszar', area_name: 'Nieznany', metrics: {} })
    );

    const result = mapAt(payload, []);

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

    const result = mapAt(payload, []);
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
      lastFreshAt: PREVIOUS_FRESH_AT,
    };

    const areas = AREAS.filter((a) => a.id !== AREAS[0].id).map((areaDef) => {
      const metrics: Record<string, BackendMetric> = {};
      for (const metricDef of areaDef.metrics) {
        metrics[metricDef.id] = makeMetric();
      }
      return makeBackendArea({ area_id: areaDef.id, area_name: areaDef.name, metrics });
    });
    const payload = makePayload(areas);

    const result = mapAt(payload, [previousSnapshot]);
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

    const result = mapAt(payload, []);
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

    const result = mapAt(payload, []);
    const metric = result[0].metrics.find((m) => m.id === metricId)!;

    expect(metric.alarm).toBe(true);
  });

  test('metryka całkowicie nieobecna w area.metrics (nie tylko null) używa wartości domyślnych z definicji statycznej', () => {
    const metricId = AREAS[0].metrics[0].id;
    const metrics = Object.fromEntries(AREAS[0].metrics.map((m) => [m.id, makeMetric()]));
    delete metrics[metricId];
    const payload = fullPayload({ [AREAS[0].id]: { metrics } });

    const result = mapAt(payload, []);
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
    const result = mapAt(payload, []);

    expect(result.find((s) => s.id === AREAS[1].id)!.isOnline).toBe(false);
    expect(result[0].lastSeenAt).toBe(payload.timestamp);
  });
});

describe('mapAreasPayload — lastFreshAt (czas ostatniej świeżej ramki, zegar klienta)', () => {
  const OFFLINE_AREA_ID = AREAS[1].id;

  function onlineSnapshot(areaId: string, lastFreshAt: number | null): AreaSnapshot {
    const def = AREAS.find((a) => a.id === areaId)!;
    return {
      id: def.id,
      name: def.name,
      type: def.type,
      metrics: def.metrics.map((m) => ({
        id: m.id,
        label: m.label,
        unit: m.unit,
        decimals: m.decimals,
        value: 5,
        history: [5],
        alarm: false,
        online: true,
      })),
      lastSeenAt: '2025-01-01T00:00:00.000Z',
      isOnline: true,
      lastFreshAt,
    };
  }

  test('obszar online dostaje lastFreshAt = receivedAt przekazany przez wywołującego', () => {
    const result = mapAt(fullPayload(), []);

    expect(result.every((s) => s.lastFreshAt === RECEIVED_AT)).toBe(true);
  });

  test('obszar offline zachowuje poprzedni lastFreshAt (nie dostaje nowego znacznika)', () => {
    const previous = [onlineSnapshot(OFFLINE_AREA_ID, PREVIOUS_FRESH_AT)];

    const result = mapAt(fullPayload({ [OFFLINE_AREA_ID]: { online: false } }), previous);

    expect(result.find((s) => s.id === OFFLINE_AREA_ID)!.lastFreshAt).toBe(PREVIOUS_FRESH_AT);
  });

  test('obszar, który nigdy nie był online, zostaje z lastFreshAt = null', () => {
    const result = mapAt(fullPayload({ [OFFLINE_AREA_ID]: { online: false } }), []);

    expect(result.find((s) => s.id === OFFLINE_AREA_ID)!.lastFreshAt).toBeNull();
  });

  test('obszar nieobecny w payloadzie (carry-forward) zachowuje poprzedni lastFreshAt', () => {
    const payload = fullPayload();
    payload.areas = payload.areas.filter((a) => a.area_id !== OFFLINE_AREA_ID);
    const previous = [onlineSnapshot(OFFLINE_AREA_ID, PREVIOUS_FRESH_AT)];

    const carried = mapAt(payload, previous).find((s) => s.id === OFFLINE_AREA_ID)!;

    expect(carried.isOnline).toBe(false);
    expect(carried.lastFreshAt).toBe(PREVIOUS_FRESH_AT);
  });

  test('obszar nieobecny w payloadzie i bez poprzednika ma lastFreshAt = null', () => {
    const payload = fullPayload();
    payload.areas = payload.areas.filter((a) => a.area_id !== OFFLINE_AREA_ID);

    const missing = mapAt(payload, []).find((s) => s.id === OFFLINE_AREA_ID)!;

    expect(missing.lastFreshAt).toBeNull();
  });

  test('carry-forward oznacza KAŻDĄ metrykę jako offline (Z2) i nie mutuje poprzednika', () => {
    const payload = fullPayload();
    payload.areas = payload.areas.filter((a) => a.area_id !== OFFLINE_AREA_ID);
    const previous = [onlineSnapshot(OFFLINE_AREA_ID, PREVIOUS_FRESH_AT)];
    const before = JSON.parse(JSON.stringify(previous));

    const carried = mapAt(payload, previous).find((s) => s.id === OFFLINE_AREA_ID)!;

    expect(carried.metrics.every((m) => m.online === false)).toBe(true);
    // Wartości zostają — to one są trzymane na ekranie przez okno wstrzymania.
    expect(carried.metrics.every((m) => m.value === 5)).toBe(true);
    expect(previous).toEqual(before);
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
        lastFreshAt: PREVIOUS_FRESH_AT,
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

  test('oznacza każdą metrykę jako offline (Z2) i zachowuje wartości oraz lastFreshAt', () => {
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
            history: [9, 10],
            alarm: true,
            online: true,
          },
        ],
        lastSeenAt: '2025-01-01T00:00:00.000Z',
        isOnline: true,
        lastFreshAt: PREVIOUS_FRESH_AT,
      },
    ];

    const [result] = markAllOffline(original);

    expect(result.metrics[0].online).toBe(false);
    expect(result.metrics[0].value).toBe(10);
    expect(result.metrics[0].history).toEqual([9, 10]);
    expect(result.metrics[0].alarm).toBe(true);
    expect(result.lastFreshAt).toBe(PREVIOUS_FRESH_AT);
    // Oryginał nietknięty — wcześniejsza flaga online metryki zostaje.
    expect(original[0].metrics[0].online).toBe(true);
  });
});

describe('mapAreasPayload — degradacja wadliwej metryki', () => {
  const COOLING_AREA = AREAS.find((a) => a.id === 'chlodnia-1');
  if (!COOLING_AREA) throw new Error('Fixture wymaga obszaru "chlodnia-1" w AREAS');
  const BROKEN_METRIC_ID = COOLING_AREA.metrics[0].id;

  /** Payload, w którym JEDNA metryka chłodni 1 ma wartość niezgodną z
   * kontraktem; wszystkie pozostałe metryki wszystkich 5 obszarów są
   * poprawne. Dokładnie kształt, który wcześniej gasił cały wallboard.
   *
   * Brak rzutowania jest celowy: `BackendArea.metrics` to `Record<string,
   * unknown>`, więc wstawienie tu wadliwej metryki musi być legalne bez
   * `as` — inaczej fixture kłamałby o tym, co przychodzi z socketu. */
  function payloadWithBrokenMetric(value: unknown): BackendStateUpdate {
    const payload = fullPayload();
    const chlodnia1 = payload.areas.find((a) => a.area_id === 'chlodnia-1')!;
    chlodnia1.metrics[BROKEN_METRIC_ID] = { ...makeMetric(), value };
    return payload;
  }

  test('wadliwa metryka nie wywraca pozostałych metryk ani innych obszarów', () => {
    const result = mapAt(payloadWithBrokenMetric(true), []);

    expect(result).toHaveLength(AREAS.length);
    const others = result.flatMap((s) => s.metrics).filter((m) => m.id !== BROKEN_METRIC_ID);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((m) => m.value === 1)).toBe(true);
    expect(result.every((s) => s.isOnline)).toBe(true);
  });

  test('wadliwa metryka trzyma ostatnią znaną wartość zamiast wpisywać boolean', () => {
    // Poprzednia wartość MUSI być inna niż 1: gdyby fixture podał 1 (jak
    // reszta payloadu), błędna implementacja `Number(raw.value)` dałaby dla
    // `true` również 1 i test przeszedłby mimo cichej koercji boola.
    const previousValue = 42;
    const seed = fullPayload();
    seed.areas.find((a) => a.area_id === 'chlodnia-1')!.metrics[BROKEN_METRIC_ID] = {
      ...makeMetric(),
      value: previousValue,
    };
    const healthy = mapAt(seed, []);
    const degraded = mapAt(payloadWithBrokenMetric(true), healthy);

    const metric = degraded[0].metrics.find((m) => m.id === BROKEN_METRIC_ID)!;
    expect(metric.value).toBe(previousValue);
    expect(typeof metric.value).toBe('number');
    expect(metric.history.every((v) => typeof v === 'number')).toBe(true);
    // Trend też trzyma podtrzymaną wartość, a nie skoercowane 1.
    expect(metric.history.at(-1)).toBe(previousValue);
  });

  test('brak metryki NIE jest raportowany jako wadliwa — to inny przypadek', () => {
    // Test negatywny do rozróżnienia "nie przysłano" vs "nie da się
    // sparsować": bez niego nic nie pilnuje wczesnego `return undefined`.
    const reports: InvalidMetricReport[] = [];
    const payload = fullPayload();
    delete payload.areas.find((a) => a.area_id === 'chlodnia-1')!.metrics[BROKEN_METRIC_ID];

    mapAt(payload, [], { onInvalidMetric: (r) => reports.push(r) });

    expect(reports).toEqual([]);
  });

  test('zgłasza każdą wadliwą metrykę przez onInvalidMetric, z powodem', () => {
    const reports: InvalidMetricReport[] = [];

    mapAt(payloadWithBrokenMetric(true), [], {
      onInvalidMetric: (report) => reports.push(report),
    });

    expect(reports).toEqual([
      { areaId: 'chlodnia-1', metricId: BROKEN_METRIC_ID, reason: 'value: boolean' },
    ]);
  });

  test('AKTYWNY alarm przeżywa degradację metryki — nie znika po cichu z ekranu', () => {
    // Wallboard nie ma nikogo, kto czyta konsolę. Gdyby `alarm` resetował
    // się do false przy wadliwej metryce, podczas gdy wartość trzyma stan
    // sprzed awarii, operator zobaczyłby kafelek "zdrowy, bez alarmu" nad
    // danymi, których przeglądarka nie potrafiła sparsować. Degradacja musi
    // być spójna: wartość i alarm trzymają się razem.
    const alarming = fullPayload();
    const chlodnia1 = alarming.areas.find((a) => a.area_id === 'chlodnia-1')!;
    chlodnia1.metrics[BROKEN_METRIC_ID] = { ...makeMetric(), alarm: true };

    const withAlarm = mapAt(alarming, []);
    expect(withAlarm[0].metrics.find((m) => m.id === BROKEN_METRIC_ID)!.alarm).toBe(true);

    const degraded = mapAt(payloadWithBrokenMetric(true), withAlarm);
    expect(degraded[0].metrics.find((m) => m.id === BROKEN_METRIC_ID)!.alarm).toBe(true);
  });

  test('powód odrzucenia wskazuje FAKTYCZNIE wadliwe pole, nie zawsze "value"', () => {
    // Komunikat obwiniający niewłaściwe pole jest gorszy niż jego brak —
    // czyta go ktoś, kto właśnie szuka, czemu kafelek zgasł.
    const reports: InvalidMetricReport[] = [];
    const payload = fullPayload();
    const chlodnia1 = payload.areas.find((a) => a.area_id === 'chlodnia-1')!;
    // `value` jest poprawne; zepsute jest `label`.
    chlodnia1.metrics[BROKEN_METRIC_ID] = { ...makeMetric(), label: 1 };

    mapAt(payload, [], { onInvalidMetric: (r) => reports.push(r) });

    expect(reports.map((r) => r.reason)).toEqual(['label: number']);
  });

  test('nie zgłasza niczego, gdy wszystkie metryki są poprawne', () => {
    const reports: unknown[] = [];
    mapAt(fullPayload(), [], { onInvalidMetric: (r) => reports.push(r) });
    expect(reports).toEqual([]);
  });

  test('metryka STRING degraduje tak samo jak boolean — ta sama klasa błędu', () => {
    const reports: InvalidMetricReport[] = [];
    mapAt(payloadWithBrokenMetric('chlodnia-1'), [], {
      onInvalidMetric: (report) => reports.push(report),
    });
    expect(reports.map((r) => r.reason)).toEqual(['value: string']);
  });
});
