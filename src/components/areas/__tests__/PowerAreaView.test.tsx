import { describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PowerAreaView } from '@/components/areas/PowerAreaView';
import type { AreaDefinition } from '@/lib/areas';
import type { AreaSnapshot, Metric } from '@/lib/types';

// Patrz komentarz w OverviewMetricTile.test.tsx: `Counter` animuje przez rAF,
// które nigdy nie odpala synchronicznie w jsdom.
vi.mock('@/components/Counter', () => ({
  Counter: ({ value, decimals = 1 }: { value: number; decimals?: number }) => (
    <>{value.toFixed(decimals)}</>
  ),
}));

const substations = [1, 2, 3];

// Kolejność MUSI odpowiadać kolejności grup w `PowerAreaView` (napięcia →
// prądy → moc → temperatura+THD) — testy niżej sprawdzają układ wiersz po
// wierszu, a nie tylko obecność kafli.
const SUFFIXES_BY_GROUP = [
  ['l1n', 'l2n', 'l3n'],
  ['prad-l1', 'prad-l2', 'prad-l3'],
  ['active', 'reactive', 'apparent'],
  ['temperatura', 'thdi', 'thdu'],
];
const ALL_SUFFIXES = SUFFIXES_BY_GROUP.flat();

function metricDefsFor(n: number) {
  return [
    { id: `trafostacja-${n}-l1n`, label: `Trafostacja ${n} — L1N`, unit: 'V', decimals: 0 },
    { id: `trafostacja-${n}-l2n`, label: `Trafostacja ${n} — L2N`, unit: 'V', decimals: 0 },
    { id: `trafostacja-${n}-l3n`, label: `Trafostacja ${n} — L3N`, unit: 'V', decimals: 0 },
    { id: `trafostacja-${n}-prad-l1`, label: `Trafostacja ${n} — L1 (prąd)`, unit: 'A', decimals: 1 },
    { id: `trafostacja-${n}-prad-l2`, label: `Trafostacja ${n} — L2 (prąd)`, unit: 'A', decimals: 1 },
    { id: `trafostacja-${n}-prad-l3`, label: `Trafostacja ${n} — L3 (prąd)`, unit: 'A', decimals: 1 },
    { id: `trafostacja-${n}-active`, label: `Trafostacja ${n} — Moc czynna`, unit: 'kW', decimals: 1 },
    { id: `trafostacja-${n}-reactive`, label: `Trafostacja ${n} — Moc bierna`, unit: 'kVAr', decimals: 1 },
    { id: `trafostacja-${n}-apparent`, label: `Trafostacja ${n} — Moc pozorna`, unit: 'kVA', decimals: 1 },
    { id: `trafostacja-${n}-temperatura`, label: `Trafostacja ${n} — Temperatura`, unit: '°C', decimals: 1 },
    { id: `trafostacja-${n}-thdi`, label: `Trafostacja ${n} — THDi`, unit: '%', decimals: 1 },
    { id: `trafostacja-${n}-thdu`, label: `Trafostacja ${n} — THDu`, unit: '%', decimals: 1 },
  ];
}

const definition: AreaDefinition = {
  id: 'energia-elektryczna',
  name: 'Energia elektryczna',
  type: 'power',
  metrics: substations.flatMap(metricDefsFor),
};

function metric(overrides: Partial<Metric>): Metric {
  return {
    id: 'trafostacja-1-active',
    label: 'Trafostacja 1 — Moc czynna',
    value: 200,
    unit: 'kW',
    decimals: 1,
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
      metric({ id: def.id, label: def.label, unit: def.unit, decimals: def.decimals, value: 42 })
    ),
    ...overrides,
  };
}

function tile(id: string): HTMLElement {
  const el = document.querySelector(`[data-testid="metric-card-${id}"]`);
  expect(el).toBeInTheDocument();
  return el as HTMLElement;
}

describe('PowerAreaView', () => {
  test('renderuje dokładnie 3 karty trafostacji (Trafostacja 1/2/3)', () => {
    const { container } = render(<PowerAreaView area={snapshot()} definition={definition} />);

    expect(container.querySelectorAll('[data-testid^="substation-card-trafostacja-"]')).toHaveLength(3);
    expect(screen.getByText('Trafostacja 1')).toBeInTheDocument();
    expect(screen.getByText('Trafostacja 2')).toBeInTheDocument();
    expect(screen.getByText('Trafostacja 3')).toBeInTheDocument();
  });

  test('grid ma dokładnie 3 równe kolumny na pełną wysokość (notatki źródłowe: trzy równe kolumny)', () => {
    const { container } = render(<PowerAreaView area={snapshot()} definition={definition} />);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toMatch(/grid/);
    expect(grid.className).toMatch(/grid-cols-3/);
    expect(grid.className).toMatch(/h-full/);
  });

  test('każda karta ma 12 kafli metryk (3 kolumny × 4 rzędy)', () => {
    render(<PowerAreaView area={snapshot()} definition={definition} />);

    for (const n of substations) {
      const card = document.querySelector(
        `[data-testid="substation-card-trafostacja-${n}"]`
      ) as HTMLElement;
      const tiles = card.querySelectorAll('[data-testid^="metric-card-trafostacja-"]');
      expect(tiles).toHaveLength(12);
    }
  });

  test('kafle są pogrupowane pod nagłówkami Napięcia/Prądy/Moc/Temperatura i THD', () => {
    render(<PowerAreaView area={snapshot()} definition={definition} />);

    expect(screen.getAllByText('Napięcia')).toHaveLength(3);
    expect(screen.getAllByText('Prądy')).toHaveLength(3);
    expect(screen.getAllByText('Moc')).toHaveLength(3);
    expect(screen.getAllByText('Temperatura i THD')).toHaveLength(3);
  });

  test('każdy rząd grupy zawiera dokładnie swoje 3 kafle, w kolejności z notatek', () => {
    render(<PowerAreaView area={snapshot()} definition={definition} />);

    for (const n of substations) {
      SUFFIXES_BY_GROUP.forEach((suffixes, groupIndex) => {
        const row = document.querySelector(
          `[data-testid="substation-row-trafostacja-${n}-${groupIndex}"]`
        ) as HTMLElement;
        expect(row).toBeInTheDocument();
        const tiles = row.querySelectorAll('[data-testid^="metric-card-"]');
        expect(Array.from(tiles).map((t) => t.getAttribute('data-testid'))).toEqual(
          suffixes.map((suffix) => `metric-card-trafostacja-${n}-${suffix}`)
        );
      });
    }
  });

  test('renderuje wszystkie 36 kafli (3 trafostacje × 12 metryk)', () => {
    const { container } = render(<PowerAreaView area={snapshot()} definition={definition} />);
    expect(container.querySelectorAll('[data-testid^="metric-card-trafostacja-"]')).toHaveLength(36);

    for (const n of substations) {
      for (const suffix of ALL_SUFFIXES) {
        expect(tile(`trafostacja-${n}-${suffix}`)).toBeInTheDocument();
      }
    }
  });

  test('etykieta kafla nie powtarza nazwy trafostacji (nagłówek karty już ją niesie)', () => {
    render(<PowerAreaView area={snapshot()} definition={definition} />);

    expect(within(tile('trafostacja-2-active')).getByText('Czynna')).toBeInTheDocument();
    expect(within(tile('trafostacja-2-l1n')).getByText('L1N')).toBeInTheDocument();
    expect(within(tile('trafostacja-2-thdu')).getByText('THDu')).toBeInTheDocument();
    expect(screen.queryByText('Trafostacja 2 — Moc czynna')).not.toBeInTheDocument();
  });

  // Etykiety kafli są skracane WYŁĄCZNIE na wyświetlaniu (patrz `GROUPS` w
  // PowerAreaView.tsx). Rejestr w `src/lib/areas.ts` musi zachować pełne
  // "Trafostacja 2 — Moc czynna", bo tylko stamtąd `AlarmBar` wie, której
  // trafostacji dotyczy alarm.
  describe('krótkie etykiety kafli (nagłówek grupy niesie wycięte słowo)', () => {
    test.each([
      ['active', 'Czynna'],
      ['reactive', 'Bierna'],
      ['apparent', 'Pozorna'],
      ['prad-l1', 'L1'],
      ['prad-l2', 'L2'],
      ['prad-l3', 'L3'],
      ['l1n', 'L1N'],
      ['l2n', 'L2N'],
      ['l3n', 'L3N'],
      ['temperatura', 'Temperatura'],
      ['thdi', 'THDi'],
      ['thdu', 'THDu'],
    ])('kafel %s ma etykietę "%s"', (suffix, expected) => {
      render(<PowerAreaView area={snapshot()} definition={definition} />);
      for (const n of substations) {
        expect(within(tile(`trafostacja-${n}-${suffix}`)).getByText(expected)).toBeInTheDocument();
      }
    });

    test('słowo "Moc" nie pada już na żadnym kaflu — tylko w nagłówku grupy (3×)', () => {
      render(<PowerAreaView area={snapshot()} definition={definition} />);

      expect(screen.queryByText(/^Moc /)).not.toBeInTheDocument();
      expect(screen.getAllByText('Moc')).toHaveLength(3);
    });

    test('"(prąd)" zniknął z etykiet — grupę odróżnia nagłówek PRĄDY', () => {
      render(<PowerAreaView area={snapshot()} definition={definition} />);

      expect(screen.queryByText(/\(prąd\)/)).not.toBeInTheDocument();
      expect(screen.getAllByText('Prądy')).toHaveLength(3);
    });

    test('prądowe L1 i napięciowe L1N zostają rozróżnialne mimo skrócenia', () => {
      render(<PowerAreaView area={snapshot()} definition={definition} />);

      // Dokładnie 3 kafle "L1" (po jednym na trafostację) — `getAllByText`
      // dopasowuje pełną treść, więc "L1N" tu nie wpada.
      expect(screen.getAllByText('L1')).toHaveLength(3);
      expect(screen.getAllByText('L1N')).toHaveLength(3);
    });
  });

  describe('pasek asymetrii faz', () => {
    function bars(root: HTMLElement) {
      return Array.from(root.querySelectorAll('[data-testid^="phase-bar-"]')).map((el) =>
        el.getAttribute('data-testid')
      );
    }

    test('paski są dokładnie na 6 kaflach fazowych każdej trafostacji, nigdzie indziej', () => {
      const { container } = render(<PowerAreaView area={snapshot()} definition={definition} />);

      expect(bars(container)).toHaveLength(18); // 3 trafostacje × 6 faz

      for (const n of substations) {
        const card = document.querySelector(
          `[data-testid="substation-card-trafostacja-${n}"]`
        ) as HTMLElement;
        expect(bars(card).sort()).toEqual(
          ['l1n', 'l2n', 'l3n', 'prad-l1', 'prad-l2', 'prad-l3']
            .map((suffix) => `phase-bar-trafostacja-${n}-${suffix}`)
            .sort()
        );
      }
    });

    test.each(['active', 'reactive', 'apparent', 'temperatura', 'thdi', 'thdu'])(
      'kafel %s NIE ma paska (nie ma czego do czego normalizować)',
      (suffix) => {
        render(<PowerAreaView area={snapshot()} definition={definition} />);
        expect(
          tile(`trafostacja-1-${suffix}`).querySelector('[data-testid^="phase-bar-"]')
        ).not.toBeInTheDocument();
      }
    );

    test('pasek jest w środku kafla — między wartością a etykietą, nie pod etykietą', () => {
      render(<PowerAreaView area={snapshot()} definition={definition} />);
      const inner = tile('trafostacja-1-l1n').lastElementChild as HTMLElement;

      expect(inner.children).toHaveLength(3);
      expect(inner.children[1].getAttribute('data-testid')).toBe('phase-bar-trafostacja-1-l1n');
      expect(inner.lastElementChild?.textContent).toBe('L1N');
    });

    /** Geometria paska rozbieżnego: `left` = lewa krawędź w % toru,
     * `width` = |odchyłka| × 50%. Środek toru to 50%. */
    function geometry(id: string) {
      const fill = document.querySelector(`[data-testid="phase-fill-${id}"]`) as HTMLElement;
      const left = Number.parseFloat(fill.style.left);
      const width = Number.parseFloat(fill.style.width);
      return { left, width, right: left + width };
    }

    function renderWithValues(values: Record<string, number>, fallback = 42) {
      const skewed = snapshot({
        metrics: definition.metrics.map((def) =>
          metric({ ...def, value: values[def.id] ?? fallback })
        ),
      });
      return render(<PowerAreaView area={skewed} definition={definition} />);
    }

    test('każdy pasek ma widoczny znacznik zera — bez linii bazowej pasek rozbieżny jest nieczytelny', () => {
      const { container } = render(<PowerAreaView area={snapshot()} definition={definition} />);

      const ticks = container.querySelectorAll('[data-testid^="phase-zero-"]');
      expect(ticks).toHaveLength(18);
      expect((ticks[0] as HTMLElement).className).toMatch(/left-1\/2/);
    });

    test('idealna symetria: wszystkie trzy paski mają zerową długość i stoją w środku toru', () => {
      renderWithValues({
        'trafostacja-1-l1n': 230,
        'trafostacja-1-l2n': 230,
        'trafostacja-1-l3n': 230,
      });

      for (const suffix of ['l1n', 'l2n', 'l3n']) {
        expect(geometry(`trafostacja-1-${suffix}`)).toEqual({ left: 50, width: 0, right: 50 });
      }
    });

    test('faza poniżej średniej rośnie w LEWO od środka, powyżej — w PRAWO', () => {
      // Arrange — średnia 232 V, odchyłki −0,862% / −3,017% / +3,879%; przy
      // skali ±10% to −8,6% / −30,2% / +38,8% połowy toru.
      renderWithValues({
        'trafostacja-1-l1n': 230,
        'trafostacja-1-l2n': 225,
        'trafostacja-1-l3n': 241,
      });

      // Act
      const low = geometry('trafostacja-1-l2n');
      const high = geometry('trafostacja-1-l3n');
      const slight = geometry('trafostacja-1-l1n');

      // Assert — pasek fazy poniżej średniej KOŃCZY się na środku, powyżej
      // średniej ZACZYNA się na środku. Oba są zaczepione w zerze.
      expect(low.right).toBeCloseTo(50, 6);
      expect(low.width).toBeCloseTo(15.086, 2);
      expect(high.left).toBeCloseTo(50, 6);
      expect(high.width).toBeCloseTo(19.397, 2);
      expect(slight.right).toBeCloseTo(50, 6);
      expect(slight.width).toBeCloseTo(4.31, 2);
    });

    test('koniec przy zerze jest kwadratowy, koniec niosący wartość — zaokrąglony', () => {
      renderWithValues({
        'trafostacja-1-l1n': 220,
        'trafostacja-1-l2n': 230,
        'trafostacja-1-l3n': 240,
      });

      const className = (id: string) =>
        (document.querySelector(`[data-testid="phase-fill-${id}"]`) as HTMLElement).className;

      expect(className('trafostacja-1-l1n')).toMatch(/rounded-l-full/);
      expect(className('trafostacja-1-l3n')).toMatch(/rounded-r-full/);
    });

    test('napięcia mają ciaśniejszą skalę niż prądy: ten sam rozjazd procentowy daje dłuższy pasek napięcia', () => {
      // Ta sama asymetria (+5% na trzeciej fazie) w obu grupach.
      renderWithValues({
        'trafostacja-1-l1n': 100,
        'trafostacja-1-l2n': 100,
        'trafostacja-1-l3n': 105,
        'trafostacja-1-prad-l1': 100,
        'trafostacja-1-prad-l2': 100,
        'trafostacja-1-prad-l3': 105,
      });

      const voltage = geometry('trafostacja-1-l3n');
      const current = geometry('trafostacja-1-prad-l3');

      // ±10% vs ±25% → dokładnie 2,5× dłuższy pasek napięciowy.
      expect(voltage.width / current.width).toBeCloseTo(2.5, 6);
    });

    test('rozjazd większy od skali przycina się do krawędzi toru, nie wyjeżdża poza kafel', () => {
      // Realny odczyt z mocka: 58,1 / 99,6 / 40,2 A → średnia 65,97, czyli
      // +51% dla L2 przy skali ±25%.
      renderWithValues({
        'trafostacja-1-prad-l1': 58.1,
        'trafostacja-1-prad-l2': 99.6,
        'trafostacja-1-prad-l3': 40.2,
      });

      const clamped = geometry('trafostacja-1-prad-l2');
      expect(clamped.left).toBe(50);
      expect(clamped.width).toBe(50);
      expect(clamped.right).toBe(100);
    });

    test('punkt zerowy jest lokalny: obciążenie innej trafostacji nie przesuwa pasków tej', () => {
      renderWithValues(
        Object.fromEntries(
          definition.metrics.map((def) => [
            def.id,
            // Trafostacja 2 dziesięciokrotnie mocniejsza od Trafostacji 1,
            // ale obie idealnie symetryczne.
            def.id.startsWith('trafostacja-2-') ? 1000 : 100,
          ])
        )
      );

      for (const n of substations) {
        for (const suffix of ['prad-l1', 'prad-l2', 'prad-l3']) {
          expect(geometry(`trafostacja-${n}-${suffix}`).width).toBe(0);
        }
      }
    });

    test('średnia nie miesza grup: prądy nie liczą się względem napięć', () => {
      // Napięcia ~230 V, prądy ~20 A. Gdyby średnia była wspólna, prądy
      // wyszłyby daleko poniżej niej i przykleiły się do lewej krawędzi.
      renderWithValues(
        Object.fromEntries(
          definition.metrics.map((def) => [
            def.id,
            def.unit === 'V' ? 230 : def.unit === 'A' ? 20 : 42,
          ])
        )
      );

      expect(geometry('trafostacja-1-prad-l2')).toEqual({ left: 50, width: 0, right: 50 });
    });

    test('offline: paska nie ma wcale (kafel pokazuje "—", żaden pasek nie udaje odczytu)', () => {
      const { container } = render(
        <PowerAreaView area={snapshot({ isOnline: false })} definition={definition} />
      );
      expect(bars(container)).toHaveLength(0);
    });

    test('alarm na kaflu fazowym barwi też jego pasek na rose (kafel jest różowy w całości)', () => {
      const withAlarm = snapshot({
        metrics: definition.metrics.map((def) =>
          metric({ ...def, value: 42, alarm: def.id === 'trafostacja-2-prad-l2' })
        ),
      });
      render(<PowerAreaView area={withAlarm} definition={definition} />);

      const alarmed = document.querySelector(
        '[data-testid="phase-fill-trafostacja-2-prad-l2"]'
      ) as HTMLElement;
      const calm = document.querySelector(
        '[data-testid="phase-fill-trafostacja-2-prad-l1"]'
      ) as HTMLElement;

      expect(alarmed.className).toMatch(/bg-rose-400/);
      expect(calm.className).toMatch(/bg-slate-400/);
      expect(calm.className).not.toMatch(/rose/);
    });

    test('zerowe odczyty faz dają paski w środku toru zamiast NaN w stylu', () => {
      const dead = snapshot({
        metrics: definition.metrics.map((def) => metric({ ...def, value: 0 })),
      });
      render(<PowerAreaView area={dead} definition={definition} />);

      const fill = document.querySelector(
        '[data-testid="phase-fill-trafostacja-1-l1n"]'
      ) as HTMLElement;
      expect(fill.style.width).toBe('0%');
      expect(fill.style.left).toBe('50%');
    });
  });

  test('kafel pokazuje jednostkę metryki', () => {
    render(<PowerAreaView area={snapshot()} definition={definition} />);
    expect(within(tile('trafostacja-1-active')).getByText('kW')).toBeInTheDocument();
    expect(within(tile('trafostacja-1-reactive')).getByText('kVAr')).toBeInTheDocument();
    expect(within(tile('trafostacja-1-l1n')).getByText('V')).toBeInTheDocument();
  });

  test('alarm na jednej metryce miga tylko na jej kaflu (decyzja #16)', () => {
    const withAlarm = snapshot({
      metrics: definition.metrics.map((def) =>
        metric({
          id: def.id,
          label: def.label,
          unit: def.unit,
          decimals: def.decimals,
          value: 42,
          alarm: def.id === 'trafostacja-2-reactive',
        })
      ),
    });
    const { container } = render(<PowerAreaView area={withAlarm} definition={definition} />);

    expect(tile('trafostacja-2-reactive')).toHaveClass('animate-alarm-flash');
    expect(tile('trafostacja-1-active')).not.toHaveClass('animate-alarm-flash');
    expect(
      container.querySelectorAll('[data-testid^="metric-card-"].animate-alarm-flash')
    ).toHaveLength(1);
  });

  test('isOnline===false propaguje offline do wszystkich 36 kafli', () => {
    const { container } = render(
      <PowerAreaView area={snapshot({ isOnline: false })} definition={definition} />
    );

    const tiles = container.querySelectorAll('[data-testid^="metric-card-trafostacja-"]');
    expect(tiles).toHaveLength(36);
    for (const el of tiles) {
      expect((el as HTMLElement).className).toMatch(/grayscale-\[0\.5\]/);
    }
    expect(screen.getAllByText('—')).toHaveLength(36);
  });

  test('brakująca metryka w snapshocie nie wywraca renderu (karta pokazuje pozostałe kafle)', () => {
    const partial = snapshot({
      metrics: snapshot().metrics.filter((m) => m.id !== 'trafostacja-3-thdu'),
    });
    const { container } = render(<PowerAreaView area={partial} definition={definition} />);

    expect(container.querySelectorAll('[data-testid^="metric-card-trafostacja-"]')).toHaveLength(35);
    expect(
      container.querySelector('[data-testid="metric-card-trafostacja-3-thdu"]')
    ).not.toBeInTheDocument();
  });
});
