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

// Regresja code-review (sierpień 2026): karta CoolingAreaView poprawnie
// tłumiła alarm temp/ciśnienia dla wyłączonej chłodni (pompy obiegowe nie
// pracują), ale ten globalny pasek o tym nie wiedział i nadal pulsował
// chipem dla tej samej metryki — sprzeczny sygnał dla operatora. Używa
// prawdziwych id z rejestru `AREAS` (`chlodnia-1-*`), bo `collectAlarms`
// wewnętrznie odpytuje `AREAS` po id obszaru, nie przyjmuje definicji jako
// parametru.
describe('collectAlarms — wyciszenie alarmu wyłączonej chłodni (pompy obiegowe)', () => {
  test('chłodnia wyłączona (żadna pompa nie pracuje): temp/ciśnienie wyciszone, poziom NIE', () => {
    const areas = [
      area({
        id: 'chlodnia-1',
        name: 'Chłodnia 1',
        metrics: [
          metric({ id: 'chlodnia-1-temp', label: 'Temperatura wody na halę', alarm: true }),
          metric({ id: 'chlodnia-1-pressure', label: 'Ciśnienie wody na halę', alarm: true }),
          metric({ id: 'chlodnia-1-level', label: 'Poziom wody w zbiorniku', alarm: true }),
        ],
      }),
    ];

    const alarms = collectAlarms(areas);
    expect(alarms.map((a) => a.metricId)).toEqual(['chlodnia-1-level']);
  });

  test('chłodnia pracuje (co najmniej jedna pompa PRACA=1): temp/ciśnienie NIE są wyciszone', () => {
    const areas = [
      area({
        id: 'chlodnia-1',
        name: 'Chłodnia 1',
        metrics: [
          metric({ id: 'chlodnia-1-temp', label: 'Temperatura wody na halę', alarm: true }),
          metric({ id: 'chlodnia-1-pressure', label: 'Ciśnienie wody na halę', alarm: true }),
          metric({ id: 'chlodnia-1-pompa-1-praca', label: 'Pompa 1 — Praca', value: 1, unit: '', alarm: false }),
        ],
      }),
    ];

    const alarms = collectAlarms(areas);
    expect(alarms.map((a) => a.metricId).sort()).toEqual(['chlodnia-1-pressure', 'chlodnia-1-temp']);
  });

  test('obszar niebędący chłodnią (np. Sprężarkownia): brak wyciszania, nawet dla id kończącego się na -temp', () => {
    const areas = [
      area({
        id: 'sprezarkownia',
        name: 'Sprężarkownia',
        type: 'compressor',
        metrics: [metric({ id: 'sprezarkownia-magazyn-aluminium-cisnienie-zbiornik', alarm: true })],
      }),
    ];

    expect(collectAlarms(areas).map((a) => a.metricId)).toEqual([
      'sprezarkownia-magazyn-aluminium-cisnienie-zbiornik',
    ]);
  });
});
