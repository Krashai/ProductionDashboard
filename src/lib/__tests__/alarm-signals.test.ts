import { describe, expect, test } from 'vitest';
import { collectAlarms } from '@/components/AlarmBar';
import { deriveDeviceStatus } from '@/lib/device-status';
import { mapAreasPayload } from '@/lib/backend/mapPayload';
import type { BackendArea, BackendStateUpdate } from '@/lib/backend/payload';
import { AREAS, type DeviceDefinition } from '@/lib/areas';
import { generateSnapshot } from '@/lib/mock/generateSnapshot';
import type { AreaSnapshot, Metric } from '@/lib/types';

// F1 (analiza panelu admina 2026-09-29): backend od dawna wysyłał
// `alarm_description` i listę `alarms` z tagów diagnostycznych, ale
// wallboard żadnej z tych rzeczy nie wyświetlał — alarmy bitowe słów awarii
// były dla operatora niewidoczne, a przy metrykach nie było widać "dlaczego".

function metric(overrides: Partial<Metric>): Metric {
  return { id: 'm', label: 'L', value: 0, unit: '', decimals: 0, history: [], alarm: false, ...overrides };
}

function area(overrides: Partial<AreaSnapshot>): AreaSnapshot {
  return {
    id: 'chlodnia-1', name: 'Chłodnia 1', type: 'cooling', metrics: [], lastSeenAt: null,
    isOnline: true, ...overrides,
  };
}

describe('collectAlarms', () => {
  test('niesie opis alarmu z backendu', () => {
    const alarms = collectAlarms([
      area({ metrics: [metric({ id: 'chlodnia-1-level', label: 'Temperatura', alarm: true, alarmDescription: 'Powyżej maksimum (9.0)' })] }),
    ]);

    expect(alarms).toEqual([
      expect.objectContaining({ metricLabel: 'Temperatura', description: 'Powyżej maksimum (9.0)' }),
    ]);
  });

  test('uwzględnia alarmy tagów diagnostycznych (spoza katalogu metryk)', () => {
    const alarms = collectAlarms([
      area({ extraAlarms: [{ metricId: 'chlodnia-1-diag-aw1', label: 'Słowo awarii 1', description: 'Przegrzanie; Brak przepływu' }] }),
    ]);

    expect(alarms).toEqual([
      {
        areaId: 'chlodnia-1', areaName: 'Chłodnia 1', metricId: 'chlodnia-1-diag-aw1',
        metricLabel: 'Słowo awarii 1', description: 'Przegrzanie; Brak przepływu',
      },
    ]);
  });
});

describe('deriveDeviceStatus — awaria z flagi alarmu backendu', () => {
  const v101: DeviceDefinition = {
    id: 'v101', label: 'V101',
    metricIds: { praca: 'chlodnia-1-v101-praca', awaria: 'chlodnia-1-v101-awaria' },
  };

  test('awaria skonfigurowana jako "wzbudza FALSE": value=0 + alarm → kafel w awarii', () => {
    const status = deriveDeviceStatus(v101, [metric({ id: 'chlodnia-1-v101-awaria', value: 0, alarm: true })], false);
    expect(status.fault).toBe(true);
  });

  test('value=1 bez alarmu (np. awaria wzbudzana przez FALSE) → brak awarii', () => {
    const status = deriveDeviceStatus(v101, [metric({ id: 'chlodnia-1-v101-awaria', value: 1, alarm: false })], false);
    expect(status.fault).toBe(false);
  });
});

function backendArea(overrides: Partial<BackendArea>): BackendArea {
  return { area_id: 'chlodnia-1', area_name: 'Chłodnia 1', online: true, metrics: {}, alarms: [], ...overrides };
}

function payload(areas: BackendArea[]): BackendStateUpdate {
  return { type: 'STATE_UPDATE', timestamp: '2026-09-29T00:00:00Z', areas };
}

describe('mapAreasPayload — opisy i alarmy diagnostyczne', () => {
  test('przenosi alarm_description do metryki', () => {
    const [c1] = mapAreasPayload(payload([backendArea({ metrics: {
      'chlodnia-1-temp': { label: 'T', unit: '°C', decimals: 1, value: 9.5, alarm: true, alarm_description: 'Powyżej maksimum (9.0)' },
    } })]), []);

    expect(c1.metrics.find((m) => m.id === 'chlodnia-1-temp')?.alarmDescription).toBe('Powyżej maksimum (9.0)');
  });

  test('bierze z `alarms` tylko tagi spoza katalogu (bez dublowania metryk) i odrzuca wpisy uszkodzone', () => {
    const [c1] = mapAreasPayload(payload([backendArea({ alarms: [
      { tag_id: 1, metric_id: 'chlodnia-1-temp', tag_name: 't', label: 'T', description: 'x' },
      { tag_id: 2, metric_id: 'chlodnia-1-diag-aw1', tag_name: 'w', label: 'Słowo awarii 1', description: 'Przegrzanie' },
      { tag_id: 3, metric_id: 42, label: null },
    ] })]), []);

    expect(c1.extraAlarms).toEqual([
      { metricId: 'chlodnia-1-diag-aw1', label: 'Słowo awarii 1', description: 'Przegrzanie' },
    ]);
  });
});

describe('mock zgodny z backendem', () => {
  test('metryka AWARIA ma alarm dokładnie wtedy, gdy value=1 (domyślna reguła backendu)', () => {
    // random() = 0.01: poniżej AWARIA_INITIAL_PROBABILITY, więc awarie
    // startują jako 1 — sprawdzamy oba stany przez kolejne ticki.
    let random = 0.01;
    const draw = () => random;
    const seen = new Set<boolean>();
    for (const areaDef of AREAS) {
      let previous: AreaSnapshot | undefined;
      for (let i = 0; i < 3; i += 1) {
        previous = generateSnapshot(areaDef, { previous, random: draw });
        for (const m of previous.metrics.filter((x) => /-awaria(-\d+)?$/.test(x.id))) {
          expect(m.alarm).toBe(m.value === 1);
          seen.add(m.value === 1);
        }
        random = random === 0.01 ? 0.001 : 0.01; // < BOOL_FLIP → przełącza stan
      }
    }
    expect(seen).toEqual(new Set([true, false]));
  });
});
