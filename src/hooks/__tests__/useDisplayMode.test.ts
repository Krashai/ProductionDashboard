import { describe, expect, test, vi } from 'vitest';
import { parseDisplayMode } from '@/hooks/useDisplayMode';
import { AREAS } from '@/lib/areas';

describe('parseDisplayMode', () => {
  test('poprawny id obszaru => tryb pinned z tym id', () => {
    const validId = AREAS[1].id;
    const result = parseDisplayMode(new URLSearchParams(`area=${validId}`));
    expect(result).toEqual({ mode: 'pinned', pinnedAreaId: validId });
  });

  test('nieznany id obszaru (bez mode) => fallback do overview, bez błędu (Concept.md §9)', () => {
    const result = parseDisplayMode(new URLSearchParams('area=nieistniejacy-obszar'));
    expect(result).toEqual({ mode: 'overview' });
  });

  test('brak jakichkolwiek parametrów => overview (nowy domyślny widok, decyzja #20/#25)', () => {
    const result = parseDisplayMode(new URLSearchParams(''));
    expect(result).toEqual({ mode: 'overview' });
  });

  test('pusty string jako wartość area => overview', () => {
    const result = parseDisplayMode(new URLSearchParams('area='));
    expect(result).toEqual({ mode: 'overview' });
  });

  test('null zamiast URLSearchParams (np. przed hydratacją) => overview', () => {
    const result = parseDisplayMode(null);
    expect(result).toEqual({ mode: 'overview' });
  });

  test('przyjmuje string zamiast URLSearchParams', () => {
    const validId = AREAS[0].id;
    const result = parseDisplayMode(`?area=${validId}`);
    expect(result).toEqual({ mode: 'pinned', pinnedAreaId: validId });
  });

  test('respektuje niestandardowy rejestr obszarów przekazany jako drugi argument', () => {
    const customAreas = [{ ...AREAS[0], id: 'custom-area' }];
    const result = parseDisplayMode(new URLSearchParams('area=custom-area'), customAreas);
    expect(result).toEqual({ mode: 'pinned', pinnedAreaId: 'custom-area' });
  });

  test('?mode=carousel (bez area) => tryb carousel', () => {
    const result = parseDisplayMode(new URLSearchParams('mode=carousel'));
    expect(result).toEqual({ mode: 'carousel' });
  });

  test('?mode=overview jawnie => overview (nieszkodliwy alias domyślnego trybu, decyzja #26)', () => {
    const result = parseDisplayMode(new URLSearchParams('mode=overview'));
    expect(result).toEqual({ mode: 'overview' });
  });

  test('nieznana wartość ?mode= => overview (fallback bezpieczny, jak przy area)', () => {
    const result = parseDisplayMode(new URLSearchParams('mode=cokolwiek-innego'));
    expect(result).toEqual({ mode: 'overview' });
  });

  test('poprawny ?area= wygrywa nad ?mode=carousel, gdy oba obecne (decyzja #26)', () => {
    const validId = AREAS[2].id;
    const result = parseDisplayMode(new URLSearchParams(`area=${validId}&mode=carousel`));
    expect(result).toEqual({ mode: 'pinned', pinnedAreaId: validId });
  });

  test('nieznany ?area= razem z ?mode=carousel => carousel (area nieważny nie blokuje odczytu mode)', () => {
    const result = parseDisplayMode(new URLSearchParams('area=nieistniejacy&mode=carousel'));
    expect(result).toEqual({ mode: 'carousel' });
  });
});

describe('useDisplayMode (hook)', () => {
  test('deleguje do next/navigation useSearchParams i zwraca sparsowany tryb', async () => {
    vi.resetModules();
    vi.doMock('next/navigation', () => ({
      useSearchParams: () => new URLSearchParams(`area=${AREAS[2].id}`),
    }));

    const { renderHook } = await import('@testing-library/react');
    const { useDisplayMode } = await import('@/hooks/useDisplayMode');

    const { result } = renderHook(() => useDisplayMode());
    expect(result.current).toEqual({ mode: 'pinned', pinnedAreaId: AREAS[2].id });

    vi.doUnmock('next/navigation');
    vi.resetModules();
  });

  test('bez parametrów hook zwraca tryb overview', async () => {
    vi.resetModules();
    vi.doMock('next/navigation', () => ({
      useSearchParams: () => new URLSearchParams(''),
    }));

    const { renderHook } = await import('@testing-library/react');
    const { useDisplayMode } = await import('@/hooks/useDisplayMode');

    const { result } = renderHook(() => useDisplayMode());
    expect(result.current).toEqual({ mode: 'overview' });

    vi.doUnmock('next/navigation');
    vi.resetModules();
  });
});
