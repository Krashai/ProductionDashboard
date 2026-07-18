import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { RootView } from '@/components/RootView';
import { AREAS } from '@/lib/areas';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}));

const mockedUseSearchParams = vi.mocked(useSearchParams);

function setSearchParams(query: string) {
  mockedUseSearchParams.mockReturnValue(new URLSearchParams(query) as ReturnType<
    typeof useSearchParams
  >);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('RootView — routing wg Concept.md §6/§6a (decyzje #20/#25/#26)', () => {
  test('brak parametrów => montuje OverviewView (nowy domyślny widok)', () => {
    setSearchParams('');
    render(<RootView />);

    expect(screen.getByRole('heading', { name: 'Przegląd zakładu' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /wstrzymaj rotację|wznów rotację/i })
    ).not.toBeInTheDocument();
  });

  test('?mode=carousel => montuje Wallboard w chromie karuzeli (play/pause + switcher)', () => {
    setSearchParams('mode=carousel');
    render(<RootView />);

    expect(screen.queryByRole('heading', { name: 'Przegląd zakładu' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wstrzymaj rotację/i })).toBeInTheDocument();
    for (const area of AREAS) {
      expect(screen.getByRole('button', { name: area.name })).toBeInTheDocument();
    }
  });

  test('?area=chlodnia-2 => montuje Wallboard w trybie pinned, bez kontrolek karuzeli', () => {
    setSearchParams('area=chlodnia-2');
    render(<RootView />);

    expect(screen.queryByRole('heading', { name: 'Przegląd zakładu' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chłodnia 2' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /wstrzymaj rotację|wznów rotację/i })
    ).not.toBeInTheDocument();
  });

  test('nieznany ?mode= i brak area => montuje OverviewView (fallback bezpieczny)', () => {
    setSearchParams('mode=cos-nieznanego');
    render(<RootView />);

    expect(screen.getByRole('heading', { name: 'Przegląd zakładu' })).toBeInTheDocument();
  });
});
