'use client'

import { ArrowDown, ArrowUp, Info, Minus, type LucideIcon } from 'lucide-react';
import { clampNonNegative, cn } from '@/lib/utils';
import { Counter } from '@/components/Counter';
import { Sparkline } from '@/components/Sparkline';
import {
  overviewAccentBarClasses,
  overviewAccentGlowShadow,
  overviewCardStateClasses,
} from '@/lib/overview-card-state';

// Zawężone do 'rose' | 'slate' (decyzja użytkownika, sierpień 2026): jedyny
// kolor, który kiedykolwiek coś sygnalizuje, to rose przy alarmie — dawne
// warianty per kategoria metryki (emerald/blue/amber) zostały usunięte razem
// z propem `color` (patrz niżej), bo nic już ich nie przekazuje.
export type MetricCardColor = 'rose' | 'slate';

interface MetricCardProps {
  label: string;
  value: number;
  unit?: string;
  decimals?: number;
  /** Decyzja #16 (Concept.md): tylko ta konkretna karta pulsuje, nic więcej. */
  alarm?: boolean;
  /** Brak połączenia z obszarem — wartość nie jest wiarygodna, więc jest ukryta. */
  offline?: boolean;
  history?: number[];
  icon?: LucideIcon;
  tooltip?: string;
  /** Wariant gęsty dla ekranu overview (Concept.md §6a) — mniejszy padding/
   * zaokrąglenie/font i BRAK sparkline niezależnie od `history` (decyzja #22). */
  compact?: boolean;
  testId?: string;
  className?: string;
}

// Nadal eksportowane — `OverviewView.tsx` używa tej mapy do stylowania
// własnej ikony (SectionHeading), więc usunięcie złamałoby tamten ekran.
export const COLOR_MAP: Record<MetricCardColor, string> = {
  rose: 'text-rose-600 bg-rose-50 border-rose-100',
  slate: 'text-slate-600 bg-slate-50 border-slate-100',
};

type TrendDirection = 'up' | 'down' | 'flat';

const TREND_ICON_MAP: Record<TrendDirection, LucideIcon> = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
};

/** Trend liczony tylko z dwóch ostatnich punktów historii — to sygnał "czy
 * rośnie/maleje właśnie teraz", a nie regresja po całym oknie sparkline. */
function trendDirectionFromHistory(history: number[] | undefined): TrendDirection | null {
  if (!history || history.length < 2) return null;
  const previous = history[history.length - 2];
  const current = history[history.length - 1];
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'flat';
}

export function MetricCard({
  label,
  value,
  unit,
  decimals = 1,
  alarm = false,
  offline = false,
  history,
  icon: Icon,
  tooltip,
  compact = false,
  testId,
  className,
}: MetricCardProps) {
  // Ujednolicenie kolorystyki (decyzja użytkownika, sierpień 2026): odznaka
  // ikony jest neutralna (slate) w spoczynku i rose wyłącznie w alarmie —
  // dawny kolor bazowy per kategoria metryki już tu nie wpływa na nic.
  const effectiveColor: MetricCardColor = alarm ? 'rose' : 'slate';

  // Wariant `compact` (overview, decyzja #22) zostaje bez zmian co do
  // zachowania/propsów/testów — osobna, większa decyzja o jego dalszym
  // losie jest poza zakresem tej zmiany (audyt UI/UX kart pełnowymiarowych).
  if (compact) {
    return (
      <div
        data-testid={testId}
        className={cn(
          'group relative bg-white border shadow-sm transition-all duration-500 flex flex-col',
          'rounded-xl 2xl:rounded-2xl p-3 2xl:p-7 gap-1 2xl:gap-3',
          alarm ? 'border-rose-200 animate-alarm-flash motion-reduce:animate-none' : 'border-slate-200',
          offline && 'grayscale-[0.5] opacity-75',
          className
        )}
      >
        {(Icon || tooltip) && (
          <div className="flex items-start justify-between shrink-0">
            {Icon && (
              <div
                className={cn(
                  'rounded-2xl border transition-all duration-500 shadow-sm p-1.5 2xl:p-2.5',
                  COLOR_MAP[effectiveColor]
                )}
              >
                <Icon size={16} strokeWidth={2.5} />
              </div>
            )}

            {tooltip && (
              <div className="relative group/tooltip ml-auto">
                <button
                  type="button"
                  className="p-2 text-slate-300 hover:text-slate-600 transition-colors"
                  aria-label="Definicja metryki"
                >
                  <Info size={16} />
                </button>
                <div className="absolute top-0 right-full mr-4 w-72 opacity-0 group-hover/tooltip:opacity-100 transition-all duration-300 pointer-events-none translate-x-2 group-hover/tooltip:translate-x-0 z-[110]">
                  <div className="bg-slate-900 text-white text-sm font-medium p-5 rounded-[1.5rem] shadow-2xl border border-slate-800 leading-relaxed">
                    <p className="text-slate-200 antialiased">{tooltip}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center items-center text-center py-0.5 2xl:py-4">
          {/* `p`, nie `h3` — to podpis pod liczbą, nie nagłówek strukturalny.
           * `h3` tutaj tworzył szum w nawigacji "po nagłówkach" dla czytników
           * ekranu (audyt dostępności, ustalenie §2). */}
          <p className="font-black text-slate-600 uppercase tracking-[0.3em] text-[8px] 2xl:text-xs mb-1 2xl:mb-4 leading-tight">
            {label}
          </p>
          <div className="flex items-baseline justify-center gap-2">
            <span className="font-black font-mono text-slate-900 tracking-tighter tabular-nums leading-none text-xl 2xl:text-5xl">
              {offline ? (
                <span className="text-slate-500">—</span>
              ) : (
                <Counter value={clampNonNegative(value)} decimals={decimals} />
              )}
            </span>
            {unit && (
              <span className="font-black text-slate-500 uppercase tracking-tighter text-[10px] 2xl:text-xl">
                {unit}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  const trend = trendDirectionFromHistory(history);
  const TrendIcon = trend ? TREND_ICON_MAP[trend] : null;

  return (
    <div
      data-testid={testId}
      className={cn(
        'group relative overflow-hidden flex flex-col transition-all duration-500 rounded-[2.5rem] p-6 2xl:p-8',
        overviewCardStateClasses(alarm, offline),
        overviewAccentGlowShadow(alarm),
        className
      )}
    >
      <span aria-hidden="true" className={overviewAccentBarClasses(alarm)} />

      {(Icon || tooltip) && (
        <div className="relative z-10 flex items-start justify-between shrink-0 mb-2">
          {Icon && (
            <div
              className={cn(
                'rounded-2xl border p-3 transition-all duration-500 shadow-sm',
                COLOR_MAP[effectiveColor]
              )}
            >
              <Icon size={20} strokeWidth={2.5} />
            </div>
          )}

          {tooltip && (
            <div className="relative group/tooltip ml-auto">
              <button
                type="button"
                className="p-2 text-slate-300 hover:text-slate-600 transition-colors"
                aria-label="Definicja metryki"
              >
                <Info size={16} />
              </button>
              <div className="absolute top-0 right-full mr-4 w-72 opacity-0 group-hover/tooltip:opacity-100 transition-all duration-300 pointer-events-none translate-x-2 group-hover/tooltip:translate-x-0 z-[110]">
                <div className="bg-slate-900 text-white text-sm font-medium p-5 rounded-[1.5rem] shadow-2xl border border-slate-800 leading-relaxed">
                  <p className="text-slate-200 antialiased">{tooltip}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Wartość→jednostka najpierw, etykieta pod spodem — ta sama hierarchia
       * co `OverviewMetricTile` (decyzja #27), zamiast dawnej odwrotnej
       * kolejności tej karty. Ekran fokusowy/karuzela czyta się z tego samego
       * dystansu co overview, więc obie ścieżki powinny wyglądać spójnie. */}
      <div className="relative z-10 flex-1 flex flex-col justify-center items-center text-center py-4">
        <div className="flex items-baseline justify-center gap-2">
          <span className="font-black font-mono text-slate-900 tracking-tighter tabular-nums leading-none text-6xl 2xl:text-7xl">
            {offline ? (
              <span className="text-slate-500">—</span>
            ) : (
              <Counter value={clampNonNegative(value)} decimals={decimals} />
            )}
          </span>
          {unit && (
            <span className="font-black text-slate-500 uppercase tracking-tighter text-xl 2xl:text-2xl">
              {unit}
            </span>
          )}
          {TrendIcon && (
            <TrendIcon
              data-testid="metric-trend"
              data-direction={trend}
              size={20}
              strokeWidth={3}
              // Neutralny slate niezależnie od stanu alarmu — strzałka trendu
              // nie może konkurować wizualnie z akcentem rose.
              className="text-slate-400 shrink-0"
              aria-hidden="true"
            />
          )}
        </div>
        {/* `p`, nie `h3` — podpis pod liczbą, nie nagłówek strukturalny
         * (audyt dostępności, ustalenie §2). */}
        <p className="font-black text-slate-600 uppercase tracking-[0.3em] text-[11px] mt-3">
          {label}
        </p>
      </div>

      {history && history.length > 0 && (
        <div className="relative z-10 shrink-0 pt-4 border-t border-slate-100 flex justify-center">
          {/* Sparkline realnie wypełnia stopkę karty zamiast dawnego znaczka
           * 100×28 — karta ekranu przypiętego/karuzeli jest oglądana z
           * dystansu kioskowego, więc trend musi być czytelny bez zbliżania
           * się do ekranu. */}
          <Sparkline
            history={history}
            className={alarm ? 'text-rose-500' : 'text-blue-500'}
            width={200}
            height={56}
          />
        </div>
      )}
    </div>
  );
}
