import { Activity, Gauge, Thermometer, Zap, type LucideIcon } from 'lucide-react';
import { OverviewMetricTile } from '@/components/OverviewMetricTile';
import { PhaseBalanceBar } from '@/components/PhaseBalanceBar';
import { cn } from '@/lib/utils';
import type { Metric } from '@/lib/types';

export interface SubstationTile {
  metric: Metric;
  /** Krótka etykieta do wyświetlenia na kaflu ("Czynna", "L1") — pełna
   * etykieta z rejestru zostaje w `metric.label` dla `AlarmBar`. Wyliczana
   * wprost w `GROUPS` (patrz PowerAreaView.tsx), nie przez cięcie tekstu. */
  label: string;
  /** Odchyłka fazy od średniej tej samej grupy w jednostkach skali pełnej
   * (−1..+1) albo `null`, gdy grupa nie jest trójfazowa i pasek nie ma sensu. */
  phaseDeviation: number | null;
}

export interface SubstationGroup {
  label: string;
  icon: LucideIcon;
  metrics: SubstationTile[];
}

interface SubstationCardProps {
  /** Stabilny identyfikator trafostacji (np. `trafostacja-1`) — jedno źródło
   * dla `data-testid` karty i jej rzędów, żeby QA/testy nie musiały
   * rekonstruować go z tekstu nagłówka. */
  id: string;
  title: string;
  groups: SubstationGroup[];
  /** Brak połączenia z obszarem — wartości nie są wiarygodne: każdy kafel
   * traci kolor i renderuje "—" (ta sama reguła co `OverviewMetricTile`
   * wszędzie indziej). */
  offline?: boolean;
  className?: string;
}

/** Ikony grup (neutralny slate, `aria-hidden`) — jedyny dodatkowy kanał
 * rozróżnienia grup poza tekstem nagłówka. NIE mogą nieść koloru: ujednolicenie
 * kolorystyki (patrz `overview-card-state.ts`) rezerwuje kolor wyłącznie dla
 * alarmu. */
export const SUBSTATION_GROUP_ICONS = {
  napiecia: Zap,
  prady: Activity,
  moc: Gauge,
  temperaturaThd: Thermometer,
} satisfies Record<string, LucideIcon>;

/**
 * Karta jednej trafostacji: nagłówek + 4 rzędy po 3 kafle (siatka 3×4).
 * Zastępuje dawny `SpecSheetColumn` (gęsta lista "etykieta ... wartość"),
 * odrzucony przez użytkownika jako wydruk z licznika zamiast dashboardu.
 *
 * Struktura "mikro-nagłówek grupy + rząd kafli" jest celowo TA SAMA co w
 * `CoolingAreaView`/`CompressorAreaView` (te same klasy nagłówka), żeby cała
 * aplikacja czytała się jako jeden system — i reużywa dosłownie ten sam
 * `OverviewMetricTile` (wariant `size="sm"`) zamiast trzeciego, własnego
 * kształtu kafla.
 *
 * Rozdzielenie niosą wyłącznie odstępy siatki (`gap`), nigdy obramowania
 * między kaflami — kafel ma już własny border, a druga linia obok niego to
 * ink bez informacji.
 */
export function SubstationCard({ id, title, groups, offline = false, className }: SubstationCardProps) {
  return (
    <div
      data-testid={`substation-card-${id}`}
      className={cn(
        'bg-white border border-slate-200 rounded-2xl 2xl:rounded-[1.75rem] p-3 xl:p-4 2xl:p-6 flex flex-col gap-2 xl:gap-3 2xl:gap-5 h-full min-h-0 transition-all duration-500',
        className
      )}
    >
      <p className="shrink-0 font-black text-slate-900 uppercase tracking-widest text-xs 2xl:text-lg text-center leading-none">
        {title}
      </p>

      {/* `min-h-0` + `flex-1` na każdej grupie: przy 1366×768 na kolumnę
       * zostaje ~560 px na 4 rzędy kafli, więc rzędy MUSZĄ się kurczyć razem z
       * ekranem — `<main>` w `Wallboard.tsx` jest `overflow-hidden`, więc
       * nadmiar nie daje scrolla, tylko cicho ucina dolny rząd. */}
      <div className="flex-1 min-h-0 flex flex-col gap-2 xl:gap-3 2xl:gap-5">
        {groups.map((group, groupIndex) => (
          <section key={group.label} className="flex-1 min-h-0 flex flex-col gap-1 xl:gap-1.5 2xl:gap-2.5">
            {/* Nagłówek grupy wzmocniony (sierpień 2026): po skróceniu etykiet
              * kafli to ON niesie wycięte słowo, więc przestał być ozdobnym
              * podpisem — "PRĄDY" jest jedyną rzeczą odróżniającą prądowe
              * `L1` od napięciowego `L1N`. Stąd slate-600 zamiast slate-500 i
              * stopień wyżej. slate-500/600 to podłoga kontrastu tej
              * aplikacji (audyt WCAG) — NIGDY nie schodzić do slate-400. */}
            <div className="shrink-0 flex items-center gap-1.5 2xl:gap-2">
              <group.icon
                aria-hidden="true"
                className="shrink-0 w-3 h-3 xl:w-3.5 xl:h-3.5 2xl:w-[1.125rem] 2xl:h-[1.125rem] text-slate-600"
                strokeWidth={2.5}
              />
              <p className="font-black text-slate-600 uppercase tracking-[0.25em] text-[10px] xl:text-[11px] 2xl:text-base truncate">
                {group.label}
              </p>
            </div>
            <div
              data-testid={`substation-row-${id}-${groupIndex}`}
              className="flex-1 min-h-0 grid grid-cols-3 gap-2 xl:gap-2.5 2xl:gap-4"
            >
              {group.metrics.map(({ metric, label, phaseDeviation }) => (
                <OverviewMetricTile
                  key={metric.id}
                  className="min-h-0"
                  testId={`metric-card-${metric.id}`}
                  label={label}
                  value={metric.value}
                  unit={metric.unit}
                  decimals={metric.decimals}
                  alarm={metric.alarm}
                  offline={offline}
                  size="sm"
                >
                  {/* Offline: paska NIE MA w ogóle. Kafel pokazuje wtedy "—",
                    * bo odczyt jest niewiarygodny — pasek o jakiejkolwiek
                    * długości (nawet "płaski") sugerowałby, że coś jednak
                    * zmierzono. Środek kafla wraca do stanu sprzed zmiany,
                    * czyli dokładnie do tego, co operator widzi na każdym
                    * innym ekranie przy zerwanym połączeniu. */}
                  {phaseDeviation !== null && !offline ? (
                    <PhaseBalanceBar
                      deviation={phaseDeviation}
                      alarm={metric.alarm}
                      testId={`phase-bar-${metric.id}`}
                    />
                  ) : undefined}
                </OverviewMetricTile>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
