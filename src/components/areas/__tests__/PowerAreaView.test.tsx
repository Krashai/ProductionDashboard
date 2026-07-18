import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { PowerAreaView } from '@/components/areas/PowerAreaView';
import type { AreaDefinition } from '@/lib/areas';
import type { AreaSnapshot, Metric } from '@/lib/types';

const substations = [1, 2, 3];

const definition: AreaDefinition = {
  id: 'energia-elektryczna',
  name: 'Energia elektryczna',
  type: 'power',
  metrics: substations.flatMap((n) => [
    { id: `trafostacja-${n}-active`, label: `Trafostacja ${n} — Moc czynna`, unit: 'kW', decimals: 0 },
    { id: `trafostacja-${n}-apparent`, label: `Trafostacja ${n} — Moc pozorna`, unit: 'kVA', decimals: 0 },
  ]),
};

function metric(overrides: Partial<Metric>): Metric {
  return {
    id: 'trafostacja-1-active',
    label: 'Trafostacja 1 — Moc czynna',
    value: 200,
    unit: 'kW',
    decimals: 0,
    history: [190, 195, 200],
    alarm: false,
    ...overrides,
  };
}

function snapshot(overrides: Partial<AreaSnapshot> = {}): AreaSnapshot {
  return {
    id: 'energia-elektryczna',
    name: 'Energia elektryczna',
    type: 'power',
    isOnline: true,
    lastSeenAt: new Date().toISOString(),
    metrics: definition.metrics.map((def) =>
      metric({ id: def.id, label: def.label, unit: def.unit, decimals: def.decimals, value: 200 })
    ),
    ...overrides,
  };
}

describe('PowerAreaView', () => {
  test('renderuje dokładnie 6 MetricCard (3 trafostacje × kW/kVA)', () => {
    const { container } = render(<PowerAreaView area={snapshot()} definition={definition} />);

    for (const def of definition.metrics) {
      expect(
        container.querySelector(`[data-testid="metric-card-${def.id}"]`)
      ).toBeInTheDocument();
    }
    expect(container.querySelectorAll('[data-testid^="metric-card-"]')).toHaveLength(6);
  });

  test('alarm na jednej metryce propaguje się tylko do jej karty', () => {
    const withAlarm = snapshot({
      metrics: definition.metrics.map((def) =>
        metric({
          id: def.id,
          label: def.label,
          unit: def.unit,
          decimals: def.decimals,
          value: 200,
          alarm: def.id === 'trafostacja-2-apparent',
        })
      ),
    });
    const { container } = render(<PowerAreaView area={withAlarm} definition={definition} />);

    const alarmCard = container.querySelector('[data-testid="metric-card-trafostacja-2-apparent"]');
    const otherCard = container.querySelector('[data-testid="metric-card-trafostacja-1-active"]');

    expect(alarmCard).toHaveClass('animate-pulse-subtle');
    expect(otherCard).not.toHaveClass('animate-pulse-subtle');
  });

  test('isOnline===false propaguje offline do wszystkich 6 kart', () => {
    const offlineSnapshot = snapshot({ isOnline: false });
    const { container } = render(<PowerAreaView area={offlineSnapshot} definition={definition} />);

    for (const def of definition.metrics) {
      const card = container.querySelector(`[data-testid="metric-card-${def.id}"]`);
      expect(card?.className).toMatch(/grayscale-\[0\.5\]/);
    }
  });

  test('grid mieści 6 kart bez scrolla (klasa grid z wariantem 2xl)', () => {
    const { container } = render(<PowerAreaView area={snapshot()} definition={definition} />);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toMatch(/grid/);
    expect(grid.className).toMatch(/2xl:grid-cols-6/);
  });
});
