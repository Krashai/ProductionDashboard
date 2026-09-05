import { describe, expect, test, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CoolingAreaView } from '@/components/areas/CoolingAreaView';
import type { AreaDefinition, DeviceGroupDefinition } from '@/lib/areas';
import type { AreaSnapshot, Metric } from '@/lib/types';

// Patrz uzasadnienie w MetricCard.test.tsx — rAF nie odpala synchronicznie w jsdom.
vi.mock('@/components/Counter', () => ({
  Counter: ({ value, decimals = 1 }: { value: number; decimals?: number }) => (
    <>{value.toFixed(decimals)}</>
  ),
}));

const DEVICE_GROUPS: DeviceGroupDefinition[] = [
  {
    id: 'sprezarki',
    label: 'Sprężarki',
    devices: [
      { id: 'v101', label: 'V101', metricIds: { praca: 'chlodnia-1-v101-praca', awaria: 'chlodnia-1-v101-awaria' } },
      { id: 'v201', label: 'V201', metricIds: { praca: 'chlodnia-1-v201-praca', awaria: 'chlodnia-1-v201-awaria' } },
    ],
  },
  {
    id: 'pompy',
    label: 'Pompy obiegowe',
    devices: [
      {
        id: 'pompa-1',
        label: 'Pompa 1',
        metricIds: {
          praca: 'chlodnia-1-pompa-1-praca',
          awaria: 'chlodnia-1-pompa-1-awaria',
          hz: 'chlodnia-1-pompa-1-hz',
        },
      },
      { id: 'pompa-2', label: 'Pompa 2', metricIds: { praca: 'chlodnia-1-pompa-2-praca', awaria: 'chlodnia-1-pompa-2-awaria' } },
    ],
  },
];

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

const definitionWithDevices: AreaDefinition = { ...definition, deviceGroups: DEVICE_GROUPS };

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

function boolMetric(id: string, value: 0 | 1): Metric {
  return { id, label: id, value, unit: '', decimals: 0, history: [], alarm: false };
}

function baseMetrics(): Metric[] {
  return [
    metric({ id: 'chlodnia-1-temp', label: 'Temperatura wody na halę', unit: '°C', value: 5, decimals: 1 }),
    metric({ id: 'chlodnia-1-pressure', label: 'Ciśnienie wody na halę', unit: 'bar', value: 7, decimals: 2 }),
    metric({ id: 'chlodnia-1-level', label: 'Poziom wody w zbiorniku', unit: 'cm', value: 120, decimals: 0 }),
  ];
}

function snapshot(overrides: Partial<AreaSnapshot> = {}): AreaSnapshot {
  return {
    id: 'chlodnia-1',
    name: 'Chłodnia 1',
    type: 'cooling',
    isOnline: true,
    lastSeenAt: new Date().toISOString(),
    metrics: baseMetrics(),
    ...overrides,
  };
}

/** Wszystkie pompy pracują domyślnie — testy poza opisem "chłodnia wyłączona"
 * nie chcą przypadkowo trafić w warunek shutdown. */
function runningPumpMetrics(): Metric[] {
  return [
    boolMetric('chlodnia-1-v101-praca', 1),
    boolMetric('chlodnia-1-v101-awaria', 0),
    boolMetric('chlodnia-1-v201-praca', 1),
    boolMetric('chlodnia-1-v201-awaria', 0),
    boolMetric('chlodnia-1-pompa-1-praca', 1),
    boolMetric('chlodnia-1-pompa-1-awaria', 0),
    boolMetric('chlodnia-1-pompa-2-praca', 1),
    boolMetric('chlodnia-1-pompa-2-awaria', 0),
  ];
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

  test('używa maxCm z AreaDefinition do wyliczenia wypełnienia poziomu (OverviewTankTile)', () => {
    const { container } = render(<CoolingAreaView area={snapshot()} definition={definition} />);
    // OverviewTankTile (spójny z ekranem głównym) generuje testid wypełnienia
    // jako `overview-tank-fill-${testId}`, nie `tank-level-fill`.
    const fill = container.querySelector(
      '[data-testid="overview-tank-fill-tank-level-chlodnia-1-level"]'
    ) as HTMLElement;
    // 120 / 150 = 80%
    expect(fill.style.height).toBe('80%');
  });

  test('bez deviceGroups w definicji nie renderuje żadnych kafli urządzeń', () => {
    const { container } = render(<CoolingAreaView area={snapshot()} definition={definition} />);
    expect(container.querySelector('[data-testid^="device-tile-"]')).not.toBeInTheDocument();
  });

  describe('kafle urządzeń (deviceGroups obecne)', () => {
    test('renderuje kafel dla każdego urządzenia w każdej grupie', () => {
      const withDevices = snapshot({ metrics: [...baseMetrics(), ...runningPumpMetrics()] });
      const { container } = render(<CoolingAreaView area={withDevices} definition={definitionWithDevices} />);

      for (const id of ['v101', 'v201', 'pompa-1', 'pompa-2']) {
        expect(container.querySelector(`[data-testid="device-tile-${id}"]`)).toBeInTheDocument();
      }
    });

    test('urządzenie z praca=1 pokazuje kropkę PRACA jako emerald', () => {
      const withDevices = snapshot({ metrics: [...baseMetrics(), ...runningPumpMetrics()] });
      const { container } = render(<CoolingAreaView area={withDevices} definition={definitionWithDevices} />);
      const tile = container.querySelector('[data-testid="device-tile-v101"]')!;
      expect(tile.querySelector('[data-testid="device-running-dot"]')?.className).toMatch(/bg-emerald-500/);
    });

    test('urządzenie z awaria=1 pokazuje migającą kropkę AWARIA', () => {
      const metrics = [...baseMetrics(), ...runningPumpMetrics()];
      const v101Awaria = metrics.find((m) => m.id === 'chlodnia-1-v101-awaria')!;
      v101Awaria.value = 1;
      const withFault = snapshot({ metrics });
      const { container } = render(<CoolingAreaView area={withFault} definition={definitionWithDevices} />);
      const tile = container.querySelector('[data-testid="device-tile-v101"]')!;
      expect(tile.querySelector('[data-testid="device-fault-dot"]')?.className).toMatch(/animate-alarm-flash/);
    });

    test('Pompa 1 pokazuje wartość Hz, Pompa 2 (bez regulacji) nie', () => {
      const metrics = [...baseMetrics(), ...runningPumpMetrics()];
      metrics.push({ id: 'chlodnia-1-pompa-1-hz', label: 'Pompa 1 — Częstotliwość', value: 42.5, unit: 'Hz', decimals: 1, history: [], alarm: false });
      const withHz = snapshot({ metrics });
      const { container } = render(<CoolingAreaView area={withHz} definition={definitionWithDevices} />);

      const pompa1 = container.querySelector('[data-testid="device-tile-pompa-1"]')!;
      const pompa2 = container.querySelector('[data-testid="device-tile-pompa-2"]')!;
      expect(pompa1.textContent).toMatch(/42\.5/);
      // Pompa 2 (bez regulacji obrotów) nadal renderuje wiersz Hz w DOM —
      // rezerwuje jego wysokość, żeby rząd kafli pomp był symetryczny — ale
      // ten wiersz zostaje niewidoczny.
      expect(pompa2.querySelector('[data-testid="device-hz-row"]')).toHaveClass('invisible');
    });

    test('isOnline=false propaguje offline do kafli urządzeń', () => {
      const withDevices = snapshot({ metrics: [...baseMetrics(), ...runningPumpMetrics()], isOnline: false });
      const { container } = render(<CoolingAreaView area={withDevices} definition={definitionWithDevices} />);
      const tile = container.querySelector('[data-testid="device-tile-v101"]');
      expect(tile?.className).toMatch(/grayscale-\[0\.5\]/);
    });

    test('znacznik podsumowania grupy pokazuje liczbę pracujących urządzeń', () => {
      const withDevices = snapshot({ metrics: [...baseMetrics(), ...runningPumpMetrics()] });
      const { getByTestId } = render(<CoolingAreaView area={withDevices} definition={definitionWithDevices} />);
      expect(getByTestId('device-group-summary-sprezarki')).toHaveTextContent('2 z 2 pracuje');
      expect(getByTestId('device-group-summary-pompy')).toHaveTextContent('2 z 2 pracuje');
    });

    test('znacznik podsumowania grupy liczy tylko urządzenia z praca=1', () => {
      const metrics = [...baseMetrics(), ...runningPumpMetrics()];
      const v201Praca = metrics.find((m) => m.id === 'chlodnia-1-v201-praca')!;
      v201Praca.value = 0;
      const withDevices = snapshot({ metrics });
      const { getByTestId } = render(<CoolingAreaView area={withDevices} definition={definitionWithDevices} />);
      expect(getByTestId('device-group-summary-sprezarki')).toHaveTextContent('1 z 2 pracuje');
    });

    test('znacznik podsumowania grupy jest rose i miga, gdy dowolne urządzenie w grupie ma awarię', () => {
      const metrics = [...baseMetrics(), ...runningPumpMetrics()];
      const v101Awaria = metrics.find((m) => m.id === 'chlodnia-1-v101-awaria')!;
      v101Awaria.value = 1;
      const withFault = snapshot({ metrics });
      const { getByTestId } = render(<CoolingAreaView area={withFault} definition={definitionWithDevices} />);
      const badge = getByTestId('device-group-summary-sprezarki');
      expect(badge.className).toMatch(/bg-rose-50/);
      expect(badge.className).toMatch(/animate-alarm-flash/);
      // Awaria dotyczy tylko grupy "sprężarki" — grupa "pompy" zostaje neutralna.
      expect(getByTestId('device-group-summary-pompy').className).not.toMatch(/bg-rose-50/);
    });
  });

  describe('warunek "chłodnia wyłączona" (wszystkie pompy z grupy pompy mają praca=0)', () => {
    function shutdownMetrics(): Metric[] {
      return [
        ...baseMetrics(),
        boolMetric('chlodnia-1-v101-praca', 1),
        boolMetric('chlodnia-1-v101-awaria', 0),
        boolMetric('chlodnia-1-v201-praca', 1),
        boolMetric('chlodnia-1-v201-awaria', 0),
        boolMetric('chlodnia-1-pompa-1-praca', 0),
        boolMetric('chlodnia-1-pompa-1-awaria', 0),
        boolMetric('chlodnia-1-pompa-2-praca', 0),
        boolMetric('chlodnia-1-pompa-2-awaria', 0),
      ];
    }

    test('pokazuje baner "Chłodnia wyłączona" gdy wszystkie pompy stoją', () => {
      const shutdown = snapshot({ metrics: shutdownMetrics() });
      const { getByTestId } = render(<CoolingAreaView area={shutdown} definition={definitionWithDevices} />);
      expect(getByTestId('cooling-shutdown-banner')).toBeInTheDocument();
    });

    test('nie pokazuje banera, gdy przynajmniej jedna pompa pracuje', () => {
      const running = snapshot({ metrics: [...baseMetrics(), ...runningPumpMetrics()] });
      const { queryByTestId } = render(<CoolingAreaView area={running} definition={definitionWithDevices} />);
      expect(queryByTestId('cooling-shutdown-banner')).not.toBeInTheDocument();
    });

    test('nie pokazuje banera, gdy definicja nie ma grupy pomp (deviceGroups=undefined)', () => {
      const { queryByTestId } = render(<CoolingAreaView area={snapshot()} definition={definition} />);
      expect(queryByTestId('cooling-shutdown-banner')).not.toBeInTheDocument();
    });

    test('tłumi alarm temperatury/ciśnienia (alarm=false), mimo że metryka ma alarm=true', () => {
      const metrics = shutdownMetrics();
      const temp = metrics.find((m) => m.id === 'chlodnia-1-temp')!;
      temp.alarm = true;
      const pressure = metrics.find((m) => m.id === 'chlodnia-1-pressure')!;
      pressure.alarm = true;
      const shutdown = snapshot({ metrics });

      const { container } = render(<CoolingAreaView area={shutdown} definition={definitionWithDevices} />);
      const tempCard = container.querySelector('[data-testid="metric-card-chlodnia-1-temp"]');
      const pressureCard = container.querySelector('[data-testid="metric-card-chlodnia-1-pressure"]');
      expect(tempCard).not.toHaveClass('animate-alarm-flash');
      expect(pressureCard).not.toHaveClass('animate-alarm-flash');
    });

    test('NIE tłumi alarmu poziomu zbiornika (warunek dotyczy tylko temp/ciśnienia)', () => {
      const metrics = shutdownMetrics();
      const level = metrics.find((m) => m.id === 'chlodnia-1-level')!;
      level.alarm = true;
      const shutdown = snapshot({ metrics });

      const { container } = render(<CoolingAreaView area={shutdown} definition={definitionWithDevices} />);
      const tankBar = container.querySelector('[data-testid="tank-level-chlodnia-1-level"]');
      expect(tankBar).toHaveClass('animate-alarm-flash');
    });
  });
});
