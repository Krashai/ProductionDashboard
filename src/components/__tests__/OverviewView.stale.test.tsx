import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { OverviewView } from '@/components/OverviewView';
import { useAreasData, type ConnectionStatus } from '@/hooks/useAreasData';
import { AREAS } from '@/lib/areas';
import { generateSnapshot } from '@/lib/mock/generateSnapshot';
import { markAllOffline } from '@/lib/backend/mapPayload';
import { STALE_HOLD_MS } from '@/lib/staleness';
import type { AreaSnapshot } from '@/lib/types';

// useAreasData mockowany, żeby deterministycznie ustawiać isOnline/lastFreshAt
// per obszar — prawdziwy mock stream zawsze zwraca obszary online.
vi.mock('@/hooks/useAreasData', () => ({
  useAreasData: vi.fn(),
}));

const mockedUseAreasData = vi.mocked(useAreasData);

const NOW = new Date('2026-10-26T10:00:00.000Z').getTime();
const GREY = /grayscale-\[0\.5\]/;

const COOLING_1 = 'chlodnia-1';
const COOLING_1_TEMP_TILE = 'overview-metric-tile-chlodnia-1-temp';
const COOLING_1_TANK_TILE = 'overview-tank-tile-chlodnia-1-level';
const COMPRESSOR_ID = 'sprezarkownia';
const ALU_TILE = 'overview-metric-tile-sprezarkownia-magazyn-aluminium-cisnienie-zbiornik';
const BEBNY_TILE = 'overview-metric-tile-sprezarkownia-magazyn-bebnow-cisnienie-zbiornik';
const POWER_TOTAL_TILE = 'overview-metric-tile-total-active-power';

/** Bazowy, deterministyczny zestaw: wszystko online, świeże teraz. */
function liveAreas(): AreaSnapshot[] {
  return AREAS.map((area) =>
    generateSnapshot(area, { random: () => 0.5, now: () => new Date(NOW) })
  ).map((snapshot) => ({
    ...snapshot,
    metrics: snapshot.metrics.map((metric) => ({ ...metric, online: true })),
  }));
}

function withArea(areas: AreaSnapshot[], areaId: string, patch: Partial<AreaSnapshot>): AreaSnapshot[] {
  return areas.map((area) => (area.id === areaId ? { ...area, ...patch } : area));
}

function mockData(areas: AreaSnapshot[], status: ConnectionStatus = 'live') {
  mockedUseAreasData.mockReturnValue({ areas, status, lastEventAt: new Date(NOW) });
}

function tile(container: HTMLElement, testId: string): HTMLElement {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`Brak kafla ${testId}`);
  return element as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mockData(liveAreas());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('OverviewView — okno wstrzymania ostatnich wartości', () => {
  test('obszar offline od 30 s trzyma wartości: bez szarości i bez "—"', () => {
    mockData(withArea(liveAreas(), COOLING_1, { isOnline: false, lastFreshAt: NOW - 30_000 }));

    const { container } = render(<OverviewView />);

    expect(tile(container, COOLING_1_TEMP_TILE).className).not.toMatch(GREY);
    expect(tile(container, COOLING_1_TEMP_TILE).textContent).not.toContain('—');
    expect(tile(container, COOLING_1_TANK_TILE).className).not.toMatch(GREY);
    expect(tile(container, COOLING_1_TANK_TILE).textContent).not.toContain('—');
  });

  test('ten sam obszar offline od 3 min szarzeje i pokazuje "—"', () => {
    mockData(withArea(liveAreas(), COOLING_1, { isOnline: false, lastFreshAt: NOW - 180_000 }));

    const { container } = render(<OverviewView />);

    expect(tile(container, COOLING_1_TEMP_TILE).className).toMatch(GREY);
    expect(tile(container, COOLING_1_TEMP_TILE).textContent).toContain('—');
    expect(tile(container, COOLING_1_TANK_TILE).className).toMatch(GREY);
    expect(tile(container, COOLING_1_TANK_TILE).textContent).toContain('—');
  });

  test('obszar, który nigdy nie miał danych, pokazuje "—", nie zera z mappera', () => {
    const zeroed = liveAreas().map((area) =>
      area.id === COOLING_1
        ? { ...area, isOnline: false, lastFreshAt: null, metrics: area.metrics.map((m) => ({ ...m, value: 0, online: false })) }
        : area
    );
    mockData(zeroed);

    const { container } = render(<OverviewView />);

    const temp = tile(container, COOLING_1_TEMP_TILE);
    expect(temp.className).toMatch(GREY);
    expect(temp.textContent).toContain('—');
    expect(temp.textContent).not.toMatch(/\b0\.0\b/);
  });

  test('offline jednego obszaru nie rusza sąsiednich kafli', () => {
    mockData(withArea(liveAreas(), COOLING_1, { isOnline: false, lastFreshAt: NOW - 180_000 }));

    const { container } = render(<OverviewView />);

    expect(tile(container, 'overview-metric-tile-chlodnia-2-temp').className).not.toMatch(GREY);
    expect(tile(container, POWER_TOTAL_TILE).className).not.toMatch(GREY);
  });

  test('kafel sumy mocy (Energia) idzie za stanem swojego obszaru', () => {
    mockData(withArea(liveAreas(), 'energia-elektryczna', { isOnline: false, lastFreshAt: NOW - 10_000 }));
    const held = render(<OverviewView />);
    expect(tile(held.container, POWER_TOTAL_TILE).className).not.toMatch(GREY);
    held.unmount();

    mockData(withArea(liveAreas(), 'energia-elektryczna', { isOnline: false, lastFreshAt: NOW - 200_000 }));
    const expired = render(<OverviewView />);
    expect(tile(expired.container, POWER_TOTAL_TILE).className).toMatch(GREY);
  });
});

describe('OverviewView — Sprężarkownia per metryka (PLC)', () => {
  /** PLC Aluminium martwy, PLC Bębnów żywy; wartość Aluminium zostaje. */
  function aluminiumPlcDown(lastFreshAt: number): AreaSnapshot[] {
    return withArea(liveAreas(), COMPRESSOR_ID, {
      isOnline: false,
      lastFreshAt,
      metrics: liveAreas()
        .find((a) => a.id === COMPRESSOR_ID)!
        .metrics.map((m) =>
          m.id === 'sprezarkownia-magazyn-aluminium-cisnienie-zbiornik' ? { ...m, online: false } : m
        ),
    });
  }

  test('martwy PLC w oknie wstrzymania: kafel nie szarzeje', () => {
    mockData(aluminiumPlcDown(NOW - 30_000));

    const { container } = render(<OverviewView />);

    expect(tile(container, ALU_TILE).className).not.toMatch(GREY);
    expect(tile(container, ALU_TILE).textContent).not.toContain('—');
  });

  test('martwy PLC po oknie: szarzeje tylko jego kafel, żywy PLC zostaje normalny', () => {
    mockData(aluminiumPlcDown(NOW - STALE_HOLD_MS));

    const { container } = render(<OverviewView />);

    expect(tile(container, ALU_TILE).className).toMatch(GREY);
    expect(tile(container, BEBNY_TILE).className).not.toMatch(GREY);
  });

  test('utrata całego WS: obie karty trzymają wartości w oknie, a po oknie szarzeją (Z2)', () => {
    mockData(markAllOffline(liveAreas()), 'offline');

    const { container } = render(<OverviewView />);
    expect(tile(container, ALU_TILE).className).not.toMatch(GREY);
    expect(tile(container, BEBNY_TILE).className).not.toMatch(GREY);

    act(() => {
      vi.advanceTimersByTime(STALE_HOLD_MS + 1000);
    });

    expect(tile(container, ALU_TILE).className).toMatch(GREY);
    expect(tile(container, BEBNY_TILE).className).toMatch(GREY);
  });
});

describe('OverviewView — upływ czasu bez nowych danych', () => {
  test('utrata WS: kafle trzymają wartości przez okno, potem same szarzeją (tykanie useNow)', () => {
    mockData(markAllOffline(liveAreas().map((a) => ({ ...a, lastFreshAt: NOW }))), 'offline');

    const { container } = render(<OverviewView />);
    expect(tile(container, COOLING_1_TEMP_TILE).className).not.toMatch(GREY);

    act(() => {
      vi.advanceTimersByTime(STALE_HOLD_MS - 2000);
    });
    expect(tile(container, COOLING_1_TEMP_TILE).className).not.toMatch(GREY);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(tile(container, COOLING_1_TEMP_TILE).className).toMatch(GREY);
    expect(tile(container, COOLING_1_TEMP_TILE).textContent).toContain('—');
  });

  test('gdy wszystko jest online, widok nie uruchamia interwału tykania', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    render(<OverviewView />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  test('gdy któryś obszar jest offline, widok tyka co sekundę', () => {
    mockData(withArea(liveAreas(), COOLING_1, { isOnline: false, lastFreshAt: NOW }));
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    render(<OverviewView />);

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
    setIntervalSpy.mockRestore();
  });

  test('tykanie nie restartuje animacji Counter: wartość trzymanego kafla jest stabilna między tickami', () => {
    mockData(markAllOffline(liveAreas().map((a) => ({ ...a, lastFreshAt: NOW }))), 'offline');
    const { container } = render(<OverviewView />);
    const temp = tile(container, COOLING_1_TEMP_TILE);

    // Animacja Counter (1.5 s) dochodzi do końca.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const settled = temp.textContent;
    expect(settled).toContain('5.0');

    for (let i = 0; i < 20; i += 1) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(tile(container, COOLING_1_TEMP_TILE)).toBe(temp);
      expect(temp.textContent).toBe(settled);
    }
  });
});
