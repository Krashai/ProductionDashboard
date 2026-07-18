import { describe, expect, test } from 'vitest';
import { metricColorForUnit } from '@/lib/metric-color';

describe('metricColorForUnit', () => {
  test('°C => blue', () => {
    expect(metricColorForUnit('°C')).toBe('blue');
  });

  test('bar => emerald', () => {
    expect(metricColorForUnit('bar')).toBe('emerald');
  });

  test('kW => amber', () => {
    expect(metricColorForUnit('kW')).toBe('amber');
  });

  test('kVA => slate', () => {
    expect(metricColorForUnit('kVA')).toBe('slate');
  });

  test('nieznana jednostka => slate (bezpieczny fallback)', () => {
    expect(metricColorForUnit('cm')).toBe('slate');
    expect(metricColorForUnit('')).toBe('slate');
  });
});
