import { DeviceStatusTile } from '@/components/DeviceStatusTile';
import { OverviewMetricTile } from '@/components/OverviewMetricTile';
import { OverviewTankTile } from '@/components/OverviewTankTile';
import { deriveDeviceGroupStatuses, isCoolingShutdown } from '@/lib/device-status';
import { cn } from '@/lib/utils';
import type { AreaDefinition } from '@/lib/areas';
import type { AreaSnapshot } from '@/lib/types';

interface CoolingAreaViewProps {
  area: AreaSnapshot;
  definition: AreaDefinition;
}

/**
 * Ekran szczegółowy Chłodni 1/2/3 — dotychczasowe 3 metryki analogowe
 * (temperatura/ciśnienie/poziom) razem z kaflami urządzeń (sprężarki/
 * agregaty/pompy, PRACA+AWARIA). Chłodnia 1 ma dodatkową grupę "Agregaty",
 * której Chłodnia 2/3 nie mają — `definition.deviceGroups` steruje tym
 * różnicowaniem, więc ten komponent zostaje jeden dla wszystkich trzech.
 */
export function CoolingAreaView({ area, definition }: CoolingAreaViewProps) {
  const offline = !area.isOnline;
  const tempMetric = area.metrics.find((m) => m.id === `${definition.id}-temp`);
  const pressureMetric = area.metrics.find((m) => m.id === `${definition.id}-pressure`);
  const levelMetric = area.metrics.find((m) => m.id === `${definition.id}-level`);

  const groupStatuses = deriveDeviceGroupStatuses(definition.deviceGroups, area.metrics, offline);
  const isShutdown = isCoolingShutdown(definition, area.metrics);

  return (
    <div className="flex flex-col h-full gap-3 2xl:gap-6">
      {isShutdown && (
        <div
          data-testid="cooling-shutdown-banner"
          className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 py-1.5 2xl:py-3 text-center"
        >
          <p className="font-black text-slate-500 uppercase tracking-[0.3em] text-[10px] 2xl:text-sm">
            Chłodnia wyłączona — pompy obiegowe nie pracują
          </p>
        </div>
      )}

      {/* Układ dwukolumnowy (decyzja użytkownika, sierpień 2026): parametry
       * wody dostają stałą kolumnę po prawej — 3 karty na pełną wysokość
       * zamiast ciasnego rzędu `compact` u góry — a urządzenia dostają całą
       * pozostałą wysokość ekranu po lewej, więc kafle mogą być realnie
       * większe niż w poprzedniej wersji (3 metryki nie zabierają już
       * osobnego poziomego pasa nad siatką urządzeń). */}
      {/* Budżet szerokości lewej kolumny na kiosku (nie da się przeskoczyć
       * `overflow-hidden` na `<main>` w Wallboard.tsx żadnym scrollem — jeśli
       * rząd 5 kafli pomp nie zmieści się w jednej linii, 5. kafel po prostu
       * znika pod dolną krawędzią ekranu, patrz historia tego pliku). Przy
       * ~1920px szerokości okna kolumna urządzeń ma tu ok. 1328px (2xl:px-10
       * na `<main>`, `gap-8` tej siatki, `30rem` drugiej kolumny) — rząd 5×
       * `DeviceStatusTile` (`2xl:w-56`=224px) + 4×`gap-6`(24px) = 1216px,
       * ~110px zapasu. Przy zwiększaniu `DeviceStatusTile` w przyszłości
       * policz to ponownie zamiast zgadywać (patrz komentarz w
       * `DeviceStatusTile.tsx`). */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_20rem] xl:grid-cols-[1fr_23rem] 2xl:grid-cols-[1fr_30rem] gap-4 2xl:gap-8">
        {groupStatuses.length > 0 ? (
          <div className="min-h-0 flex flex-col justify-around gap-3 2xl:gap-6">
            {groupStatuses.map((group) => (
              <section key={group.id} className="flex flex-col items-start gap-2 2xl:gap-4">
                <div className="shrink-0 flex items-center gap-2 2xl:gap-3">
                  <p className="font-black text-slate-500 uppercase tracking-[0.3em] text-[10px] 2xl:text-sm">
                    {group.label}
                  </p>
                  <span
                    data-testid={`device-group-summary-${group.id}`}
                    className={cn(
                      'rounded-full border px-2 py-0.5 2xl:px-3 2xl:py-1 text-[9px] 2xl:text-xs font-black uppercase tracking-widest',
                      group.devices.some((d) => d.fault)
                        ? 'border-rose-200 bg-rose-50 text-rose-600 animate-alarm-flash motion-reduce:animate-none'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    )}
                  >
                    {group.devices.filter((d) => d.running).length} z {group.devices.length} pracuje
                  </span>
                </div>
                <div className="flex flex-wrap justify-start gap-3 2xl:gap-6">
                  {group.devices.map((device) => (
                    <DeviceStatusTile
                      key={device.id}
                      testId={`device-tile-${device.id}`}
                      label={device.label}
                      running={device.running}
                      fault={device.fault}
                      offline={device.offline}
                      frequencyHz={device.frequencyHz}
                      // Wyrównanie wysokości kafli TYLKO wewnątrz grup, które
                      // faktycznie mają choć jedno urządzenie z regulacją
                      // obrotów (np. "Pompy obiegowe": Pompa 1 ma Hz, 2-5 nie)
                      // — patrz komentarz w DeviceStatusTile.tsx.
                      reserveFrequencyRow={group.devices.some((d) => d.frequencyHz !== null)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          // Obszary bez deviceGroups (nie powinno się zdarzyć dla 'cooling',
          // ale AreaDefinition.deviceGroups jest opcjonalne) — pusta lewa
          // kolumna zamiast pustego div-a bez treści.
          <div />
        )}

        {/* Karty parametrów wody reużywają dosłownie te same komponenty co
         * ekran główny (`OverviewMetricTile`/`OverviewTankTile`) — spójny
         * wygląd w całej aplikacji, zamiast osobnego stylu karuzeli
         * (`MetricCard`/`TankLevelBar`, zaokrąglenie `rounded-[2.5rem]`,
         * wyśrodkowana treść). Dodatkowa korzyść: wewnętrzny layout tych
         * kafli (`flex-1 justify-between`, wypełnienie poziomu jako warstwa
         * tła całej karty) skaluje się płynnie do dowolnej wysokości bez
         * sztywnych `h-*`, więc równy podział `flex-1` na trzy karty
         * wystarcza — bez wcześniejszego hacka z nierównymi proporcjami. */}
        <div className="min-h-0 flex flex-col gap-3 2xl:gap-6">
          {tempMetric && (
            <OverviewMetricTile
              className={cn('flex-1 min-h-0', isShutdown && 'opacity-60')}
              testId={`metric-card-${tempMetric.id}`}
              label={tempMetric.label}
              value={tempMetric.value}
              unit={tempMetric.unit}
              decimals={tempMetric.decimals}
              alarm={isShutdown ? false : tempMetric.alarm}
              offline={offline}
              size="lg"
            />
          )}
          {pressureMetric && (
            <OverviewMetricTile
              className={cn('flex-1 min-h-0', isShutdown && 'opacity-60')}
              testId={`metric-card-${pressureMetric.id}`}
              label={pressureMetric.label}
              value={pressureMetric.value}
              unit={pressureMetric.unit}
              decimals={pressureMetric.decimals}
              alarm={isShutdown ? false : pressureMetric.alarm}
              offline={offline}
              size="lg"
            />
          )}
          {levelMetric && (
            // Warunek z notatek dotyczy wyłącznie temp/ciśnienia — poziom
            // zbiornika NIE wycisza się, gdy chłodnia jest wyłączona (to
            // fizyczny stan zbiornika, niezależny od pracy pomp obiegowych).
            <OverviewTankTile
              className="flex-1 min-h-0"
              testId={`tank-level-${levelMetric.id}`}
              valueCm={levelMetric.value}
              maxCm={definition.maxCm ?? 100}
              alarm={levelMetric.alarm}
              offline={offline}
              size="lg"
            />
          )}
        </div>
      </div>
    </div>
  );
}
