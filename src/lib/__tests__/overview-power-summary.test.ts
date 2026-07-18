import { describe, expect, test } from 'vitest';
import { computeTotalActivePowerKw } from '@/lib/overview-power-summary';
import type { Metric } from '@/lib/types';

function metric(overrides: Partial<Metric>): Metric {
  return {
    id: 'm',
    label: 'M',
    value: 0,
    unit: 'kW',
    decimals: 0,
    history: [],
    alarm: false,
    ...overrides,
  };
}

describe('computeTotalActivePowerKw', () => {
  test('sumuje wartości trzech metryk kW (decyzja #29)', () => {
    const metrics = [
      metric({ id: 'a', unit: 'kW', value: 100 }),
      metric({ id: 'b', unit: 'kW', value: 150 }),
      metric({ id: 'c', unit: 'kW', value: 200 }),
    ];
    expect(computeTotalActivePowerKw(metrics)).toBe(450);
  });

  test('pomija metryki kVA — liczy tylko moc czynną', () => {
    const metrics = [
      metric({ id: 'a', unit: 'kW', value: 100 }),
      metric({ id: 'b', unit: 'kVA', value: 9999 }),
      metric({ id: 'c', unit: 'kW', value: 50 }),
    ];
    expect(computeTotalActivePowerKw(metrics)).toBe(150);
  });

  test('pusta lista metryk => 0', () => {
    expect(computeTotalActivePowerKw([])).toBe(0);
  });

  test('brak jakiejkolwiek metryki kW (same kVA) => 0', () => {
    const metrics = [metric({ id: 'a', unit: 'kVA', value: 100 })];
    expect(computeTotalActivePowerKw(metrics)).toBe(0);
  });

  test('pojedyncza metryka kW => jej wartość', () => {
    expect(computeTotalActivePowerKw([metric({ unit: 'kW', value: 77 })])).toBe(77);
  });
});
