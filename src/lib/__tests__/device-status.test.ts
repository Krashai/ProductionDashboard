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
    hz: 'chlodnia-1-pompa-1-hz',
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

  test('urządzenie bez metryki Hz ma frequencyHz=null', () => {
    const status = deriveDeviceStatus(v101, [], false);
    expect(status.frequencyHz).toBeNull();
  });

  test('urządzenie z metryką Hz zwraca jej wartość jako frequencyHz', () => {
    const metrics = [
      metric({ id: 'chlodnia-1-pompa-1-praca', value: 1 }),
      metric({ id: 'chlodnia-1-pompa-1-awaria', value: 0 }),
      metric({ id: 'chlodnia-1-pompa-1-hz', value: 42.5, unit: 'Hz', decimals: 1 }),
    ];
    const status = deriveDeviceStatus(pompa1, metrics, false);
    expect(status.frequencyHz).toBe(42.5);
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
    return { id: 'pompa-x', label: 'Pompa X', running, fault: false, frequencyHz: null, offline: false };
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
