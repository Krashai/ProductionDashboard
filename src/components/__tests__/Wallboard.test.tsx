import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { Wallboard } from '@/components/Wallboard';
import { AREAS } from '@/lib/areas';
import { ROTATION_TIME_MS } from '@/hooks/useCarousel';
import { useAreasData } from '@/hooks/useAreasData';
import { generateSnapshot } from '@/lib/mock/generateSnapshot';
import type { AreaSnapshot } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}));

// useAreasData mockowany bezpośrednio (zamiast realnego mock streamu) — tylko
// tak da się w tym pliku deterministycznie wymusić isOnline=false na
// konkretnym obszarze, żeby przetestować StatusBadge w nagłówku (prawdziwy
// generateSnapshot zawsze zwraca isOnline: true).
vi.mock('@/hooks/useAreasData', () => ({
  useAreasData: vi.fn(),
}));

const mockedUseSearchParams = vi.mocked(useSearchParams);
const mockedUseAreasData = vi.mocked(useAreasData);

function setSearchParams(query: string) {
  mockedUseSearchParams.mockReturnValue(new URLSearchParams(query) as ReturnType<
    typeof useSearchParams
  >);
}

function buildDefaultAreas(): AreaSnapshot[] {
  return AREAS.map((area) => generateSnapshot(area));
}

// Nadpisuje isOnline pojedynczego obszaru w domyślnym zestawie snapshotów —
// reszta zostaje bez zmian, żeby testy niezwiązane ze statusem nie musiały o tym wiedzieć.
function setAreaOnlineState(areaId: string, isOnline: boolean) {
  mockedUseAreasData.mockReturnValue({
    areas: buildDefaultAreas().map((area) => (area.id === areaId ? { ...area, isOnline } : area)),
    status: 'live',
    lastEventAt: new Date(),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  // Wallboard nadal parsuje displayMode samodzielnie (self-contained, patrz
  // RootView) — testy karuzeli muszą jawnie ustawić ?mode=carousel, bo bare
  // params domyślnie rozwiązują się teraz do overview (decyzja #20/#25) i
  // to RootView, nie Wallboard, kierowałby wtedy do OverviewView.
  setSearchParams('mode=carousel');
  mockedUseAreasData.mockReturnValue({
    areas: buildDefaultAreas(),
    status: 'live',
    lastEventAt: new Date(),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Wallboard — tryb carousel (?mode=carousel)', () => {
  test('renderuje pierwszy obszar (Chłodnia 1) od razu po zamontowaniu', () => {
    render(<Wallboard />);
    expect(screen.getByRole('heading', { name: AREAS[0].name })).toBeInTheDocument();
  });

  test('renderuje kontrolki karuzeli: play/pause, pigułki 5 obszarów, licznik "1/5"', () => {
    render(<Wallboard />);
    expect(screen.getByRole('button', { name: /wstrzymaj rotację/i })).toBeInTheDocument();
    for (const area of AREAS) {
      expect(screen.getByRole('button', { name: area.name })).toBeInTheDocument();
    }
    expect(screen.getByText('1/5')).toBeInTheDocument();
  });

  test('renderuje AlarmBar niezależnie od tego, który obszar jest aktywny', () => {
    const { container } = render(<Wallboard />);
    expect(container.querySelector('[data-testid="alarm-bar"]')).toBeInTheDocument();
  });

  test('po ROTATION_TIME_MS przechodzi do kolejnego obszaru (Sprężarkownia)', () => {
    render(<Wallboard />);
    act(() => {
      vi.advanceTimersByTime(ROTATION_TIME_MS);
    });
    expect(screen.getByRole('heading', { name: AREAS[1].name })).toBeInTheDocument();
    expect(screen.getByText('2/5')).toBeInTheDocument();
  });

  test('klik na pigułkę obszaru przełącza natychmiast, bez czekania na timer', () => {
    render(<Wallboard />);
    fireEvent.click(screen.getByRole('button', { name: AREAS[3].name }));
    expect(screen.getByText('4/5')).toBeInTheDocument();
  });

  test('klik play/pause zatrzymuje rotację', () => {
    render(<Wallboard />);
    fireEvent.click(screen.getByRole('button', { name: /wstrzymaj rotację/i }));

    act(() => {
      vi.advanceTimersByTime(ROTATION_TIME_MS * 2);
    });
    expect(screen.getByRole('heading', { name: AREAS[0].name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wznów rotację/i })).toBeInTheDocument();
  });

  test('nagłówek aktywnego obszaru pokazuje StatusBadge online, gdy obszar jest online', () => {
    render(<Wallboard />);
    expect(screen.getByText('Obszar online')).toBeInTheDocument();
  });

  test('nagłówek aktywnego obszaru pokazuje StatusBadge offline, gdy obszar przechodzi w stan offline', () => {
    setAreaOnlineState(AREAS[0].id, false);
    render(<Wallboard />);
    expect(screen.getByText('Obszar offline')).toBeInTheDocument();
  });
});

describe('Wallboard — tryb pinned (?area=...)', () => {
  test('pokazuje wyłącznie przypięty obszar, bez przełącznika/play-pause/paska postępu', () => {
    const pinnedArea = AREAS.find((a) => a.id === 'chlodnia-2')!;
    setSearchParams('area=chlodnia-2');

    render(<Wallboard />);

    expect(screen.getByText(pinnedArea.name)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /wstrzymaj rotację|wznów rotację/i })).not.toBeInTheDocument();
    expect(screen.queryByText('1/5')).not.toBeInTheDocument();
    // Pigułki przełącznika nie istnieją w trybie pinned — nazwa obszaru
    // pojawia się tylko raz, jako nagłówek sekcji.
    expect(screen.getAllByText(pinnedArea.name)).toHaveLength(1);
  });

  test('nie rotuje mimo upływu czasu w trybie pinned', () => {
    setSearchParams('area=chlodnia-2');
    render(<Wallboard />);

    act(() => {
      vi.advanceTimersByTime(ROTATION_TIME_MS * 3);
    });

    expect(screen.getByText('Chłodnia 2')).toBeInTheDocument();
  });

  test('poprawny ?area= wygrywa, nawet gdyby Wallboard był zamontowany bez ?mode=carousel', () => {
    setSearchParams('area=chlodnia-2');
    render(<Wallboard />);

    expect(screen.getByRole('heading', { name: 'Chłodnia 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /wstrzymaj rotację|wznów rotację/i })).not.toBeInTheDocument();
  });

  test('nieznany ?area= (bez mode) wraca do trybu overview wewnątrz Wallboard — brak kontrolek karuzeli', () => {
    setSearchParams('area=nie-takiego-obszaru-nie-ma');
    render(<Wallboard />);

    // Wallboard nie renderuje OverviewView — to rola RootView. Sam Wallboard
    // po prostu nie pokazuje kontrolek karuzeli, gdy displayMode nie jest 'carousel'.
    expect(screen.queryByRole('button', { name: /wstrzymaj rotację|wznów rotację/i })).not.toBeInTheDocument();
    expect(screen.queryByText('1/5')).not.toBeInTheDocument();
  });

  test('nagłówek przypiętego obszaru pokazuje StatusBadge online, gdy obszar jest online', () => {
    setSearchParams('area=chlodnia-2');
    render(<Wallboard />);
    expect(screen.getByText('Obszar online')).toBeInTheDocument();
  });

  test('nagłówek przypiętego obszaru pokazuje StatusBadge offline, gdy obszar przechodzi w stan offline', () => {
    setSearchParams('area=chlodnia-2');
    setAreaOnlineState('chlodnia-2', false);
    render(<Wallboard />);
    expect(screen.getByText('Obszar offline')).toBeInTheDocument();
  });
});

describe('Wallboard — layout kiosku bez scrolla', () => {
  test('korzeń ma h-screen i overflow-hidden, treść ma flex-1 min-h-0, AlarmBar ma shrink-0', () => {
    const { container } = render(<Wallboard />);
    const root = container.firstElementChild as HTMLElement;

    expect(root).toHaveClass('h-screen');
    expect(root).toHaveClass('overflow-hidden');

    const alarmBar = container.querySelector('[data-testid="alarm-bar"]') as HTMLElement;
    expect(alarmBar).toHaveClass('shrink-0');
    // AlarmBar musi być bezpośrednim dzieckiem korzenia h-screen, siostrą
    // treści flex-1 min-h-0 — nie zagnieżdżony w niej.
    expect(alarmBar.parentElement).toBe(root);

    const contentWrapper = root.children[0] as HTMLElement;
    expect(contentWrapper).toHaveClass('flex-1');
    expect(contentWrapper).toHaveClass('min-h-0');
  });
});
