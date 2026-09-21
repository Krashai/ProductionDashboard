import { describe, expect, test } from 'vitest';
import {
  deriveCoolingOperationalState,
  deriveDeviceGroupStatuses,
  deriveDeviceStatus,
  type DeviceStatus,
} from '@/lib/device-status';
import type { DeviceDefinition, DeviceGroupDefinition } from '@/lib/areas';
import type { Metric } from '@/lib/types';

function metric(overrides: Partial<Metric>): Metric {
  return {
    id: 'chlodnia-1-v101-praca',
    label: 'V101 — Praca',
    value: 0,
    unit: '',
    decimals: 0,
    history: [],
    alarm: false,
    ...overrides,
  };
}

const v101: DeviceDefinition = {
  id: 'v101',
  label: 'V101',
  metricIds: { praca: 'chlodnia-1-v101-praca', awaria: 'chlodnia-1-v101-awaria' },
};

const pompa1: DeviceDefinition = {
  id: 'pompa-1',
  label: 'Pompa 1',
  metricIds: {
    praca: 'chlodnia-1-pompa-1-praca',
    awaria: 'chlodnia-1-pompa-1-awaria',
    secondary: 'chlodnia-1-pompa-1-hz',
  },
};

const darpin: DeviceDefinition = {
  id: 'darpin',
  label: 'Darpin',
  metricIds: {
    praca: 'chlodnia-3-darpin-praca',
    secondary: 'chlodnia-3-darpin-poziom',
  },
};

const rhoss: DeviceDefinition = {
  id: 'rhoss',
  label: 'Rhoss',
  metricIds: {
    praca: 'chlodnia-3-rhoss-praca',
    awaria: ['chlodnia-3-rhoss-awaria-1', 'chlodnia-3-rhoss-awaria-2'],
  },
};

describe('deriveDeviceStatus', () => {
  test('praca=1, awaria=0 → running=true, fault=false', () => {
    const metrics = [
      metric({ id: 'chlodnia-1-v101-praca', value: 1 }),
      metric({ id: 'chlodnia-1-v101-awaria', value: 0 }),
    ];
    const status = deriveDeviceStatus(v101, metrics, false);
    expect(status).toMatchObject({ id: 'v101', label: 'V101', running: true, fault: false, offline: false });
  });

  test('praca=0, awaria=1 → running=false, fault=true (urządzenie stoi w awarii)', () => {
    const metrics = [
      metric({ id: 'chlodnia-1-v101-praca', value: 0 }),
      metric({ id: 'chlodnia-1-v101-awaria', value: 1 }),
    ];
    const status = deriveDeviceStatus(v101, metrics, false);
    expect(status.running).toBe(false);
    expect(status.fault).toBe(true);
  });

  test('brak tagu (metryka nieobecna w danych) → running=false, fault=false, nie rzuca', () => {
    const status = deriveDeviceStatus(v101, [], false);
    expect(status.running).toBe(false);
    expect(status.fault).toBe(false);
  });

  test('areaOffline=true propaguje się do statusu urządzenia', () => {
    const metrics = [metric({ id: 'chlodnia-1-v101-praca', value: 1 })];
    const status = deriveDeviceStatus(v101, metrics, true);
    expect(status.offline).toBe(true);
  });

  test('urządzenie bez metryki dodatkowej ma secondaryValue=null i secondaryUnit=null', () => {
    const status = deriveDeviceStatus(v101, [], false);
    expect(status.secondaryValue).toBeNull();
    expect(status.secondaryUnit).toBeNull();
    expect(status.secondaryDecimals).toBeNull();
  });

  test('urządzenie z metryką Hz zwraca jej wartość/jednostkę/precyzję jako secondaryValue/secondaryUnit/secondaryDecimals', () => {
    const metrics = [
      metric({ id: 'chlodnia-1-pompa-1-praca', value: 1 }),
      metric({ id: 'chlodnia-1-pompa-1-awaria', value: 0 }),
      metric({ id: 'chlodnia-1-pompa-1-hz', value: 42.5, unit: 'Hz', decimals: 1 }),
    ];
    const status = deriveDeviceStatus(pompa1, metrics, false);
    expect(status.secondaryValue).toBe(42.5);
    expect(status.secondaryUnit).toBe('Hz');
    expect(status.secondaryDecimals).toBe(1);
  });

  // Chłodnia 3 (wrzesień 2026): Darpin nie ma bitu awarii w PLC w ogóle —
  // `metricIds.awaria` jest nieobecne, nie tylko "niespełnione".
  test('Darpin (brak metricIds.awaria): fault=false niezależnie od danych, praca+poziom pracy działają normalnie', () => {
    const metrics = [
      metric({ id: 'chlodnia-3-darpin-praca', value: 1 }),
      metric({ id: 'chlodnia-3-darpin-poziom', value: 2, unit: '', decimals: 0 }),
    ];
    const status = deriveDeviceStatus(darpin, metrics, false);
    expect(status.running).toBe(true);
    expect(status.fault).toBe(false);
    expect(status.secondaryValue).toBe(2);
    expect(status.secondaryUnit).toBe('');
    // decimals=0: "poziom pracy" to liczba całkowita, nie pomiar analogowy —
    // musi dojechać do kafla inaczej niż domyślne 1 miejsce po przecinku Hz.
    expect(status.secondaryDecimals).toBe(0);
  });

  // Rhoss: dwa osobne bity awarii OR-owane w jeden `fault`.
  test('Rhoss (metricIds.awaria to tablica): fault=true, gdy DOWOLNY z dwóch bitów=1', () => {
    const bothZero = [
      metric({ id: 'chlodnia-3-rhoss-praca', value: 1 }),
      metric({ id: 'chlodnia-3-rhoss-awaria-1', value: 0 }),
      metric({ id: 'chlodnia-3-rhoss-awaria-2', value: 0 }),
    ];
    expect(deriveDeviceStatus(rhoss, bothZero, false).fault).toBe(false);

    const firstBitSet = [
      metric({ id: 'chlodnia-3-rhoss-praca', value: 1 }),
      metric({ id: 'chlodnia-3-rhoss-awaria-1', value: 1 }),
      metric({ id: 'chlodnia-3-rhoss-awaria-2', value: 0 }),
    ];
    expect(deriveDeviceStatus(rhoss, firstBitSet, false).fault).toBe(true);

    const secondBitSet = [
      metric({ id: 'chlodnia-3-rhoss-praca', value: 1 }),
      metric({ id: 'chlodnia-3-rhoss-awaria-1', value: 0 }),
      metric({ id: 'chlodnia-3-rhoss-awaria-2', value: 1 }),
    ];
    expect(deriveDeviceStatus(rhoss, secondBitSet, false).fault).toBe(true);
  });

  test('Rhoss: brak obu metryk awarii w danych → fault=false, nie rzuca', () => {
    const metrics = [metric({ id: 'chlodnia-3-rhoss-praca', value: 1 })];
    expect(deriveDeviceStatus(rhoss, metrics, false).fault).toBe(false);
  });
});

describe('deriveDeviceGroupStatuses', () => {
  const groups: DeviceGroupDefinition[] = [
    { id: 'sprezarki', label: 'Sprężarki', devices: [v101] },
  ];

  test('brak grup (deviceGroups undefined) zwraca pustą tablicę', () => {
    expect(deriveDeviceGroupStatuses(undefined, [], false)).toEqual([]);
  });

  test('mapuje każdą grupę i każde jej urządzenie', () => {
    const metrics = [
      metric({ id: 'chlodnia-1-v101-praca', value: 1 }),
      metric({ id: 'chlodnia-1-v101-awaria', value: 0 }),
    ];
    const result = deriveDeviceGroupStatuses(groups, metrics, false);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('sprezarki');
    expect(result[0].devices).toHaveLength(1);
    expect(result[0].devices[0].running).toBe(true);
  });
});

describe('deriveCoolingOperationalState', () => {
  function pump(running: boolean): DeviceStatus {
    return {
      id: 'pompa-x',
      label: 'Pompa X',
      running,
      fault: false,
      secondaryValue: null,
      secondaryUnit: null,
      secondaryDecimals: null,
      offline: false,
    };
  }

  test('pusta lista pomp → running (brak dowodu, że chłodnia jest wyłączona)', () => {
    expect(deriveCoolingOperationalState([])).toBe('running');
  });

  test('co najmniej jedna pompa pracuje → running', () => {
    expect(deriveCoolingOperationalState([pump(false), pump(true), pump(false)])).toBe('running');
  });

  test('wszystkie pompy stoją → shutdown', () => {
    expect(deriveCoolingOperationalState([pump(false), pump(false)])).toBe('shutdown');
  });
});
