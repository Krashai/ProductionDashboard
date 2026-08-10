'use client'

import { clampNonNegative, cn } from '@/lib/utils';
import { Counter } from '@/components/Counter';
import {
  overviewAccentBarClasses,
  overviewAccentGlowShadow,
  overviewCardStateClasses,
} from '@/lib/overview-card-state';

interface OverviewMetricTileProps {
  label: string;
  value: number;
  unit?: string;
  decimals?: number;
  /** Decyzja #16: pulsuje tylko ten konkretny kafel. */
  alarm?: boolean;
  offline?: boolean;
  testId?: string;
  className?: string;
}

/**
 * Kafel metryki wg makiety `przykładLayoutuGłównegoEkranu.png` (decyzja #27):
 * wartość+jednostka u góry, etykieta pod spodem — odwrócona kolejność
 * względem `MetricCard` (tam etykieta jest nad wartością). Świadomie osobny,
 * mały komponent zamiast trzeciego trybu w `MetricCard` (ten zostaje
 * niezmieniony dla karuzeli/widoku szczegółowego).
 *
 * Wizualnie zgodny z DesignGuideline.md §5 "Karta elementu listy/linii":
 * biała karta + boczny pasek statusu. Ujednolicenie kolorystyki (decyzja
 * użytkownika, sierpień 2026): pasek/poświata są niewidoczne w stanie
 * normalnym — jedyny kolor, który kiedykolwiek coś sygnalizuje, to rose przy
 * alarmie (dawne kolorowanie per jednostka z `metric-color.ts` usunięte).
 */
export function OverviewMetricTile({
  label,
  value,
  unit,
  decimals = 1,
  alarm = false,
  offline = false,
  testId,
  className,
}: OverviewMetricTileProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        // Brak `shadow-sm` bazowego: `overviewAccentGlowShadow` niżej zawsze
        // nadpisuje shadow przez twMerge (pusty string w stanie normalnym),
        // więc statyczny fallback byłby martwym kodem.
        //
        // `flex flex-col` na korzeniu (razem z `flex-1`+`justify-between` na
        // wewnętrznym wrapperze) — żeby etykieta trzymała się dolnej krawędzi
        // karty, a nie tylko "zaraz pod wartością" z martwą przestrzenią pod
        // spodem, gdy CSS grid rozciąga kartę do wysokości sąsiada (np. wyższy
        // `OverviewTankTile` w tym samym rzędzie Chłodni).
        'relative min-w-0 overflow-hidden rounded-2xl xl:rounded-[1.75rem] 2xl:rounded-[2rem] flex flex-col transition-all duration-500',
        overviewCardStateClasses(alarm, offline),
        overviewAccentGlowShadow(alarm),
        className
      )}
    >
      <span aria-hidden="true" className={overviewAccentBarClasses(alarm)} />
      <div className="flex-1 min-h-0 flex flex-col justify-between min-w-0 pl-4 pr-3 py-3 xl:pl-5 xl:pr-4 xl:py-4 2xl:pl-7 2xl:pr-6 2xl:py-6">
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="text-4xl xl:text-5xl 2xl:text-6xl font-black font-mono tracking-tighter tabular-nums leading-none text-slate-900">
            {offline ? (
              <span className="text-slate-400">—</span>
            ) : (
              <Counter value={clampNonNegative(value)} decimals={decimals} />
            )}
          </span>
          {unit && (
            <span className="text-sm xl:text-base 2xl:text-xl font-bold text-slate-500 lowercase">{unit}</span>
          )}
        </div>
        <span className="mt-1 xl:mt-1.5 2xl:mt-2 text-[10px] xl:text-[11px] 2xl:text-sm font-black uppercase tracking-wide text-slate-500 truncate">
          {label}
        </span>
      </div>
    </div>
  );
}
