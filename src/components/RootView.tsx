'use client'

import { useDisplayMode } from '@/hooks/useDisplayMode';
import { OverviewView } from '@/components/OverviewView';
import { Wallboard } from '@/components/Wallboard';

/**
 * Dispatcher najwyższego poziomu (decyzja #20/#25): `/` bez parametrów (lub
 * z nieznanym `?mode=`) renderuje `OverviewView`, wszystko inne (`carousel`
 * albo `pinned`) trafia do `Wallboard`. `Wallboard` samodzielnie parsuje
 * `useDisplayMode()` jeszcze raz dla swojej wewnętrznej gałęzi
 * carousel/pinned — to nadmiarowe, ale utrzymuje `Wallboard` w pełni
 * samodzielnym (może być zamontowany niezależnie, np. w testach).
 */
export function RootView() {
  const displayMode = useDisplayMode();

  if (displayMode.mode === 'overview') {
    return <OverviewView />;
  }

  return <Wallboard />;
}
