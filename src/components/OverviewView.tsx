'use client'

import Link from 'next/link';
import { Pin, Snowflake, Wind, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAreasData } from '@/hooks/useAreasData';
import { AlarmBar } from '@/components/AlarmBar';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { OverviewMetricTile } from '@/components/OverviewMetricTile';
import { OverviewTankTile } from '@/components/OverviewTankTile';
import { COLOR_MAP, type MetricCardColor } from '@/components/MetricCard';
import { AREAS, type AreaDefinition } from '@/lib/areas';
import { computeTotalActivePowerKw } from '@/lib/overview-power-summary';
import type { AreaSnapshot } from '@/lib/types';

const COOLING_AREAS = AREAS.filter((area) => area.type === 'cooling');
const [COOLING_AREA_1, COOLING_AREA_2, COOLING_AREA_3] = COOLING_AREAS;
const COMPRESSOR_AREA = AREAS.find((area) => area.type === 'compressor')!;
const POWER_AREA = AREAS.find((area) => area.type === 'power')!;

// Proporcje 2 kolumn z makiety (~46:54) — prawa kolumna (Sprężarkownia +
// Energia) jest wyraźnie szersza niż lewa (Chłodnie), patrz decyzja #27.
const BODY_GRID_TEMPLATE_COLUMNS = '1fr 1.15fr';

/**
 * Ekran domyślny pod `/` (decyzja #20, layout wg makiety z decyzji #27-30 —
 * §6a.1 Concept.md). Reużywa `useAreasData`/`AlarmBar`/`ConnectionStatus`
 * bez nowej architektury danych; kafle to nowe, lekkie komponenty
 * (`OverviewMetricTile`/`OverviewTankTile`) — `MetricCard`/`TankLevelBar`
 * używane w karuzeli zostają niezmienione.
 *
 * Rozmiary/spacing skalują się na 3 poziomach — base (<1280px) → `xl:`
 * (≥1280px) → `2xl:` (≥1536px, "tryb TV" wg DesignGuideline.md §3) — żeby
 * layout nie skakał od razu z rozmiaru bazowego do TV-rozmiaru na typowych
 * monitorach kioskowych pomiędzy tymi progami.
 */
export function OverviewView() {
  const { areas, status, lastEventAt } = useAreasData();
  const byId = new Map(areas.map((area) => [area.id, area]));

  return (
    <main className="h-screen overflow-hidden flex flex-col bg-white">
      <div className="flex-1 min-h-0 flex flex-col max-w-[2400px] w-full mx-auto px-6 xl:px-8 2xl:px-10 py-4 xl:py-5 2xl:py-6">
        {/* Nawigacja obszarów wkomponowana obok tytułu (decyzja #40, nadpisuje
         * własny pasek pod nagłówkiem z decyzji #37) — jeden rząd zamiast
         * dwóch oddaje więcej wysokości treści pod spodem. Separator w
         * pionie odróżnia tytuł od linków bez dodatkowego rzędu/obramowania. */}
        <header className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 xl:gap-x-6 pb-4 xl:pb-5 2xl:pb-6 border-b border-slate-100">
          <div className="flex items-center gap-4 xl:gap-5 2xl:gap-6 flex-wrap min-w-0">
            <h1 className="shrink-0 text-xl xl:text-2xl 2xl:text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none">
              Przegląd zakładu
            </h1>
            <div aria-hidden="true" className="hidden sm:block shrink-0 w-px h-5 xl:h-6 bg-slate-200" />
            {/* Nawigacja skrótowa do widoku przypiętego per obszar (decyzja
             * #37). Prowadzi do `/?area=X`, które `useDisplayMode` rozwiązuje
             * do trybu 'pinned' (decyzja #25/#26) — istniejący mechanizm
             * routingu, żadna nowa logika nawigacji. */}
            <nav
              aria-label="Obszary zakładu"
              className="flex flex-wrap items-center gap-2 xl:gap-2.5 2xl:gap-3"
            >
              {AREAS.map((area) => (
                <Link
                  key={area.id}
                  href={`/?area=${area.id}`}
                  // Kiosk raczej nie zostanie kiedykolwiek kliknięty myszą/dotykiem
                  // (patrz komentarz o nawigacji wyżej) — domyślny prefetch Next.js
                  // wszystkich 5 tras na starcie to zbędny ruch sieciowy.
                  prefetch={false}
                  data-testid={`overview-area-pill-${area.id}`}
                  className="bg-slate-50 hover:bg-slate-100 hover:text-slate-900 active:scale-95 transition-all duration-200 rounded-full px-3 py-1 xl:px-3.5 xl:py-1 2xl:px-4 2xl:py-1.5 text-[10px] xl:text-[11px] 2xl:text-xs font-black uppercase tracking-widest text-slate-600"
                >
                  {/* Ikona sama nie niesie treści (aria-hidden, nie wchodzi do
                   * nazwy dostępnej linku) — sygnalizuje wyłącznie wizualnie,
                   * że ta pigułka "przypina" widok i trwale zatrzymuje rotację
                   * karuzeli, w odróżnieniu od chwilowych zakładek obszaru
                   * wewnątrz samej karuzeli (Wallboard.tsx), które rotację
                   * zachowują. */}
                  <Pin aria-hidden="true" className="inline-block w-2.5 h-2.5 mr-1 text-slate-400" strokeWidth={2.5} />
                  {area.name}
                </Link>
              ))}
            </nav>
          </div>
          <ConnectionStatus status={status} lastEventAt={lastEventAt} className="ml-auto shrink-0" />
        </header>

        {/*
         * Pojedynczy grid 2 kolumny × 3 wiersze zamiast dwóch niezależnych
         * kolumn flex (decyzja #38): dzieci w kolejności wierszowej
         * [Chłodnia1, Sprężone Powietrze, Chłodnia2, Energia, Chłodnia3] —
         * domyślne auto-placement CSS Grid samo układa je 2-kolumnowo wiersz
         * po wierszu, więc "Energia elektryczna" trafia w ten sam wiersz co
         * "Chłodnia 2" (ta sama górna krawędź) bez żadnych magicznych offsetów
         * pikselowych. `content-between` rozciąga 3 wiersze na całą dostępną
         * wysokość (ten sam efekt co poprzednie `justify-between` per-kolumna,
         * teraz na poziomie całego gridu, bo wiersze są teraz współdzielone).
         */}
        <div
          data-testid="overview-body-grid"
          className="flex-1 min-h-0 grid content-between gap-x-6 xl:gap-x-8 2xl:gap-x-10 gap-y-3 xl:gap-y-4 2xl:gap-y-6 pt-4 xl:pt-5 2xl:pt-6 overflow-hidden"
          style={{ gridTemplateColumns: BODY_GRID_TEMPLATE_COLUMNS }}
        >
          <CoolingRow definition={COOLING_AREA_1} snapshot={byId.get(COOLING_AREA_1.id)} />
          <CompressorSection snapshot={byId.get(COMPRESSOR_AREA.id)} />
          <CoolingRow definition={COOLING_AREA_2} snapshot={byId.get(COOLING_AREA_2.id)} />
          <PowerSection definition={POWER_AREA} snapshot={byId.get(POWER_AREA.id)} />
          <CoolingRow definition={COOLING_AREA_3} snapshot={byId.get(COOLING_AREA_3.id)} />
        </div>
      </div>

      <AlarmBar areas={areas} />
    </main>
  );
}

/**
 * Nagłówek sekcji + chip ikony (DesignGuideline.md §5/§7: `p-2 rounded-xl
 * border`, ikona 18-22px). Ujednolicenie kolorystyki (decyzja użytkownika,
 * sierpień 2026): wszystkie trzy chipy są teraz jednym neutralnym kolorem
 * (`slate`) — dawne kodowanie per sekcja (Chłodnia→blue, Sprężone
 * powietrze→emerald, Energia→amber, `metric-color.ts`) usunięte, bo jedyny
 * kolor, który ma cokolwiek sygnalizować w tym UI, to rose przy alarmie.
 */
function SectionHeading({
  icon: Icon,
  color,
  children,
}: {
  icon: LucideIcon;
  color: MetricCardColor;
  children: string;
}) {
  return (
    <div className="shrink-0 flex items-center gap-2 xl:gap-2.5 2xl:gap-3 mb-2 xl:mb-2.5 2xl:mb-3">
      <span
        className={cn(
          'inline-flex items-center justify-center shrink-0 p-2 xl:p-2.5 2xl:p-3 rounded-xl 2xl:rounded-2xl border',
          COLOR_MAP[color]
        )}
      >
        <Icon aria-hidden="true" className="w-[18px] h-[18px] xl:w-5 xl:h-5" strokeWidth={2.5} />
      </span>
      <h2 className="text-lg xl:text-xl 2xl:text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">
        {children}
      </h2>
    </div>
  );
}

function CoolingRow({
  definition,
  snapshot,
}: {
  definition: AreaDefinition;
  snapshot: AreaSnapshot | undefined;
}) {
  const offline = snapshot ? !snapshot.isOnline : false;
  const metrics = snapshot?.metrics ?? [];
  const tempMetric = metrics.find((m) => m.unit === '°C');
  const pressureMetric = metrics.find((m) => m.unit === 'bar');
  const levelMetric = metrics.find((m) => m.unit === 'cm');

  return (
    // `self-center` zamiast domyślnego `stretch`: w rzędzie 2 ta sekcja
    // (jednorzędowa) dzieli tor gridu z "Energią elektryczną"
    // (dwurzędową, wyższą) — bez tego karta rozciąga się do wysokości
    // sąsiada, a cały nadmiar trafia pod jej kaflami, robiąc odstęp do
    // "Chłodnia 3" większy niż odstęp od "Chłodnia 1". Wyśrodkowanie
    // dzieli ten nadmiar po równo góra/dół, więc oba odstępy się wyrównują.
    // Dla rzędów 1 i 3, gdzie wysokości obu kolumn już się pokrywają, nie
    // ma to żadnego efektu wizualnego.
    <section className="min-h-0 shrink-0 self-center">
      <SectionHeading icon={Snowflake} color="slate">
        {definition.name}
      </SectionHeading>
      <div className="grid grid-cols-3 gap-2 xl:gap-3 2xl:gap-4">
        {tempMetric && (
          <OverviewMetricTile
            testId={`overview-metric-tile-${tempMetric.id}`}
            label="Temperatura"
            value={tempMetric.value}
            unit={tempMetric.unit}
            decimals={tempMetric.decimals}
            alarm={tempMetric.alarm}
            offline={offline}
          />
        )}
        {pressureMetric && (
          <OverviewMetricTile
            testId={`overview-metric-tile-${pressureMetric.id}`}
            label="Ciśnienie"
            value={pressureMetric.value}
            unit={pressureMetric.unit}
            decimals={pressureMetric.decimals}
            alarm={pressureMetric.alarm}
            offline={offline}
          />
        )}
        {levelMetric && (
          <OverviewTankTile
            testId={`overview-tank-tile-${levelMetric.id}`}
            valueCm={levelMetric.value}
            maxCm={definition.maxCm ?? 100}
            alarm={levelMetric.alarm}
            offline={offline}
          />
        )}
      </div>
    </section>
  );
}

function CompressorSection({ snapshot }: { snapshot: AreaSnapshot | undefined }) {
  const offline = snapshot ? !snapshot.isOnline : false;
  const metrics = snapshot?.metrics ?? [];

  return (
    <section className="min-h-0 shrink-0">
      {/* Makieta nazywa tę sekcję "Sprężone powietrze", mimo że rejestr (i
       * pasek nazw obszarów powyżej) używa "Sprężarkownia" — świadomie różne
       * etykiety w dwóch miejscach, zgodnie z decyzją #27/makietą. */}
      <SectionHeading icon={Wind} color="slate">
        Sprężone powietrze
      </SectionHeading>
      <div className="grid grid-cols-2 gap-2 xl:gap-3 2xl:gap-4">
        {metrics.map((metric) => (
          <OverviewMetricTile
            key={metric.id}
            testId={`overview-metric-tile-${metric.id}`}
            label={metric.label}
            value={metric.value}
            unit={metric.unit}
            decimals={metric.decimals}
            alarm={metric.alarm}
            offline={offline}
          />
        ))}
      </div>
    </section>
  );
}

function PowerSection({
  definition,
  snapshot,
}: {
  definition: AreaDefinition;
  snapshot: AreaSnapshot | undefined;
}) {
  const offline = snapshot ? !snapshot.isOnline : false;
  const metrics = snapshot?.metrics ?? [];
  const activePowerMetrics = metrics.filter((m) => m.unit === 'kW');
  const totalKw = computeTotalActivePowerKw(metrics);
  // Suma jest wyprowadzona z 3 odczytów — jeśli którykolwiek z nich jest w
  // alarmie, karta sumy też sygnalizuje problem (decyzja #16 rozciągnięta na
  // wartość pochodną, bo inaczej alarm w danych "znikałby" na tym kaflu).
  const anyActivePowerAlarm = activePowerMetrics.some((m) => m.alarm);

  return (
    <section className="min-h-0 shrink-0">
      <SectionHeading icon={Zap} color="slate">
        {definition.name}
      </SectionHeading>
      <div className="grid grid-cols-3 gap-2 xl:gap-3 2xl:gap-4 mb-2 xl:mb-3 2xl:mb-4">
        {activePowerMetrics.map((metric) => (
          <OverviewMetricTile
            key={metric.id}
            testId={`overview-metric-tile-${metric.id}`}
            label={metric.label.split(' — ')[0]}
            value={metric.value}
            unit={metric.unit}
            decimals={metric.decimals}
            alarm={metric.alarm}
            offline={offline}
          />
        ))}
      </div>
      {snapshot && (
        <OverviewMetricTile
          testId="overview-metric-tile-total-active-power"
          label="Sumaryczne zużycie"
          value={totalKw}
          unit="kW"
          decimals={0}
          alarm={anyActivePowerAlarm}
          offline={offline}
        />
      )}
    </section>
  );
}
