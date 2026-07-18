import { cn } from '@/lib/utils';
import type { MetricCardColor } from '@/components/MetricCard';

/**
 * Wspólna logika kolorystyki stanu (alarm/offline) dla kafli nowego layoutu
 * overview (decyzja #27, makieta `przykładLayoutuGłównegoEkranu.png`) —
 * używana przez OverviewMetricTile i OverviewTankTile, żeby reguły alarm/
 * offline (decyzja #16 + istniejący wzorzec offline) nie duplikowały się w
 * dwóch komponentach o innym kształcie karty.
 *
 * Wizualnie: biała karta + `border-slate-200` (DesignGuideline.md §5 "Karta
 * elementu listy/linii"), zamiast poprzedniego płaskiego `bg-slate-200`.
 * Alarm koloruje border na rose i włącza `animate-pulse-subtle` (§7) — kolor
 * wypełnienia karty pozostaje biały, akcent niesie boczny pasek (patrz
 * `overviewAccentBarClasses`).
 */
export function overviewCardStateClasses(alarm: boolean, offline: boolean): string {
  return cn(
    'bg-white border',
    alarm ? 'border-rose-200 animate-pulse-subtle motion-reduce:animate-none' : 'border-slate-200',
    offline && 'grayscale-[0.5] opacity-75'
  );
}

const ACCENT_BAR_COLOR_MAP: Record<MetricCardColor, string> = {
  emerald: 'bg-emerald-500',
  blue: 'bg-blue-500',
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  slate: 'bg-slate-400',
};

// rgba() wprost skopiowane z DesignGuideline.md §1/§5 (poświata paska
// statusu po lewej stronie karty) — te wartości nie są generowane przez
// klasy Tailwind, tylko wklejone 1:1 jako arbitralne shadow.
const ACCENT_GLOW_SHADOW_MAP: Record<MetricCardColor, string> = {
  emerald: 'shadow-[2px_0_15px_rgba(16,185,129,0.3)]',
  blue: 'shadow-[2px_0_15px_rgba(59,130,246,0.3)]',
  rose: 'shadow-[2px_0_20px_rgba(225,29,72,0.3)]',
  amber: 'shadow-[2px_0_15px_rgba(245,158,11,0.3)]',
  slate: 'shadow-[2px_0_10px_rgba(100,116,139,0.15)]',
};

/**
 * Alarm bije kolor bazowy metryki — rose ma priorytet wizualny niezależnie
 * od tego, jaki kolor kafel ma normalnie (np. blue dla temperatury), tak
 * samo jak `MetricCard.effectiveColor`.
 */
function effectiveAccentColor(color: MetricCardColor, alarm: boolean): MetricCardColor {
  return alarm ? 'rose' : color;
}

/**
 * Kolorowy pasek statusu po lewej krawędzi karty (absolute, pełna wysokość).
 * `z-20` — na `OverviewTankTile` pasek musi zostać widoczny ponad pełno-
 * kaflowym wypełnieniem poziomu (patrz `OverviewTankTile.tsx`), które ma
 * niższy `z-0`.
 */
export function overviewAccentBarClasses(color: MetricCardColor, alarm: boolean): string {
  return cn(
    'absolute left-0 top-0 bottom-0 z-20 w-1.5 xl:w-2',
    ACCENT_BAR_COLOR_MAP[effectiveAccentColor(color, alarm)]
  );
}

/** Cień "glow" dopasowany do koloru paska — nakładany na kartę-kontener. */
export function overviewAccentGlowShadow(color: MetricCardColor, alarm: boolean): string {
  return ACCENT_GLOW_SHADOW_MAP[effectiveAccentColor(color, alarm)];
}
