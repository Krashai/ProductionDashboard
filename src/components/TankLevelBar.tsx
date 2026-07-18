import { cn } from '@/lib/utils';

interface TankLevelBarProps {
  valueCm: number;
  maxCm: number;
  offline?: boolean;
  /** Decyzja #16 (Concept.md) rozciągnięta na tank level: to też pojedyncza
   * "karta metryki", więc jej alarm pulsuje tak samo jak MetricCard. */
  alarm?: boolean;
  /** Wariant gęsty dla ekranu overview (decyzja #23) — mniejszy słupek i
   * padding, ale wciąż grafika, nie sama liczba. */
  compact?: boolean;
  testId?: string;
  className?: string;
}

/**
 * Pionowy pasek poziomu zbiornika — Concept.md §3 chce tu wizualizacji
 * typu slider/pasek, nie karty KPI z liczbą na środku.
 */
export function TankLevelBar({
  valueCm,
  maxCm,
  offline = false,
  alarm = false,
  compact = false,
  testId,
  className,
}: TankLevelBarProps) {
  // maxCm<=0 nie powinno się zdarzyć w praktyce (rejestr zawsze ustawia
  // dodatnie maxCm), ale broniemy się przed dzieleniem przez zero zamiast
  // renderować NaN.
  const ratio = maxCm > 0 ? clamp(valueCm / maxCm, 0, 1) : 0;
  const percent = Math.round(ratio * 100);

  return (
    <div
      data-testid={testId}
      className={cn(
        'bg-white border shadow-sm flex flex-col items-center transition-all duration-500',
        // Jak w MetricCard: skalowanie w górę na `2xl:` zamiast pustej
        // przestrzeni — ten sam słupek, tylko większy w trybie TV.
        compact ? 'rounded-xl 2xl:rounded-2xl p-2 2xl:p-7 gap-1.5 2xl:gap-5' : 'rounded-[2.5rem] p-6 2xl:p-8 gap-4',
        alarm ? 'border-rose-200 animate-pulse-subtle motion-reduce:animate-none' : 'border-slate-200',
        offline && 'grayscale-[0.5] opacity-75',
        className
      )}
    >
      {/* `p`, nie `h3` — podpis pod grafiką, nie nagłówek strukturalny
       * (audyt dostępności, ustalenie §2). */}
      <p
        className={cn(
          'font-black text-slate-600 uppercase tracking-[0.3em] text-center',
          compact ? 'text-[7px] 2xl:text-xs leading-tight' : 'text-[11px]'
        )}
      >
        Poziom wody w zbiorniku
      </p>

      <div
        className={cn(
          'relative bg-slate-100 rounded-full border border-slate-200 overflow-hidden',
          compact ? 'w-4 h-14 2xl:w-12 2xl:h-52' : 'w-10 2xl:w-14 h-40 2xl:h-56'
        )}
      >
        <div
          data-testid="tank-level-fill"
          className={cn(
            'absolute bottom-0 left-0 right-0 transition-all duration-1000',
            alarm ? 'bg-rose-500' : 'bg-blue-500'
          )}
          style={{ height: `${percent}%` }}
        />
      </div>

      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            'font-black text-slate-900 tracking-tighter tabular-nums leading-none',
            compact ? 'text-base 2xl:text-4xl' : 'text-3xl'
          )}
        >
          {offline ? '—' : Math.round(valueCm)}
        </span>
        <span className={cn('font-black text-slate-500 uppercase', compact ? 'text-[9px] 2xl:text-lg' : 'text-sm')}>
          cm
        </span>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
