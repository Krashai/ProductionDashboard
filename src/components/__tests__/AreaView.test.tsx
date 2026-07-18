import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { AreaView } from '@/components/AreaView';
import { AREAS } from '@/lib/areas';
import type { AreaSnapshot } from '@/lib/types';

function snapshotFor(areaId: string): AreaSnapshot {
  const definition = AREAS.find((a) => a.id === areaId)!;
  return {
    id: definition.id,
    name: definition.name,
    type: definition.type,
    isOnline: true,
    lastSeenAt: new Date().toISOString(),
    metrics: definition.metrics.map((def) => ({
      id: def.id,
      label: def.label,
      unit: def.unit,
      decimals: def.decimals,
      value: 10,
      history: [8, 9, 10],
      alarm: false,
    })),
  };
}

describe('AreaView', () => {
  test('dla type=cooling renderuje CoolingAreaView (2 karty + tank level bar)', () => {
    const definition = AREAS.find((a) => a.type === 'cooling')!;
    const { container } = render(
      <AreaView area={snapshotFor(definition.id)} definition={definition} />
    );
    expect(container.querySelector('[data-testid^="tank-level-"]')).toBeInTheDocument();
  });

  test('dla type=compressor renderuje CompressorAreaView (jedna karta "Ciśnienie sieci")', () => {
    const definition = AREAS.find((a) => a.type === 'compressor')!;
    const { container } = render(
      <AreaView area={snapshotFor(definition.id)} definition={definition} />
    );
    expect(container.querySelector('[data-testid="compressor-pressure-card"]')).toBeInTheDocument();
  });

  test('dla type=power renderuje PowerAreaView (6 kart)', () => {
    const definition = AREAS.find((a) => a.type === 'power')!;
    const { container } = render(
      <AreaView area={snapshotFor(definition.id)} definition={definition} />
    );
    expect(container.querySelectorAll('[data-testid^="metric-card-"]')).toHaveLength(6);
  });
});
