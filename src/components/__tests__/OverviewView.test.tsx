import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { OverviewView } from '@/components/OverviewView';
import { AREAS } from '@/lib/areas';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('OverviewView — layout wg makiety (Concept.md §6a.1, decyzje #27-30, #37-38)', () => {
  test('renderuje nagłówek z tytułem i ConnectionStatus, bez play/pause ani switchera', () => {
    render(<OverviewView />);
    expect(screen.getByRole('heading', { name: 'Przegląd zakładu' })).toBeInTheDocument();
    expect(screen.getByText(/LIVE|ŁĄCZENIE|OFFLINE/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /wstrzymaj rotację|wznów rotację/i })
    ).not.toBeInTheDocument();
  });

  test('pasek pod nagłówkiem to nawigacja — 5 linków do widoku przypiętego per obszar (decyzja #37, nadpisuje #30)', () => {
    const { container } = render(<OverviewView />);
    expect(screen.getByRole('navigation', { name: 'Obszary zakładu' })).toBeInTheDocument();
    for (const area of AREAS) {
      const pill = container.querySelector(
        `[data-testid="overview-area-pill-${area.id}"]`
      ) as HTMLAnchorElement;
      expect(pill).toBeInTheDocument();
      expect(pill.tagName).toBe('A');
      expect(pill.getAttribute('href')).toBe(`/?area=${area.id}`);
      expect(screen.getByRole('link', { name: area.name })).toBeInTheDocument();
    }
  });

  test('layout dwukolumnowy: lewa kolumna (chłodnie) węższa niż prawa (sprężarkownia + energia)', () => {
    const { container } = render(<OverviewView />);
    const grid = container.querySelector('[data-testid="overview-body-grid"]') as HTMLElement;
    expect(grid).toBeInTheDocument();
    expect(grid.style.gridTemplateColumns).toBeTruthy();
    const [left, right] = grid.style.gridTemplateColumns.split(' ');
    expect(parseFloat(right)).toBeGreaterThan(parseFloat(left));
  });

  test('kolejność sekcji w gridzie wiersz-po-wierszu daje "Energia elektryczna" w tym samym wierszu co "Chłodnia 2" (decyzja #38)', () => {
    const { container } = render(<OverviewView />);
    const grid = container.querySelector('[data-testid="overview-body-grid"]') as HTMLElement;
    // 2-kolumnowy grid z domyślnym auto-placement: dzieci w kolejności
    // źródłowej wypełniają wiersz po wierszu. Chcemy [Chłodnia1, Sprężone
    // Powietrze, Chłodnia2, Energia, Chłodnia3] — Chłodnia2 (index 2) i
    // Energia (index 3) lądują wtedy w tym samym (drugim) wierszu.
    const headings = Array.from(grid.children).map(
      (child) => child.querySelector('h2')?.textContent
    );
    expect(headings).toEqual([
      'Chłodnia 1',
      'Sprężone powietrze',
      'Chłodnia 2',
      'Energia elektryczna',
      'Chłodnia 3',
    ]);
  });

  test('renderuje nazwy sekcji: 3× Chłodnia, "Sprężone powietrze" (nazwa z makiety), "Energia elektryczna"', () => {
    render(<OverviewView />);
    expect(screen.getByRole('heading', { name: 'Chłodnia 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chłodnia 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chłodnia 3' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sprężone powietrze' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Energia elektryczna' })).toBeInTheDocument();
  });

  test('renderuje dokładnie 15 wartości łącznie (9 chłodnia [2 kafle + 1 tank ×3] + 2 sprężarkownia + 3 trafo kW + 1 suma)', () => {
    const { container } = render(<OverviewView />);
    const metricTiles = container.querySelectorAll('[data-testid^="overview-metric-tile-"]');
    const tankTiles = container.querySelectorAll('[data-testid^="overview-tank-tile-"]');

    expect(metricTiles).toHaveLength(12);
    expect(tankTiles).toHaveLength(3);
    expect(metricTiles.length + tankTiles.length).toBe(15);
  });

  // REGRESJA (sierpień 2026): rozszerzenie rejestru Sprężarkowni o ciśnienie
  // kolektora i przepływ powietrza przepchnęło te metryki na overview przez
  // filtr `unit !== ''`, przez co prawa kolumna urosła z 1 rzędu kafli do 2.
  // Nadrzędny grid ma `content-between` — przy ujemnej wolnej przestrzeni
  // `space-between` NAKŁADA wiersze na siebie (sekcja Energii wchodziła na
  // Sprężone powietrze przy oknie ~1904×943). Ten test pilnuje liczby kafli,
  // czyli przyczyny; osobny test Playwright pilnuje skutku (brak nachodzeń).
  test('Sprężarkownia renderuje DOKŁADNIE 2 kafle — ciśnienie zbiornika per magazyn (decyzja #28)', () => {
    const { container } = render(<OverviewView />);
    for (const id of [
      'sprezarkownia-magazyn-aluminium-cisnienie-zbiornik',
      'sprezarkownia-magazyn-bebnow-cisnienie-zbiornik',
    ]) {
      expect(
        container.querySelector(`[data-testid="overview-metric-tile-${id}"]`)
      ).toBeInTheDocument();
    }
    // Ciśnienie kolektora i przepływ powietrza należą WYŁĄCZNIE do ekranu
    // szczegółowego (CompressorAreaView) — na overview rozwalały layout.
    for (const id of [
      'sprezarkownia-magazyn-bebnow-cisnienie-kolektor',
      'sprezarkownia-magazyn-bebnow-przeplyw-powietrza',
    ]) {
      expect(
        container.querySelector(`[data-testid="overview-metric-tile-${id}"]`)
      ).not.toBeInTheDocument();
    }
    // Bity urządzeń (PRACA/AWARIA, unit="") mają swój ekran szczegółowy
    // (CompressorAreaView) — overview ich nie pokazuje.
    expect(
      container.querySelector('[data-testid="overview-metric-tile-sprezarkownia-aluminium-1-praca"]')
    ).not.toBeInTheDocument();
  });

  test('kafle Sprężarkowni podpisane samą nazwą magazynu, bez powtarzania rodzaju odczytu', () => {
    render(<OverviewView />);
    expect(screen.getByText('Magazyn Aluminium')).toBeInTheDocument();
    expect(screen.getByText('Magazyn Bębnów')).toBeInTheDocument();
    expect(screen.queryByText(/Magazyn Aluminium — Ciśnienie zbiornik/)).not.toBeInTheDocument();
  });

  test('Energia elektryczna renderuje 3 kafle mocy czynnej (bez kVA) + 1 kafel sumy (decyzja #29)', () => {
    const { container } = render(<OverviewView />);
    expect(
      container.querySelector('[data-testid="overview-metric-tile-trafostacja-1-active"]')
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="overview-metric-tile-trafostacja-2-active"]')
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="overview-metric-tile-trafostacja-3-active"]')
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="overview-metric-tile-trafostacja-1-apparent"]')
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="overview-metric-tile-total-active-power"]')
    ).toBeInTheDocument();
    expect(screen.getByText('Sumaryczne zużycie')).toBeInTheDocument();
  });

  test('nie renderuje żadnego elementu polyline (brak sparkline na overview, decyzja #22)', () => {
    const { container } = render(<OverviewView />);
    expect(container.querySelectorAll('polyline').length).toBe(0);
  });

  test('renderuje AlarmBar agregujący alarmy ze wszystkich 5 obszarów', () => {
    const { container } = render(<OverviewView />);
    expect(container.querySelector('[data-testid="alarm-bar"]')).toBeInTheDocument();
  });

  test('layout: h-screen overflow-hidden na korzeniu, flex-1 min-h-0 na treści, AlarmBar shrink-0 jako siostra', () => {
    const { container } = render(<OverviewView />);
    const root = container.firstElementChild as HTMLElement;

    expect(root).toHaveClass('h-screen');
    expect(root).toHaveClass('overflow-hidden');

    const alarmBar = container.querySelector('[data-testid="alarm-bar"]') as HTMLElement;
    expect(alarmBar).toHaveClass('shrink-0');
    expect(alarmBar.parentElement).toBe(root);

    const contentWrapper = root.children[0] as HTMLElement;
    expect(contentWrapper).toHaveClass('flex-1');
    expect(contentWrapper).toHaveClass('min-h-0');
  });
});
