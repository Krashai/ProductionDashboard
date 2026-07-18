import { cn } from '@/lib/utils';
import {
  overviewAccentBarClasses,
  overviewAccentGlowShadow,
  overviewCardStateClasses,
} from '@/lib/overview-card-state';

interface OverviewTankTileProps {
  valueCm: number;
  maxCm: number;
  alarm?: boolean;
  offline?: boolean;
  testId?: string;
  className?: string;
}

/**
 * Poziom zbiornika wg makiety (decyzja #27/§6a.1), rozszerzone na prośbę
 * użytkownika: niebieskie wypełnienie zajmuje **całą kartę** (nie tylko
 * dedykowaną podstrefę) proporcjonalnie do poziomu — absolute layer na dnie
 * karty (`z-0`), rosnący od dołu do wysokości `percent%` całego kafla.
 * Wartość+etykieta renderują się jako osobna warstwa nad wypełnieniem
 * (`relative z-10`), więc liczba pozostaje czytelna niezależnie od tego, jak
 * wysoko sięga wypełnienie — nigdy nie jest realnie przysłonięta, bo leży
 * wyżej w stosie mimo wizualnego "zanurzenia" w kolorze.
 *
 * Struktura treści (wartość+jednostka na górze, podpis "POZIOM" przy dolnej
 * krawędzi) jest świadomie identyczna z `OverviewMetricTile` (te same
 * paddingi/rozmiary fontu) — dzięki temu naturalna wysokość kafla zrównuje
 * się z sąsiednimi kartami metryk bez sztucznego wymuszania (np. karty
 * Sprężonego Powietrza wychodzą tej samej wysokości co Chłodni 1, mimo że
 * renderują się w zupełnie innej gałęzi drzewa/gridzie).
 *
 * Karta dzieli wygląd z `OverviewMetricTile` (biały bg + boczny pasek
 * akcentu, DesignGuideline.md §5) — kolor paska jest na stałe `blue`
 * (dopasowany do koloru wypełnienia zbiornika), bo poziom `cm` nie ma wpisu
 * w `metric-color.ts`.
 */
export function OverviewTankTile({
  valueCm,
  maxCm,
  alarm = false,
  offline = false,
  testId,
  className,
}: OverviewTankTileProps) {
  const ratio = maxCm > 0 ? clamp(valueCm / maxCm, 0, 1) : 0;
  const percent = Math.round(ratio * 100);

  return (
    <div
      data-testid={testId}
      className={cn(
        // Brak `shadow-sm` bazowego, patrz komentarz w OverviewMetricTile.tsx.
        'relative min-w-0 overflow-hidden rounded-2xl xl:rounded-[1.75rem] 2xl:rounded-[2rem] flex flex-col transition-all duration-500',
        overviewCardStateClasses(alarm, offline),
        overviewAccentGlowShadow('blue', alarm),
        className
      )}
    >
      <span aria-hidden="true" className={overviewAccentBarClasses('blue', alarm)} />
      <div
        data-testid={testId ? `overview-tank-fill-${testId}` : undefined}
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 bottom-0 z-0 transition-all duration-1000',
          alarm ? 'bg-rose-400' : 'bg-blue-400'
        )}
        style={{ height: `${percent}%` }}
      />
      <div className="relative z-10 flex-1 min-h-0 flex flex-col justify-between min-w-0 pl-4 pr-3 py-3 xl:pl-5 xl:pr-4 xl:py-4 2xl:pl-7 2xl:pr-6 2xl:py-6">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl xl:text-5xl 2xl:text-6xl font-black tracking-tighter tabular-nums leading-none text-slate-900">
            {offline ? '—' : Math.round(valueCm)}
          </span>
          <span className="text-sm xl:text-base 2xl:text-xl font-bold text-slate-800 lowercase">cm</span>
        </div>
        {/* text-slate-900, nie -600: ta etykieta siedzi na dolnej krawędzi
         * karty, dokładnie tam gdzie zaczyna się kolorowe wypełnienie
         * poziomu — jest na nim niemal zawsze, nie tylko przy pełnym
         * zbiorniku. slate-600 mierzył 2.98:1 na bg-blue-400 (audyt
         * dostępności, ustalenie §1) — slate-900 zachowuje kontrast >4.5:1
         * zarówno na białym tle, jak i na wypełnieniu blue-400/rose-400. */}
        <span className="mt-1 xl:mt-1.5 2xl:mt-2 text-[10px] xl:text-[11px] 2xl:text-sm font-black uppercase tracking-wide text-slate-900 truncate">
          Poziom
        </span>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
