import { cn } from '@/lib/utils';

/**
 * Wspólna logika kolorystyki stanu (alarm/offline) dla kafli nowego layoutu
 * overview (decyzja #27, makieta `przykładLayoutuGłównegoEkranu.png`) —
 * używana przez OverviewMetricTile i OverviewTankTile, żeby reguły alarm/
 * offline (decyzja #16 + istniejący wzorzec offline) nie duplikowały się w
 * dwóch komponentach o innym kształcie karty.
 *
 * Wizualnie: biała karta + `border-slate-200` (DesignGuideline.md §5 "Karta
 * elementu listy/linii"), zamiast poprzedniego płaskiego `bg-slate-200`.
 * Alarm koloruje border na rose i włącza `animate-alarm-flash` — cała karta
 * migocze na czerwono (decyzja użytkownika, sierpień 2026: poprzedni
 * `animate-pulse-subtle` cyklował tylko opacity obramowania 0.2↔0.5, za mało
 * widoczne z dystansu kioskowego, operator miał tego nie zauważać) — kolor
 * wypełnienia karty w spoczynku pozostaje biały, akcent niesie boczny pasek
 * (patrz `overviewAccentBarClasses`).
 */
export function overviewCardStateClasses(alarm: boolean, offline: boolean): string {
  return cn(
    'bg-white border',
    alarm ? 'border-rose-200 animate-alarm-flash motion-reduce:animate-none' : 'border-slate-200',
    offline && 'grayscale-[0.5] opacity-75'
  );
}

// Poświata paska statusu po lewej stronie karty — rgba() skopiowane wprost z
// DesignGuideline.md §1/§5, nie generowane przez klasy Tailwind.
const ALARM_GLOW_SHADOW = 'shadow-[2px_0_20px_rgba(225,29,72,0.3)]';

/**
 * Ujednolicenie kolorystyki (decyzja użytkownika, sierpień 2026): jedyny
 * kolor, który kiedykolwiek coś sygnalizuje, to rose przy alarmie. Dawne
 * kolorowanie paska per kategoria metryki (°C→blue, bar→emerald, kW→amber,
 * `metric-color.ts`) zostało usunięte — dla operatora na hali nie niosło
 * żadnej dodatkowej informacji ponad jednostkę widoczną obok liczby, tylko
 * sprawiało wrażenie przypadkowej "tęczy" kafli. W stanie normalnym pasek/
 * poświata są całkowicie niewidoczne.
 *
 * `z-20` — na `OverviewTankTile` pasek musi zostać widoczny ponad pełno-
 * kaflowym wypełnieniem poziomu (patrz `OverviewTankTile.tsx`), które ma
 * niższy `z-0`.
 */
export function overviewAccentBarClasses(alarm: boolean): string {
  return cn('absolute left-0 top-0 bottom-0 z-20 w-1.5 xl:w-2', alarm ? 'bg-rose-500' : 'bg-transparent');
}

/** Cień "glow" — tylko w stanie alarmu (patrz komentarz przy `overviewAccentBarClasses`). */
export function overviewAccentGlowShadow(alarm: boolean): string {
  return alarm ? ALARM_GLOW_SHADOW : '';
}
