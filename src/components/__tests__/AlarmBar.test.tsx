import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlarmBar, collectAlarms } from '@/components/AlarmBar';
import type { AreaSnapshot, Metric } from '@/lib/types';

function metric(overrides: Partial<Metric>): Metric {
  return {
    id: 'm1',
    label: 'Ciśnienie wody na halę',
    value: 5,
    unit: 'bar',
    decimals: 2,
    history: [],
    alarm: false,
    ...overrides,
  };
}

function area(overrides: Partial<AreaSnapshot>): AreaSnapshot {
  return {
    id: 'chlodnia-2',
    name: 'Chłodnia 2',
    type: 'cooling',
    isOnline: true,
    lastSeenAt: new Date().toISOString(),
    metrics: [],
    ...overrides,
  };
}

describe('collectAlarms (agregacja alarmów)', () => {
  test('brak alarmów w żadnym obszarze => pusta lista', () => {
    const areas = [area({ metrics: [metric({ alarm: false })] })];
    expect(collectAlarms(areas)).toEqual([]);
  });

  test('jeden alarm w jednym obszarze => jeden wpis z areaName i metricLabel', () => {
    const areas = [
      area({
        id: 'chlodnia-2',
        name: 'Chłodnia 2',
        metrics: [metric({ id: 'p', label: 'Ciśnienie wody na halę', alarm: true })],
      }),
    ];
    expect(collectAlarms(areas)).toEqual([
      { areaId: 'chlodnia-2', areaName: 'Chłodnia 2', metricId: 'p', metricLabel: 'Ciśnienie wody na halę' },
    ]);
  });

  test('alarmy w wielu różnych obszarach => jeden wpis per alarm, nie per obszar', () => {
    const areas = [
      area({
        id: 'chlodnia-1',
        name: 'Chłodnia 1',
        metrics: [
          metric({ id: 't1', label: 'Temperatura wody na halę', alarm: true }),
          metric({ id: 'p1', label: 'Ciśnienie wody na halę', alarm: false }),
        ],
      }),
      area({
        id: 'energia-elektryczna',
        name: 'Energia elektryczna',
        type: 'power',
        metrics: [
          metric({ id: 'kw1', label: 'Trafostacja 1 — Moc czynna', alarm: true }),
          metric({ id: 'kva1', label: 'Trafostacja 1 — Moc pozorna', alarm: true }),
        ],
      }),
    ];

    expect(collectAlarms(areas)).toHaveLength(3);
  });
});

describe('AlarmBar', () => {
  test('brak alarmów => chip "Wszystko OK" w kolorze emerald', () => {
    const areas = [area({ metrics: [metric({ alarm: false })] })];
    const { container } = render(<AlarmBar areas={areas} />);

    expect(screen.getByText('Wszystko OK')).toBeInTheDocument();
    const chip = container.querySelector('[data-testid="alarm-chip-ok"]');
    expect(chip?.className).toMatch(/emerald/);
  });

  test('jeden alarm => jeden chip "Obszar — metryka" w kolorze rose z pulsowaniem', () => {
    const areas = [
      area({
        id: 'chlodnia-2',
        name: 'Chłodnia 2',
        metrics: [metric({ id: 'p', label: 'Ciśnienie wody na halę', alarm: true })],
      }),
    ];
    render(<AlarmBar areas={areas} />);

    const chip = screen.getByText('Chłodnia 2 — Ciśnienie wody na halę');
    expect(chip).toBeInTheDocument();
    expect(chip.className).toMatch(/rose/);
    expect(chip).toHaveClass('animate-pulse-subtle');
    expect(screen.queryByText('Wszystko OK')).not.toBeInTheDocument();
  });

  test('alarmy w wielu obszarach => jeden chip na każdy', () => {
    const areas = [
      area({
        id: 'chlodnia-1',
        name: 'Chłodnia 1',
        metrics: [metric({ id: 't1', label: 'Temperatura wody na halę', alarm: true })],
      }),
      area({
        id: 'sprezarkownia',
        name: 'Sprężarkownia',
        type: 'compressor',
        metrics: [metric({ id: 'drums', label: 'Magazyn Bębnów', alarm: true })],
      }),
    ];
    render(<AlarmBar areas={areas} />);

    expect(screen.getByText('Chłodnia 1 — Temperatura wody na halę')).toBeInTheDocument();
    expect(screen.getByText('Sprężarkownia — Magazyn Bębnów')).toBeInTheDocument();
  });

  test('po ustąpieniu alarmu (rerender bez alarmów) wraca do stanu "Wszystko OK"', () => {
    const withAlarm = [
      area({ metrics: [metric({ id: 'p', label: 'Ciśnienie wody na halę', alarm: true })] }),
    ];
    const withoutAlarm = [area({ metrics: [metric({ id: 'p', alarm: false })] })];

    const { rerender } = render(<AlarmBar areas={withAlarm} />);
    expect(screen.queryByText('Wszystko OK')).not.toBeInTheDocument();

    rerender(<AlarmBar areas={withoutAlarm} />);
    expect(screen.getByText('Wszystko OK')).toBeInTheDocument();
  });

  test('korzeń paska ma shrink-0 (nie może rozciągać layoutu kiosku)', () => {
    const { container } = render(<AlarmBar areas={[]} />);
    const root = container.querySelector('[data-testid="alarm-bar"]');
    expect(root).toHaveClass('shrink-0');
  });
});
