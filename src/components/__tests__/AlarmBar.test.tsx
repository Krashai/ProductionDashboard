import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AlarmBar, collectAlarms } from '@/components/AlarmBar';
import { STALE_HOLD_MS } from '@/lib/staleness';
import type { AreaSnapshot, Metric } from '@/lib/types';

const NOW = 1_700_000_000_000;

// jsdom nie liczy prawdziwego layoutu — `scrollWidth`/`clientWidth` są zawsze
// 0, więc żeby przetestować detekcję przepełnienia trzeba je podstawić
// ręcznie na prototypie (wszystkie elementy w danym teście "widzą" te same
// wymiary, co wystarcza — komponent porównuje tylko dwa konkretne elementy).
function mockLayout({ trackWidth, viewportWidth }: { trackWidth: number; viewportWidth: number }) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(trackWidth);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(viewportWidth);
}

// jsdom nie implementuje `matchMedia` w ogóle (zweryfikowane ręcznie) —
// komponent ma na to strażniczkę (traktuje brak API jak "ruch
// niezredukowany"), ale test `prefers-reduced-motion` musi je podstawić.
function mockPrefersReducedMotion(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    dispatchEvent: vi.fn(),
  }));
}

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
    lastFreshAt: NOW,
    metrics: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error -- jsdom nie ma tej właściwości domyślnie, przywracamy brak
  delete window.matchMedia;
});

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
      { areaId: 'chlodnia-2', areaName: 'Chłodnia 2', metricId: 'p', metricLabel: 'Ciśnienie wody na halę', description: null },
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
    const { container } = render(<AlarmBar areas={areas} status="live" now={NOW} />);

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
    render(<AlarmBar areas={areas} status="live" now={NOW} />);

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
    render(<AlarmBar areas={areas} status="live" now={NOW} />);

    expect(screen.getByText('Chłodnia 1 — Temperatura wody na halę')).toBeInTheDocument();
    expect(screen.getByText('Sprężarkownia — Magazyn Bębnów')).toBeInTheDocument();
  });

  test('po ustąpieniu alarmu (rerender bez alarmów) wraca do stanu "Wszystko OK"', () => {
    const withAlarm = [
      area({ metrics: [metric({ id: 'p', label: 'Ciśnienie wody na halę', alarm: true })] }),
    ];
    const withoutAlarm = [area({ metrics: [metric({ id: 'p', alarm: false })] })];

    const { rerender } = render(<AlarmBar areas={withAlarm} status="live" now={NOW} />);
    expect(screen.queryByText('Wszystko OK')).not.toBeInTheDocument();

    rerender(<AlarmBar areas={withoutAlarm} status="live" now={NOW} />);
    expect(screen.getByText('Wszystko OK')).toBeInTheDocument();
  });

  test('korzeń paska ma shrink-0 (nie może rozciągać layoutu kiosku)', () => {
    const { container } = render(<AlarmBar areas={[]} status="live" now={NOW} />);
    const root = container.querySelector('[data-testid="alarm-bar"]');
    expect(root).toHaveClass('shrink-0');
  });
});

// Konwersja na jednowierszowy ticker (wrzesień 2026): `flex-wrap` przy dużej
// liczbie jednoczesnych alarmów rósł bez ograniczeń i zjadał miejsce głównej
// treści kiosku (brak scrolla na `h-screen overflow-hidden`). Poniżej trzy
// stany layoutu, rozróżniane WYŁĄCZNIE przez zmierzone `scrollWidth`/
// `clientWidth` (podstawione ręcznie — jsdom ich nie liczy) i `matchMedia`.
describe('AlarmBar — pasek jednowierszowy (ticker) przy przepełnieniu', () => {
  test('chipy mieszczą się w jednym wierszu => bez duplikatu toru i bez animacji (jak dziś)', async () => {
    mockLayout({ trackWidth: 200, viewportWidth: 2000 });
    const areas = [
      area({
        id: 'chlodnia-2',
        name: 'Chłodnia 2',
        metrics: [metric({ id: 'p', label: 'Ciśnienie wody na halę', alarm: true })],
      }),
    ];

    render(<AlarmBar areas={areas} status="live" now={NOW} />);

    await waitFor(() => {
      expect(screen.getByTestId('alarm-marquee-track')).not.toHaveClass('animate-alarm-marquee');
    });
    expect(screen.queryByTestId('alarm-marquee-track-duplicate')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('alarm-chip-chlodnia-2-p')).toHaveLength(1);
    expect(screen.getByTestId('alarm-marquee-viewport')).toHaveClass('overflow-hidden');
  });

  test('przepełnienie + ruch niezredukowany => zdublowany tor animowany (ticker)', async () => {
    mockLayout({ trackWidth: 5000, viewportWidth: 1000 });
    mockPrefersReducedMotion(false);
    const areas = [
      area({
        id: 'chlodnia-2',
        name: 'Chłodnia 2',
        metrics: [metric({ id: 'p', label: 'Ciśnienie wody na halę', alarm: true })],
      }),
    ];

    render(<AlarmBar areas={areas} status="live" now={NOW} />);

    await waitFor(() => {
      expect(screen.getByTestId('alarm-marquee-track')).toHaveClass('animate-alarm-marquee');
    });
    expect(screen.getByTestId('alarm-marquee-track-duplicate')).toBeInTheDocument();
    // Stabilny, niekruchy sygnał: lista chipów pojawia się dwukrotnie (oryginał
    // + kopia do pętli), a nie konkretna wyliczona wartość animation-duration.
    expect(screen.getAllByTestId('alarm-chip-chlodnia-2-p')).toHaveLength(2);
    expect(screen.getByTestId('alarm-marquee-viewport')).toHaveClass('overflow-hidden');
  });

  test('przepełnienie + prefers-reduced-motion => zwykły scroll, bez duplikatu i bez animacji', async () => {
    mockLayout({ trackWidth: 5000, viewportWidth: 1000 });
    mockPrefersReducedMotion(true);
    const areas = [
      area({
        id: 'chlodnia-2',
        name: 'Chłodnia 2',
        metrics: [metric({ id: 'p', label: 'Ciśnienie wody na halę', alarm: true })],
      }),
    ];

    render(<AlarmBar areas={areas} status="live" now={NOW} />);

    await waitFor(() => {
      expect(screen.getByTestId('alarm-marquee-viewport')).toHaveClass('overflow-x-auto');
    });
    expect(screen.getByTestId('alarm-marquee-track')).not.toHaveClass('animate-alarm-marquee');
    expect(screen.queryByTestId('alarm-marquee-track-duplicate')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('alarm-chip-chlodnia-2-p')).toHaveLength(1);
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

// Okno wstrzymania (decyzja użytkownika 2026-10-26): gdy dane nie są świeże,
// pasek NIE może mówić "Wszystko OK" — tłumaczy sytuację chipem ze stanem.
describe('AlarmBar — komunikaty o stanie danych (tabela decyzji)', () => {
  const alarmingArea = (id: string, name: string, overrides: Partial<AreaSnapshot> = {}) =>
    area({
      id,
      name,
      metrics: [metric({ id: `${id}-alarm`, label: 'Ciśnienie wody na halę', alarm: true })],
      ...overrides,
    });

  const offlineSince = (ageMs: number): Partial<AreaSnapshot> => ({ isOnline: false, lastFreshAt: NOW - ageMs });

  function renderOffline(ageMs: number) {
    const stale = [
      alarmingArea('chlodnia-1', 'Chłodnia 1', offlineSince(ageMs)),
      alarmingArea('chlodnia-2', 'Chłodnia 2', offlineSince(ageMs)),
    ];
    return render(<AlarmBar areas={stale} status="offline" now={NOW} />);
  }

  test('WS utracone < 2 min: TYLKO bursztynowy chip z wiekiem, bez alarmów i bez "Wszystko OK"', () => {
    renderOffline(23_000);

    const chip = screen.getByTestId('status-chip-connection');
    expect(chip).toHaveTextContent('Wznawianie połączenia — dane sprzed 23 s');
    expect(chip.className).toMatch(/bg-amber-50/);
    expect(chip.className).toMatch(/border-amber-100/);
    expect(chip.className).toMatch(/text-amber-800/);
    expect(screen.queryByText('Wszystko OK')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^alarm-chip-/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/^status-chip-/)).toHaveLength(1);
  });

  test('WS utracone >= 2 min: TYLKO różowy chip "Brak połączenia od N min", bez pulsowania', () => {
    renderOffline(3 * 60_000);

    const chip = screen.getByTestId('status-chip-connection');
    expect(chip).toHaveTextContent('Brak połączenia od 3 min');
    expect(chip.className).toMatch(/bg-rose-50/);
    expect(chip.className).toMatch(/text-rose-800/);
    expect(chip.className).not.toMatch(/animate-pulse/);
    expect(screen.queryByText('Wszystko OK')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^alarm-chip-/)).toHaveLength(0);
  });

  test('nigdy nie dostano danych (connecting, brak obszarów): chip "Łączenie z serwerem…", nie "Wszystko OK"', () => {
    render(<AlarmBar areas={[]} status="connecting" now={NOW} />);

    expect(screen.getByTestId('status-chip-connection')).toHaveTextContent('Łączenie z serwerem…');
    expect(screen.getByTestId('status-chip-connection').className).toMatch(/bg-amber-50/);
    expect(screen.queryByText('Wszystko OK')).not.toBeInTheDocument();
  });

  test('status offline, ale żadnej ramki jeszcze nie było: też "Łączenie z serwerem…"', () => {
    const neverFresh = [area({ id: 'chlodnia-1', name: 'Chłodnia 1', isOnline: false, lastFreshAt: null })];
    render(<AlarmBar areas={neverFresh} status="offline" now={NOW} />);

    expect(screen.getByTestId('status-chip-connection')).toHaveTextContent('Łączenie z serwerem…');
    expect(screen.queryByText('Wszystko OK')).not.toBeInTheDocument();
  });

  test('"Wszystko OK" nie pojawia się przy żadnym statusie innym niż live', () => {
    const healthy = [area({ metrics: [metric({ alarm: false })] })];
    for (const status of ['connecting', 'offline'] as const) {
      const { unmount } = render(<AlarmBar areas={healthy} status={status} now={NOW} />);
      expect(screen.queryByText('Wszystko OK')).not.toBeInTheDocument();
      unmount();
    }
  });

  test('WS live, obszar offline < 2 min: bursztynowy chip obszaru; jego alarmy ukryte, alarmy żywych obszarów widoczne', () => {
    const areas = [
      alarmingArea('chlodnia-1', 'Chłodnia 1', offlineSince(12_000)),
      alarmingArea('chlodnia-2', 'Chłodnia 2'),
    ];
    render(<AlarmBar areas={areas} status="live" now={NOW} />);

    const chip = screen.getByTestId('status-chip-area-chlodnia-1');
    expect(chip).toHaveTextContent('Chłodnia 1 — brak odświeżania od 12 s');
    expect(chip.className).toMatch(/bg-amber-50/);
    expect(screen.queryByTestId('alarm-chip-chlodnia-1-chlodnia-1-alarm')).not.toBeInTheDocument();
    expect(screen.getByTestId('alarm-chip-chlodnia-2-chlodnia-2-alarm')).toBeInTheDocument();
    expect(screen.queryByText('Wszystko OK')).not.toBeInTheDocument();
  });

  test('WS live, obszar offline >= 2 min: różowy chip "brak danych od N min"; jego alarmy ukryte, inne widoczne', () => {
    const areas = [
      alarmingArea('chlodnia-1', 'Chłodnia 1', offlineSince(3 * 60_000)),
      alarmingArea('chlodnia-2', 'Chłodnia 2'),
    ];
    render(<AlarmBar areas={areas} status="live" now={NOW} />);

    const chip = screen.getByTestId('status-chip-area-chlodnia-1');
    expect(chip).toHaveTextContent('Chłodnia 1 — brak danych od 3 min');
    expect(chip.className).toMatch(/bg-rose-50/);
    expect(chip.className).not.toMatch(/animate-pulse/);
    expect(screen.queryByTestId('alarm-chip-chlodnia-1-chlodnia-1-alarm')).not.toBeInTheDocument();
    expect(screen.getByTestId('alarm-chip-chlodnia-2-chlodnia-2-alarm')).toBeInTheDocument();
  });

  test('komunikaty obszarów stoją PRZED alarmami żywych obszarów', () => {
    const areas = [
      alarmingArea('chlodnia-2', 'Chłodnia 2'),
      alarmingArea('chlodnia-1', 'Chłodnia 1', offlineSince(12_000)),
    ];
    render(<AlarmBar areas={areas} status="live" now={NOW} />);

    const track = screen.getByTestId('alarm-marquee-track');
    const ids = Array.from(track.querySelectorAll('[data-testid]'))
      .map((el) => el.getAttribute('data-testid'))
      .filter((id) => id?.startsWith('status-chip-') || id?.startsWith('alarm-chip-'));
    expect(ids).toEqual(['status-chip-area-chlodnia-1', 'alarm-chip-chlodnia-2-chlodnia-2-alarm']);
  });

  test('WS live, wszystko świeże, bez alarmów: nadal "Wszystko OK" (bez zmian)', () => {
    render(<AlarmBar areas={[area({}), area({ id: 'chlodnia-3', name: 'Chłodnia 3' })]} status="live" now={NOW} />);

    expect(screen.getByText('Wszystko OK')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^status-chip-/)).toHaveLength(0);
  });

  test('wiek w chipie rośnie razem z `now`', () => {
    const areas = [alarmingArea('chlodnia-1', 'Chłodnia 1', offlineSince(23_000))];
    const { rerender } = render(<AlarmBar areas={areas} status="offline" now={NOW} />);
    expect(screen.getByTestId('status-chip-connection')).toHaveTextContent('dane sprzed 23 s');

    rerender(<AlarmBar areas={areas} status="offline" now={NOW + 7_000} />);

    expect(screen.getByTestId('status-chip-connection')).toHaveTextContent('dane sprzed 30 s');
  });

  test('po upływie okna ten sam pasek przechodzi z bursztynowego "Wznawianie" w różowy "Brak połączenia"', () => {
    const areas = [alarmingArea('chlodnia-1', 'Chłodnia 1', offlineSince(STALE_HOLD_MS - 1_000))];
    const { rerender } = render(<AlarmBar areas={areas} status="offline" now={NOW} />);
    expect(screen.getByTestId('status-chip-connection').className).toMatch(/amber/);

    rerender(<AlarmBar areas={areas} status="offline" now={NOW + 2_000} />);

    expect(screen.getByTestId('status-chip-connection')).toHaveTextContent('Brak połączenia od 2 min');
    expect(screen.getByTestId('status-chip-connection').className).toMatch(/rose/);
  });

  test('po powrocie danych pasek wraca do "Wszystko OK"', () => {
    const stale = [area({ ...offlineSince(10_000) })];
    const { rerender } = render(<AlarmBar areas={stale} status="offline" now={NOW} />);
    expect(screen.queryByText('Wszystko OK')).not.toBeInTheDocument();

    rerender(<AlarmBar areas={[area({})]} status="live" now={NOW} />);

    expect(screen.getByText('Wszystko OK')).toBeInTheDocument();
  });
});

describe('AlarmBar — dostępność komunikatów (aria-live="polite")', () => {
  const stale = (ageMs: number) => [area({ isOnline: false, lastFreshAt: NOW - ageMs })];

  test('wiek jest ukryty przed czytnikiem (aria-hidden), a chip ma stałą etykietę dla czytnika', () => {
    render(<AlarmBar areas={stale(23_000)} status="offline" now={NOW} />);

    const chip = screen.getByTestId('status-chip-connection');
    expect(chip.querySelector('[aria-hidden="true"]')).toHaveTextContent('dane sprzed 23 s');
    expect(chip.querySelector('.sr-only')).toHaveTextContent(/^Wznawianie połączenia$/);
  });

  test('etykieta dla czytnika nie zmienia się między tickami (czytnik nie ogłasza każdej sekundy)', () => {
    const { rerender } = render(<AlarmBar areas={stale(23_000)} status="offline" now={NOW} />);
    const before = screen.getByTestId('status-chip-connection').querySelector('.sr-only')?.textContent;

    rerender(<AlarmBar areas={stale(23_000)} status="offline" now={NOW + 5_000} />);
    const after = screen.getByTestId('status-chip-connection').querySelector('.sr-only')?.textContent;

    expect(after).toBe(before);
  });

  test('zmiana fazy zmienia etykietę dla czytnika (to jedyne, co ma być ogłoszone)', () => {
    const { rerender } = render(<AlarmBar areas={stale(23_000)} status="offline" now={NOW} />);
    expect(screen.getByTestId('status-chip-connection').querySelector('.sr-only')).toHaveTextContent(
      'Wznawianie połączenia'
    );

    rerender(<AlarmBar areas={stale(23_000)} status="offline" now={NOW + STALE_HOLD_MS} />);

    expect(screen.getByTestId('status-chip-connection').querySelector('.sr-only')).toHaveTextContent(
      'Brak połączenia'
    );
  });

  test('chip bez wieku ("Łączenie z serwerem…") nie ma ukrytego fragmentu', () => {
    render(<AlarmBar areas={[]} status="connecting" now={NOW} />);

    expect(screen.getByTestId('status-chip-connection').querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

// Pomiar markizy (`scrollWidth` vs `clientWidth`) kosztuje layout — ma się
// przeliczać przy zmianie ZESTAWU chipów lub ich fazy, nie co sekundę wraz z
// tykającym wiekiem. Efekt pomiaru podpina nasłuch `resize`, więc liczba jego
// uruchomień = liczba wywołań `addEventListener('resize')`.
describe('AlarmBar — klucz pomiaru markizy nie zawiera tykających sekund', () => {
  function resizeSubscriptions(spy: { mock: { calls: unknown[][] } }) {
    return spy.mock.calls.filter(([type]) => type === 'resize').length;
  }

  test('zmiana samego wieku nie powoduje ponownego pomiaru; zmiana fazy — tak', () => {
    const areas = [area({ isOnline: false, lastFreshAt: NOW - 10_000 })];
    const addSpy = vi.spyOn(window, 'addEventListener');
    const { rerender } = render(<AlarmBar areas={areas} status="offline" now={NOW} />);
    const afterMount = resizeSubscriptions(addSpy);
    expect(afterMount).toBeGreaterThan(0);

    for (let seconds = 1; seconds <= 10; seconds += 1) {
      rerender(<AlarmBar areas={areas} status="offline" now={NOW + seconds * 1_000} />);
    }
    expect(resizeSubscriptions(addSpy)).toBe(afterMount);

    rerender(<AlarmBar areas={areas} status="offline" now={NOW + STALE_HOLD_MS} />);
    expect(resizeSubscriptions(addSpy)).toBeGreaterThan(afterMount);
  });
});

describe('AlarmBar — komunikaty w tickerze', () => {
  test('przepełnienie: komunikat obszaru trafia też do zdublowanego toru', async () => {
    mockLayout({ trackWidth: 5000, viewportWidth: 1000 });
    mockPrefersReducedMotion(false);
    const areas = [area({ id: 'chlodnia-1', name: 'Chłodnia 1', isOnline: false, lastFreshAt: NOW - 5_000 })];

    render(<AlarmBar areas={areas} status="live" now={NOW} />);

    await waitFor(() => {
      expect(screen.getByTestId('alarm-marquee-track')).toHaveClass('animate-alarm-marquee');
    });
    expect(screen.getAllByTestId('status-chip-area-chlodnia-1')).toHaveLength(2);
  });
});
