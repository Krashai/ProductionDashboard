import { describe, expect, test, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CompressorAreaView } from '@/components/areas/CompressorAreaView';
import type { AreaDefinition, DeviceGroupDefinition } from '@/lib/areas';
import type { AreaSnapshot, Metric } from '@/lib/types';

// Patrz uzasadnienie w CoolingAreaView.test.tsx — rAF nie odpala synchronicznie w jsdom.
vi.mock('@/components/Counter', () => ({
  Counter: ({ value, decimals = 1 }: { value: number; decimals?: number }) => (
    <>{value.toFixed(decimals)}</>
  ),
}));

const DEVICE_GROUPS: DeviceGroupDefinition[] = [
  {
    id: 'magazyn-aluminium',
    label: 'Magazyn Aluminium',
    devices: [
      {
        id: 'aluminium-1',
        label: 'Sprężarka 1',
        metricIds: { praca: 'sprezarkownia-aluminium-1-praca', awaria: 'sprezarkownia-aluminium-1-awaria' },
      },
      {
        id: 'aluminium-2',
        label: 'Sprężarka 2',
        metricIds: { praca: 'sprezarkownia-aluminium-2-praca', awaria: 'sprezarkownia-aluminium-2-awaria' },
      },
    ],
  },
  {
    id: 'magazyn-bebnow',
    label: 'Magazyn Bębnów',
    devices: [
      {
        id: 'bebny-1',
        label: 'Sprężarka 1',
        metricIds: { praca: 'sprezarkownia-bebny-1-praca', awaria: 'sprezarkownia-bebny-1-awaria' },
      },
      {
        id: 'bebny-2',
        label: 'Sprężarka 2',
        metricIds: { praca: 'sprezarkownia-bebny-2-praca', awaria: 'sprezarkownia-bebny-2-awaria' },
      },
    ],
  },
];

const definition: AreaDefinition = {
  id: 'sprezarkownia',
  name: 'Sprężarkownia',
  type: 'compressor',
  metrics: [
    { id: 'sprezarkownia-magazyn-aluminium-cisnienie-zbiornik', label: 'Magazyn Aluminium — Ciśnienie zbiornik', unit: 'bar', decimals: 2 },
    { id: 'sprezarkownia-magazyn-bebnow-cisnienie-zbiornik', label: 'Magazyn Bębnów — Ciśnienie zbiornik', unit: 'bar', decimals: 2 },
    { id: 'sprezarkownia-magazyn-bebnow-cisnienie-kolektor', label: 'Magazyn Bębnów — Ciśnienie kolektor', unit: 'bar', decimals: 2 },
    { id: 'sprezarkownia-magazyn-bebnow-przeplyw-powietrza', label: 'Magazyn Bębnów — Przepływ powietrza', unit: 'm³/min', decimals: 1 },
  ],
  deviceGroups: DEVICE_GROUPS,
};

function boolMetric(id: string, value: 0 | 1): Metric {
  return { id, label: id, value, unit: '', decimals: 0, history: [], alarm: false };
}

function analogMetric(overrides: Partial<Metric>): Metric {
  return {
    id: 'sprezarkownia-magazyn-aluminium-cisnienie-zbiornik',
    label: 'Magazyn Aluminium — Ciśnienie zbiornik',
    value: 7,
    unit: 'bar',
    decimals: 2,
    history: [6.8, 6.9, 7],
    alarm: false,
    ...overrides,
  };
}

function baseAnalogMetrics(): Metric[] {
  return [
    analogMetric({ id: 'sprezarkownia-magazyn-aluminium-cisnienie-zbiornik', label: 'Magazyn Aluminium — Ciśnienie zbiornik', value: 7 }),
    analogMetric({ id: 'sprezarkownia-magazyn-bebnow-cisnienie-zbiornik', label: 'Magazyn Bębnów — Ciśnienie zbiornik', value: 6.9, unit: 'bar', decimals: 2 }),
    analogMetric({ id: 'sprezarkownia-magazyn-bebnow-cisnienie-kolektor', label: 'Magazyn Bębnów — Ciśnienie kolektor', value: 6.5, unit: 'bar', decimals: 2 }),
    analogMetric({ id: 'sprezarkownia-magazyn-bebnow-przeplyw-powietrza', label: 'Magazyn Bębnów — Przepływ powietrza', value: 22.4, unit: 'm³/min', decimals: 1 }),
  ];
}

function runningDeviceMetrics(): Metric[] {
  return [
    boolMetric('sprezarkownia-aluminium-1-praca', 1),
    boolMetric('sprezarkownia-aluminium-1-awaria', 0),
    boolMetric('sprezarkownia-aluminium-2-praca', 1),
    boolMetric('sprezarkownia-aluminium-2-awaria', 0),
    boolMetric('sprezarkownia-bebny-1-praca', 1),
    boolMetric('sprezarkownia-bebny-1-awaria', 0),
    boolMetric('sprezarkownia-bebny-2-praca', 1),
    boolMetric('sprezarkownia-bebny-2-awaria', 0),
  ];
}

function snapshot(overrides: Partial<AreaSnapshot> = {}): AreaSnapshot {
  return {
    id: 'sprezarkownia',
    name: 'Sprężarkownia',
    type: 'compressor',
    isOnline: true,
    lastSeenAt: new Date().toISOString(),
    metrics: [...baseAnalogMetrics(), ...runningDeviceMetrics()],
    ...overrides,
  };
}

/** [rząd urządzeń, rząd odczytów] danej sekcji — oba są rodzicami kafli. */
function rowsOf(container: HTMLElement, deviceId: string): HTMLElement[] {
  const deviceRow = container.querySelector(`[data-testid="device-tile-${deviceId}"]`)!
    .parentElement as HTMLElement;
  const metricRow = deviceRow.nextElementSibling as HTMLElement;
  return [deviceRow, metricRow];
}

describe('CompressorAreaView', () => {
  test('renderuje obie sekcje: Magazyn Aluminium i Magazyn Bębnów', () => {
    const { getByText } = render(<CompressorAreaView area={snapshot()} definition={definition} />);
    expect(getByText('Magazyn Aluminium')).toBeInTheDocument();
    expect(getByText('Magazyn Bębnów')).toBeInTheDocument();
  });

  test('renderuje kafel dla każdej z 4 sprężarek (2 na sekcję)', () => {
    const { container } = render(<CompressorAreaView area={snapshot()} definition={definition} />);
    for (const id of ['aluminium-1', 'aluminium-2', 'bebny-1', 'bebny-2']) {
      expect(container.querySelector(`[data-testid="device-tile-${id}"]`)).toBeInTheDocument();
    }
  });

  test('urządzenie z praca=1 pokazuje kropkę PRACA jako emerald', () => {
    const { container } = render(<CompressorAreaView area={snapshot()} definition={definition} />);
    const tile = container.querySelector('[data-testid="device-tile-aluminium-1"]')!;
    expect(tile.querySelector('[data-testid="device-running-dot"]')?.className).toMatch(/bg-emerald-500/);
  });

  test('urządzenie z awaria=1 pokazuje migającą kropkę AWARIA', () => {
    const metrics = [...baseAnalogMetrics(), ...runningDeviceMetrics()];
    const fault = metrics.find((m) => m.id === 'sprezarkownia-bebny-1-awaria')!;
    fault.value = 1;
    const { container } = render(<CompressorAreaView area={snapshot({ metrics })} definition={definition} />);
    const tile = container.querySelector('[data-testid="device-tile-bebny-1"]')!;
    expect(tile.querySelector('[data-testid="device-fault-dot"]')?.className).toMatch(/animate-alarm-flash/);
  });

  test('isOnline===false propaguje offline do kafli urządzeń', () => {
    const { container } = render(<CompressorAreaView area={snapshot({ isOnline: false })} definition={definition} />);
    const tile = container.querySelector('[data-testid="device-tile-aluminium-1"]');
    expect(tile?.className).toMatch(/grayscale-\[0\.5\]/);
  });

  test('renderuje 1 kafel metryki dla Magazyn Aluminium i 3 dla Magazyn Bębnów', () => {
    const { container } = render(<CompressorAreaView area={snapshot()} definition={definition} />);
    expect(container.querySelector('[data-testid="metric-card-sprezarkownia-magazyn-aluminium-cisnienie-zbiornik"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="metric-card-sprezarkownia-magazyn-bebnow-cisnienie-zbiornik"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="metric-card-sprezarkownia-magazyn-bebnow-cisnienie-kolektor"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="metric-card-sprezarkownia-magazyn-bebnow-przeplyw-powietrza"]')).toBeInTheDocument();
  });

  // Regresja wizualnej weryfikacji (sierpień 2026, Playwright na 1366×768 i
  // 1920×1080): pełna etykieta z rejestru ("Magazyn Bębnów — Ciśnienie
  // kolektor") obcinała się w wąskim kaflu do "MAGAZYN BĘBNÓW — CIŚNIE…"
  // (`truncate` w OverviewMetricTile). Sekcja musi pokazywać skróconą
  // etykietę bez zbędnego, powtórzonego w nagłówku sekcji prefiksu.
  test('kafel metryki NIE powtarza nazwy sekcji w etykiecie (unika ucięcia "…")', () => {
    const { getByText, queryByText } = render(<CompressorAreaView area={snapshot()} definition={definition} />);
    expect(getByText('Ciśnienie zbiornik', { selector: '[data-testid="metric-card-sprezarkownia-magazyn-bebnow-cisnienie-zbiornik"] span' })).toBeInTheDocument();
    expect(getByText('Ciśnienie kolektor', { selector: '[data-testid="metric-card-sprezarkownia-magazyn-bebnow-cisnienie-kolektor"] span' })).toBeInTheDocument();
    expect(getByText('Przepływ powietrza', { selector: '[data-testid="metric-card-sprezarkownia-magazyn-bebnow-przeplyw-powietrza"] span' })).toBeInTheDocument();
    expect(queryByText('Magazyn Bębnów — Ciśnienie kolektor')).not.toBeInTheDocument();
  });

  test('alarm na jednej metryce propaguje się tylko do jej kafla', () => {
    const metrics = [...baseAnalogMetrics(), ...runningDeviceMetrics()];
    const zbiornik = metrics.find((m) => m.id === 'sprezarkownia-magazyn-bebnow-cisnienie-kolektor')!;
    zbiornik.alarm = true;
    const { container } = render(<CompressorAreaView area={snapshot({ metrics })} definition={definition} />);

    const alarmed = container.querySelector('[data-testid="metric-card-sprezarkownia-magazyn-bebnow-cisnienie-kolektor"]');
    const other = container.querySelector('[data-testid="metric-card-sprezarkownia-magazyn-bebnow-cisnienie-zbiornik"]');
    expect(alarmed).toHaveClass('animate-alarm-flash');
    expect(other).not.toHaveClass('animate-alarm-flash');
  });

  test('isOnline===false propaguje offline do wszystkich kafli metryk', () => {
    const { container } = render(<CompressorAreaView area={snapshot({ isOnline: false })} definition={definition} />);
    const card = container.querySelector('[data-testid="metric-card-sprezarkownia-magazyn-aluminium-cisnienie-zbiornik"]');
    expect(card?.className).toMatch(/grayscale-\[0\.5\]/);
  });

  // Spójność z CoolingAreaView (grupa pomp ma odpowiednik "N z M pracuje") —
  // review flag: brak było jakiegokolwiek nie-kolorowego sygnału "ile
  // sprężarek w tej sekcji pracuje" poza kolorem pojedynczej kropki.
  test('badge sekcji pokazuje "2 z 2 pracuje", gdy obie sprężarki mają praca=1', () => {
    const { container } = render(<CompressorAreaView area={snapshot()} definition={definition} />);
    const badge = container.querySelector('[data-testid="compressor-group-summary-magazyn-aluminium"]');
    expect(badge).toHaveTextContent('2 z 2 pracuje');
    expect(badge).not.toHaveClass('animate-alarm-flash');
  });

  test('badge sekcji miga rose, gdy co najmniej jedna sprężarka w tej sekcji ma awarię', () => {
    const metrics = [...baseAnalogMetrics(), ...runningDeviceMetrics()];
    const fault = metrics.find((m) => m.id === 'sprezarkownia-bebny-1-awaria')!;
    fault.value = 1;
    const { container } = render(<CompressorAreaView area={snapshot({ metrics })} definition={definition} />);
    const badge = container.querySelector('[data-testid="compressor-group-summary-magazyn-bebnow"]');
    expect(badge).toHaveClass('animate-alarm-flash');
  });
  // Regresja układu (zgłoszenie użytkownika, sierpień 2026 — ten sam defekt
  // co #42 w Concept.md, tyle że wywołany rozkładem `flex`): kafle metryk
  // miały `flex-1 min-w-[10rem]` w rzędzie `flex-1`, więc zabierały CAŁĄ
  // nadmiarową wysokość ekranu (645 px przy 1920×1080, treść w dwóch
  // przeciwległych rogach) i całą szerokość kolumny, gdy w sekcji był tylko
  // jeden odczyt (900 px wobec 284 px kafli sąsiedniej sekcji).
  describe('układ (kiosk bez scrolla)', () => {
    test('kolumny sekcji są ważone treścią, nie równe', () => {
      const { container } = render(<CompressorAreaView area={snapshot()} definition={definition} />);
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).toMatch(/grid-cols-\[2fr_3fr\]/);
      expect(root.className).not.toMatch(/(^|\s)grid-cols-2(\s|$)/);
    });

    test('oba rzędy sekcji mają tyle kolumn, ile wynosi waga jej kolumny (kafle tej samej szerokości w obu sekcjach)', () => {
      const { container } = render(<CompressorAreaView area={snapshot()} definition={definition} />);
      const aluminiumRows = rowsOf(container, 'aluminium-1');
      const bebnyRows = rowsOf(container, 'bebny-1');
      for (const row of aluminiumRows) expect(row.className).toMatch(/(^|\s)grid-cols-2(\s|$)/);
      for (const row of bebnyRows) expect(row.className).toMatch(/(^|\s)grid-cols-3(\s|$)/);
    });

    test('rząd urządzeń i rząd odczytów dzielą wysokość po połowie (żaden nie jest shrink-0)', () => {
      const { container } = render(<CompressorAreaView area={snapshot()} definition={definition} />);
      const [deviceRow, metricRow] = rowsOf(container, 'aluminium-1');
      expect(deviceRow.className).toMatch(/(^|\s)flex-1(\s|$)/);
      expect(metricRow.className).toMatch(/(^|\s)flex-1(\s|$)/);
      expect(deviceRow.className).toMatch(/(^|\s)min-h-0(\s|$)/);
      expect(metricRow.className).toMatch(/(^|\s)min-h-0(\s|$)/);
    });

    test('samotny kafel Magazynu Aluminium nie rozdyma się: bez flex-1/min-w na kaflu', () => {
      const { container } = render(<CompressorAreaView area={snapshot()} definition={definition} />);
      const tile = container.querySelector(
        '[data-testid="metric-card-sprezarkownia-magazyn-aluminium-cisnienie-zbiornik"]'
      ) as HTMLElement;
      expect(tile.className).not.toMatch(/(^|\s)flex-1(\s|$)/);
      expect(tile.className).not.toMatch(/min-w-\[/);
    });

    test('kafle odczytów są size="lg" z treścią wyśrodkowaną w pionie', () => {
      const { container } = render(<CompressorAreaView area={snapshot()} definition={definition} />);
      const tile = container.querySelector(
        '[data-testid="metric-card-sprezarkownia-magazyn-bebnow-cisnienie-kolektor"]'
      ) as HTMLElement;
      const inner = tile.lastElementChild as HTMLElement;
      expect(inner.className).toMatch(/(^|\s)justify-center(\s|$)/);
      // `text-6xl` to pierwszy stopień `size="lg"` (patrz OverviewMetricTile).
      expect(tile.querySelector('.font-mono')?.className).toMatch(/(^|\s)text-6xl(\s|$)/);
    });

    test('kafle urządzeń są size="lg" i wypełniają komórkę siatki (etykieta "Sprężarka 1" mieści się w jednej linii)', () => {
      const { container } = render(<CompressorAreaView area={snapshot()} definition={definition} />);
      const tile = container.querySelector('[data-testid="device-tile-bebny-2"]') as HTMLElement;
      expect(tile.className).not.toMatch(/(^|\s)2xl:w-56(\s|$)/);
      expect(tile.className).toMatch(/(^|\s)justify-center(\s|$)/);
      expect(tile.querySelector('[data-testid="device-running-dot"]')?.className).toMatch(
        /(^|\s)2xl:w-16(\s|$)/
      );
    });
  });
});
