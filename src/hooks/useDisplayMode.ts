'use client'

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { AREAS, type AreaDefinition } from '@/lib/areas';

// Token wewnętrzny 'carousel' (nie 'rotate') dla spójności 1:1 z parametrem
// URL `?mode=carousel` — decyzja #26.
export type DisplayMode =
  | { mode: 'overview' }
  | { mode: 'carousel' }
  | { mode: 'pinned'; pinnedAreaId: string };

const OVERVIEW_MODE: DisplayMode = { mode: 'overview' };
const CAROUSEL_MODE: DisplayMode = { mode: 'carousel' };

/**
 * Czysta logika parsowania `?area=`/`?mode=` — wydzielona z hooka, żeby dało
 * się ją przetestować bez next/navigation i kontekstu routera (Concept.md §6/§6a).
 *
 * Precedencja (decyzja #26): poprawny `?area=` wygrywa nad `?mode=carousel`,
 * gdy oba obecne — najbardziej precyzyjny parametr wygrywa. Nieznany/pusty/
 * brakujący `area` NIE blokuje odczytu `mode` (spada do kolejnej reguły,
 * nie prosto do overview) — dopiero brak poprawnego `area` i brak
 * `mode=carousel` daje domyślny overview (decyzja #20/#25).
 */
export function parseDisplayMode(
  searchParams: URLSearchParams | string | null | undefined,
  areas: AreaDefinition[] = AREAS
): DisplayMode {
  if (!searchParams) return OVERVIEW_MODE;

  const params =
    typeof searchParams === 'string' ? new URLSearchParams(searchParams) : searchParams;
  const areaId = params.get('area');

  if (areaId && areas.some((area) => area.id === areaId)) {
    return { mode: 'pinned', pinnedAreaId: areaId };
  }

  return params.get('mode') === 'carousel' ? CAROUSEL_MODE : OVERVIEW_MODE;
}

export function useDisplayMode(areas: AreaDefinition[] = AREAS): DisplayMode {
  const searchParams = useSearchParams();
  return useMemo(() => parseDisplayMode(searchParams, areas), [searchParams, areas]);
}
