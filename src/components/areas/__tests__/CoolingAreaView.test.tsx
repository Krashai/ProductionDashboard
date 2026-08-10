import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { CoolingAreaView } from '@/components/areas/CoolingAreaView';
import type { AreaDefinition } from '@/lib/areas';
import type { AreaSnapshot, Metric } from '@/lib/types';

const definition: AreaDefinition = {
  id: 'chlodnia-1',
  name: 'Chłodnia 1',
  type: 'cooling',
  maxCm: 150,
  metrics: [
    { id: 'chlodnia-1-temp', label: 'Temperatura wody na halę', unit: '°C', decimals: 1 },
    { id: 'chlodnia-1-pressure', label: 'Ciśnienie wody na halę', unit: 'bar', decimals: 2 },
    { id: 'chlodnia-1-level', label: 'Poziom wody w zbiorniku', unit: 'cm', decimals: 0 },
  ],
};

function metric(overrides: Partial<Metric>): Metric {
  return {
    id: 'chlodnia-1-temp',
    label: 'Temperatura wody na halę',
    value: 5,
    unit: '°C',
    decimals: 1,
    history: [4, 5, 5.5],
    alarm: false,
    ...overrides,
  };
}

function snapshot(overrides: Partial<AreaSnapshot> = {}): AreaSnapshot {
  return {
    id: 'chlodnia-1',
    name: 'Chłodnia 1',
    type: 'cooling',
    isOnline: true,
    lastSeenAt: new Date().toISOString(),
    metrics: [
      metric({ id: 'chlodnia-1-temp', label: 'Temperatura wody na halę', unit: '°C', value: 5, decimals: 1 }),
      metric({ id: 'chlodnia-1-pressure', label: 'Ciśnienie wody na halę', unit: 'bar', value: 7, decimals: 2 }),
      metric({ id: 'chlodnia-1-level', label: 'Poziom wody w zbiorniku', unit: 'cm', value: 120, decimals: 0 }),
    ],
    ...overrides,
  };
}

describe('CoolingAreaView', () => {
  test('renderuje 2 MetricCard (temperatura, ciśnienie) i 1 TankLevelBar', () => {
    const { container } = render(<CoolingAreaView area={snapshot()} definition={definition} />);

    expect(container.querySelector('[data-testid="metric-card-chlodnia-1-temp"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="metric-card-chlodnia-1-pressure"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="metric-card-chlodnia-1-level"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="tank-level-chlodnia-1-level"]')).toBeInTheDocument();
  });

  test('alarm na jednej metryce propaguje się tylko do jej karty', () => {
    const withAlarm = snapshot({
      metrics: [
        metric({ id: 'chlodnia-1-temp', unit: '°C', value: 5, decimals: 1, alarm: true }),
        metric({ id: 'chlodnia-1-pressure', unit: 'bar', value: 7, decimals: 2, alarm: false }),
        metric({ id: 'chlodnia-1-level', unit: 'cm', value: 120, decimals: 0, alarm: false }),
      ],
    });
    const { container } = render(<CoolingAreaView area={withAlarm} definition={definition} />);

    const tempCard = container.querySelector('[data-testid="metric-card-chlodnia-1-temp"]');
    const pressureCard = container.querySelector('[data-testid="metric-card-chlodnia-1-pressure"]');
    const tankBar = container.querySelector('[data-testid="tank-level-chlodnia-1-level"]');

    expect(tempCard).toHaveClass('animate-alarm-flash');
    expect(pressureCard).not.toHaveClass('animate-alarm-flash');
    expect(tankBar).not.toHaveClass('animate-alarm-flash');
  });

  test('alarm na metryce poziomu propaguje się do TankLevelBar', () => {
    const withLevelAlarm = snapshot({
      metrics: [
        metric({ id: 'chlodnia-1-temp', unit: '°C', value: 5, decimals: 1 }),
        metric({ id: 'chlodnia-1-pressure', unit: 'bar', value: 7, decimals: 2 }),
        metric({ id: 'chlodnia-1-level', unit: 'cm', value: 120, decimals: 0, alarm: true }),
      ],
    });
    const { container } = render(<CoolingAreaView area={withLevelAlarm} definition={definition} />);
    const tankBar = container.querySelector('[data-testid="tank-level-chlodnia-1-level"]');
    expect(tankBar).toHaveClass('animate-alarm-flash');
  });

  test('isOnline===false propaguje offline do wszystkich kart obszaru', () => {
    const offlineSnapshot = snapshot({ isOnline: false });
    const { container } = render(<CoolingAreaView area={offlineSnapshot} definition={definition} />);

    const tempCard = container.querySelector('[data-testid="metric-card-chlodnia-1-temp"]');
    const pressureCard = container.querySelector('[data-testid="metric-card-chlodnia-1-pressure"]');
    const tankBar = container.querySelector('[data-testid="tank-level-chlodnia-1-level"]');

    expect(tempCard?.className).toMatch(/grayscale-\[0\.5\]/);
    expect(pressureCard?.className).toMatch(/grayscale-\[0\.5\]/);
    expect(tankBar?.className).toMatch(/grayscale-\[0\.5\]/);
  });

  test('używa maxCm z AreaDefinition do wyliczenia wypełnienia paska poziomu', () => {
    const { container } = render(<CoolingAreaView area={snapshot()} definition={definition} />);
    const fill = container.querySelector('[data-testid="tank-level-fill"]') as HTMLElement;
    // 120 / 150 = 80%
    expect(fill.style.height).toBe('80%');
  });
});
