import type { CSSProperties } from 'react';
import { clampNonNegative } from '@/lib/utils';

export interface FitValue {
  value: number;
  decimals: number;
}

/**
 * Budżet znaków liczby dla kafli w trybie `narrow:` (okno przeglądarki
 * ustawione obok innego okna, proporcje węższe niż 3:2). Rozmiar czcionki
 * wartości liczy się tam z szerokości kafla podzielonej przez ten budżet
 * (`--fit-value` w globals.css), więc liczba zawsze mieści się w kaflu —
 * zamiast jak dotąd znikać pod `overflow-hidden` ("144.6" → "144.").
 *
 * Liczone dla całego rzędu, nie per kafel: wszystkie kafle jednej sekcji
 * dostają ten sam rozmiar czcionki, inaczej "96.5" obok "456.3" renderowałoby
 * się większą liczbą. `min` trzyma rozmiar stabilnym przy typowych danych —
 * czcionka maleje dopiero, gdy wartość realnie przekroczy budżet sekcji.
 */
export function fitValueChars(values: FitValue[], min = 1): number {
  return values.reduce(
    (longest, { value, decimals }) => Math.max(longest, clampNonNegative(value).toFixed(decimals).length),
    min
  );
}

/**
 * Klasy trybu `narrow:` wspólne dla `OverviewMetricTile` i `OverviewTankTile`
 * — oba kafle stoją w tym samym rzędzie Chłodni i muszą skalować się
 * identycznie (te dwa komponenty już raz się rozjechały, patrz komentarze
 * "utrzymane w kroku z…"). Trzymane tu, bo Tailwind skanuje `src/lib/**`.
 */
export const FIT_CLASSES = {
  /** Kafel jest kontenerem — `cqi`/`cqh` w `--fit-value` (globals.css). */
  root: 'overview-fit-tile narrow:[container-type:size]',
  /** Kafel w `narrow:` jest wyższy niż treść — grupa wartość/jednostka/
   * etykieta zostaje razem, wyśrodkowana w pionie. Węższy padding: kioskowy
   * zjadał ~22% szerokości kafla Chłodni, a to szerokość ogranicza tam
   * rozmiar liczby. `pl-3` zostaje szersze od paska alarmu (`w-1.5`). */
  body: 'narrow:justify-center narrow:pl-3 narrow:pr-2',
  /** Jednostka zawsze pod liczbą — nie zawija się zależnie od długości wartości. */
  valueRow: 'narrow:flex-col narrow:items-start',
  /** `leading-none` ponownie w `narrow:`: twMerge usuwa bazowe `leading-none`
   * na rzecz późniejszego `text-4xl`, które niesie `line-height: 2.5rem` — przy
   * liczbie przeskalowanej do ~16px zostawiało 40px wiersza i ściskało
   * etykietę. Ta klasa musi stać PO klasach rozmiaru w `cn()`. */
  value: 'narrow:[font-size:var(--fit-value)] narrow:leading-none',
  unit: 'narrow:[font-size:var(--fit-unit)] narrow:leading-none',
} as const;

/** Budżet znaków dla `--fit-value`; bez `fitChars` kafel nie dostaje `style`. */
export function fitTileStyle(fitChars: number | undefined): CSSProperties | undefined {
  return fitChars === undefined ? undefined : ({ '--value-chars': fitChars } as CSSProperties);
}
