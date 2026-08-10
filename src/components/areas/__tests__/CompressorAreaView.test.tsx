import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompressorAreaView } from '@/components/areas/CompressorAreaView';
import type { AreaDefinition } from '@/lib/areas';
import type { AreaSnapshot, Metric } from '@/lib/types';

const definition: AreaDefinition = {
  id: 'sprezarkownia',
  name: 'Sprężarkownia',
  type: 'compressor',
  metrics: [
    { id: 'sprezarkownia-drums', label: 'Magazyn Bębnów', unit: 'bar', decimals: 2 },
    { id: 'sprezarkownia-aluminium', label: 'Magazyn Aluminium', unit: 'bar', decimals: 2 },
  ],
};

function metric(overrides: Partial<Metric>): Metric {
  return {
    id: 'sprezarkownia-drums',
    label: 'Magazyn Bębnów',
    value: 7,
    unit: 'bar',
    decimals: 2,
    history: [6.8, 6.9, 7],
    alarm: false,
    ...overrides,
  };
}

function snapshot(overrides: Partial<AreaSnapshot> = {}): AreaSnapshot {
  return {
    id: 'sprezarkownia',
    name: 'Sprężarkownia',
    type: 'compressor',
    isOnline: true,
    lastSeenAt: new Date().toISOString(),
    metrics: [
      metric({ id: 'sprezarkownia-drums', label: 'Magazyn Bębnów', value: 7 }),
      metric({ id: 'sprezarkownia-aluminium', label: 'Magazyn Aluminium', value: 6.5 }),
    ],
    ...overrides,
  };
}

describe('CompressorAreaView', () => {
  // Decyzja #17: JEDNA karta "Ciśnienie sieci" z dwiema wartościami obok
  // siebie, nie dwie osobne karty.
  test('renderuje dokładnie jedną zewnętrzną kartę "Ciśnienie sieci" z dwoma odczytami w środku', () => {
    const { container } = render(
      <CompressorAreaView area={snapshot()} definition={definition} />
    );

    expect(container.querySelectorAll('[data-testid="compressor-pressure-card"]')).toHaveLength(1);
    expect(screen.getByText('Ciśnienie sieci')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="compressor-reading-sprezarkownia-drums"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="compressor-reading-sprezarkownia-aluminium"]')).toBeInTheDocument();
  });

  test('renderuje etykiety i wartości obu punktów pomiarowych', () => {
    render(<CompressorAreaView area={snapshot()} definition={definition} />);
    expect(screen.getByText('Magazyn Bębnów')).toBeInTheDocument();
    expect(screen.getByText('Magazyn Aluminium')).toBeInTheDocument();
  });

  test('alarm na jednym punkcie pulsuje tylko ten odczyt, nie całą kartę', () => {
    const withAlarm = snapshot({
      metrics: [
        metric({ id: 'sprezarkownia-drums', label: 'Magazyn Bębnów', value: 7, alarm: true }),
        metric({ id: 'sprezarkownia-aluminium', label: 'Magazyn Aluminium', value: 6.5, alarm: false }),
      ],
    });
    const { container } = render(
      <CompressorAreaView area={withAlarm} definition={definition} />
    );

    const drumsReading = container.querySelector('[data-testid="compressor-reading-sprezarkownia-drums"]');
    const aluminiumReading = container.querySelector('[data-testid="compressor-reading-sprezarkownia-aluminium"]');
    const outerCard = container.querySelector('[data-testid="compressor-pressure-card"]');

    expect(drumsReading).toHaveClass('animate-alarm-flash');
    expect(aluminiumReading).not.toHaveClass('animate-alarm-flash');
    expect(outerCard).not.toHaveClass('animate-alarm-flash');
  });

  test('isOnline===false wygasza wizualnie całą kartę (oba odczyty)', () => {
    const offlineSnapshot = snapshot({ isOnline: false });
    const { container } = render(
      <CompressorAreaView area={offlineSnapshot} definition={definition} />
    );
    const outerCard = container.querySelector('[data-testid="compressor-pressure-card"]');
    expect(outerCard?.className).toMatch(/grayscale-\[0\.5\]/);
  });
});
