'use client'

import Link from 'next/link';
import { Pin, Snowflake, Wind, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAreasData } from '@/hooks/useAreasData';
import { AlarmBar } from '@/components/AlarmBar';
import { Logo } from '@/components/brand/Logo';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { OverviewMetricTile } from '@/components/OverviewMetricTile';
import { OverviewTankTile } from '@/components/OverviewTankTile';
import { COLOR_MAP, type MetricCardColor } from '@/components/MetricCard';
import { AREAS, type AreaDefinition } from '@/lib/areas';
import { fitValueChars } from '@/lib/overview-fit';
import { computeTotalActivePowerKw } from '@/lib/overview-power-summary';
import type { AreaSnapshot } from '@/lib/types';

const COOLING_AREAS = AREAS.filter((area) => area.type === 'cooling');
const [COOLING_AREA_1, COOLING_AREA_2, COOLING_AREA_3] = COOLING_AREAS;
const COMPRESSOR_AREA = AREAS.find((area) => area.type === 'compressor')!;
const POWER_AREA = AREAS.find((area) => area.type === 'power')!;

// Proporcje 2 kolumn z makiety (~46:54) — prawa kolumna (Sprężarkownia +
// Energia) jest wyraźnie szersza niż lewa (Chłodnie), patrz decyzja #27.
// Zmiana proporcji wymaga poprawki dzielnika `2.15` w `--fit-cap`
// (globals.css) — liczy z niej szerokość kafla Chłodni w trybie `narrow:`.
const BODY_GRID_TEMPLATE_COLUMNS = '1fr 1.15fr';

// Tryb `narrow:` (okno obok drugiego okna, patrz tailwind.config.ts): siatka
// dostaje 3 równe wiersze na całą wysokość, a sekcje i rzędy kafli się w nie
// rozciągają — zamiast rzędów o wysokości treści rozepchniętych przez
// `content-between` (puste pasy w wysokim oknie, nachodzenie w niskim).
// Kafle mają wtedy wysokość z layoutu, a liczba skaluje się do kafla.
// `overview-fit-scope` liczy wspólny limit rozmiaru liczby (globals.css).
const NARROW_SECTION = 'overview-fit-scope narrow:flex narrow:flex-col';
const NARROW_TILE_ROW = 'narrow:flex-1 narrow:min-h-0 narrow:grid-rows-[minmax(0,1fr)]';

// Minimalne budżety znaków (`fitValueChars`) dla typowych odczytów sekcji:
// "6.89" bar / "456.3" kW. Większa wartość tylko zmniejsza czcionkę rzędu.
const COOLING_FIT_MIN_CHARS = 4;
const COMPRESSOR_FIT_MIN_CHARS = 4;
const POWER_FIT_MIN_CHARS = 5;
const TOTAL_POWER_FIT_MIN_CHARS = 4;
// Suma mocy wyświetlana bez miejsc po przecinku — ta sama wartość zasila
// kafel i jego budżet znaków.
const TOTAL_POWER_DECIMALS = 0;

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
 *
 * Niezależnie od szerokości działa czwarty tryb, `narrow:` (okno o proporcjach
 * węższych niż 3:2, np. przeglądarka obok drugiego okna): siatka 3 równych
 * wierszy z odstępem i liczby skalowane do kafli — patrz `NARROW_SECTION`.
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
        {/* `narrow:` (decyzja użytkownika, październik 2026): jeden rząd —
         * logo, pigułki po jego prawej, LIVE w prawym rogu. Nic się nie
         * zawija pod logo: gdy pigułki się nie mieszczą, zawijają się
         * wewnątrz swojego obszaru (`flex-1 min-w-0`), a logo i LIVE zostają
         * na miejscu — zamiast samotnego LIVE w osobnej, trzeciej linii.
         * Ciaśniejsze odstępy, padding i rozstrzelenie liter pigułek
         * (`narrow:gap-*`, `narrow:px-2`, `narrow:tracking-wider`) i brak
         * separatora (logo samo oddziela nawigację) mieszczą wszystkie pięć
         * w jednym rzędzie już w oknie ~940px, z zapasem na inną czcionkę. */}
        <header className="shrink-0 flex flex-wrap narrow:flex-nowrap items-center gap-x-4 narrow:gap-x-3 gap-y-2 xl:gap-x-6 pb-4 xl:pb-5 2xl:pb-6 border-b border-slate-100">
          <div className="flex items-center gap-4 xl:gap-5 2xl:gap-6 flex-wrap min-w-0 narrow:flex-1 narrow:flex-nowrap narrow:gap-3">
            {/* Logo LineFLOW zamiast widocznego tytułu (decyzja użytkownika,
             * październik 2026). `h-5 xl:h-6` — 20px to minimum wordmarku
             * (brand/LOGO-SPEC.md §10). `my-1` daje 32px od progu `xl`, czyli
             * wysokość linii dawnego tytułu (`text-2xl` niesie własny
             * line-height) — nagłówek i siatka kiosku zostają co do piksela.
             * Poniżej `xl` (28px) wysokość nagłówka i tak wyznacza wyższy
             * znacznik LIVE (~29px); gdyby kiedyś zmalał poniżej 28px, nagłówek
             * w wąskim oknie urośnie o kilka px. `h1` zostaje dla czytników
             * ekranu i nawigacji po nagłówkach. */}
            <Logo wink className="h-5 xl:h-6 my-1" />
            <h1 className="sr-only">Przegląd zakładu</h1>
            <div aria-hidden="true" className="hidden sm:block narrow:hidden shrink-0 w-px h-5 xl:h-6 bg-slate-200" />
            {/* Nawigacja skrótowa do widoku przypiętego per obszar (decyzja
             * #37). Prowadzi do `/?area=X`, które `useDisplayMode` rozwiązuje
             * do trybu 'pinned' (decyzja #25/#26) — istniejący mechanizm
             * routingu, żadna nowa logika nawigacji. */}
            <nav
              aria-label="Obszary zakładu"
              className="flex flex-wrap items-center gap-2 xl:gap-2.5 2xl:gap-3 narrow:gap-1.5 narrow:flex-1 narrow:min-w-0"
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
                  className="bg-slate-50 hover:bg-slate-100 hover:text-slate-900 active:scale-95 transition-all duration-200 rounded-full px-3 py-1 xl:px-3.5 xl:py-1 2xl:px-4 2xl:py-1.5 narrow:px-2 text-[10px] xl:text-[11px] 2xl:text-xs font-black uppercase tracking-widest narrow:tracking-wider text-slate-600"
                >
                  {/* Ikona sama nie niesie treści (aria-hidden, nie wchodzi do
                   * nazwy dostępnej linku) — sygnalizuje wyłącznie wizualnie,
                   * że ta pigułka "przypina" widok i trwale zatrzymuje rotację
                   * karuzeli, w odróżnieniu od chwilowych zakładek obszaru
                   * wewnątrz samej karuzeli (Wallboard.tsx), które rotację
                   * zachowują. */}
                  <Pin aria-hidden="true" className="inline-block w-2.5 h-2.5 mr-1 narrow:mr-0.5 text-slate-400" strokeWidth={2.5} />
                  {area.name}
                </Link>
              ))}
            </nav>
          </div>
          {/* `narrow:min-w-[7rem]`: stała szerokość niezależnie od stanu (LIVE
           * 72px, OFFLINE 96px, ŁĄCZENIE 104px) — inaczej każda zmiana
           * połączenia przerzucałaby pigułki do drugiej linii i cała siatka
           * skakałaby o ~23px. */}
          <ConnectionStatus
            status={status}
            lastEventAt={lastEventAt}
            className="ml-auto shrink-0 narrow:min-w-[7rem] narrow:justify-center"
          />
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
          className="flex-1 min-h-0 grid content-between narrow:[container-type:size] narrow:grid-rows-[repeat(3,minmax(0,1fr))] narrow:gap-y-[var(--overview-narrow-row-gap)] gap-x-6 xl:gap-x-8 2xl:gap-x-10 gap-y-3 xl:gap-y-4 2xl:gap-y-6 pt-4 xl:pt-5 2xl:pt-6 overflow-hidden"
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
  const fitChars = fitValueChars(
    [
      ...[tempMetric, pressureMetric].flatMap((m) => (m ? [{ value: m.value, decimals: m.decimals }] : [])),
      // `OverviewTankTile` zaokrągla poziom do pełnych cm niezależnie od
      // `decimals` z rejestru — budżet musi liczyć to, co faktycznie widać.
      ...(levelMetric ? [{ value: levelMetric.value, decimals: 0 }] : []),
    ],
    COOLING_FIT_MIN_CHARS
  );

  return (
    // `self-center` zamiast domyślnego `stretch`: w rzędzie 2 ta sekcja
    // (jednorzędowa) dzieli tor gridu z "Energią elektryczną"
    // (dwurzędową, wyższą) — bez tego karta rozciąga się do wysokości
    // sąsiada, a cały nadmiar trafia pod jej kaflami, robiąc odstęp do
    // "Chłodnia 3" większy niż odstęp od "Chłodnia 1". Wyśrodkowanie
    // dzieli ten nadmiar po równo góra/dół, więc oba odstępy się wyrównują.
    // Dla rzędów 1 i 3, gdzie wysokości obu kolumn już się pokrywają, nie
    // ma to żadnego efektu wizualnego.
    // W `narrow:` wiersze są równe (Energia zajmuje dwa), więc wyśrodkowanie
    // nie jest potrzebne — sekcja rozciąga się na cały swój wiersz.
    <section className={cn('min-h-0 shrink-0 self-center narrow:self-stretch', NARROW_SECTION)}>
      <SectionHeading icon={Snowflake} color="slate">
        {definition.name}
      </SectionHeading>
      <div className={cn('grid grid-cols-3 gap-2 xl:gap-3 2xl:gap-4', NARROW_TILE_ROW)}>
        {tempMetric && (
          <OverviewMetricTile
            testId={`overview-metric-tile-${tempMetric.id}`}
            label="Temperatura"
            value={tempMetric.value}
            unit={tempMetric.unit}
            decimals={tempMetric.decimals}
            alarm={tempMetric.alarm}
            offline={offline}
            fitChars={fitChars}
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
            fitChars={fitChars}
          />
        )}
        {levelMetric && (
          <OverviewTankTile
            testId={`overview-tank-tile-${levelMetric.id}`}
            valueCm={levelMetric.value}
            maxCm={definition.maxCm ?? 100}
            alarm={levelMetric.alarm}
            offline={offline}
            fitChars={fitChars}
          />
        )}
      </div>
    </section>
  );
}

function CompressorSection({ snapshot }: { snapshot: AreaSnapshot | undefined }) {
  // NIE `!snapshot.isOnline` (AND obu fizycznych PLC Sprężarkowni — MA_M3
  // dla Magazynu Aluminium, MB_M2 dla Magazynu Bębnów, patrz
  // `build_area_payload` w backendzie): to gasiło OBIE karty razem, gdy
  // padał TYLKO JEDEN sterownik (zgłoszenie użytkownika, wrzesień 2026 —
  // ten sam defekt co w CompressorAreaView.tsx, tu na ekranie głównym).
  // Każda metryka niesie teraz WŁASNY `online` z jej własnego PLC.
  //
  // Sierpień 2026: Sprężarkownia dostała kafle urządzeń (PRACA/AWARIA per
  // sprężarka, unit="") obok swoich metryk analogowych (ciśnienie/przepływ),
  // ten sam wzorzec co Chłodnia 1/2/3 (`src/lib/areas.ts`). Overview pokazuje
  // wyłącznie odczyty analogowe — bity urządzeń mają swój ekran szczegółowy
  // (`CompressorAreaView`), tu wylądowałyby jako bezsensowne kafle "0"/"1".
  //
  // Z odczytów analogowych overview bierze DOKŁADNIE DWA — ciśnienie zbiornika
  // per magazyn — zgodnie z decyzją #28 (Concept.md: "Sprężarkownia na overview:
  // DWIE osobne karty"). Ciśnienie kolektora i przepływ powietrza (dołożone do
  // rejestru w sierpniu 2026) należą wyłącznie do ekranu szczegółowego.
  //
  // To NIE jest kosmetyka, tylko naprawa realnej regresji: filtr po samym
  // `unit !== ''` przepuścił nowe metryki i prawa kolumna urosła z 1 rzędu
  // kafli do 2. Nadrzędny grid ma `content-between`, więc przy ujemnej wolnej
  // przestrzeni `space-between` rozkłada ujemny odstęp i **nakłada wiersze na
  // siebie** — sekcja Energii wchodziła na Sprężone powietrze. Ujawniało się
  // dopiero przy szerokim, ale niskim oknie (tier `2xl` + wysokość ≲960px,
  // czyli zwykłe okno przeglądarki na monitorze 1080p), dlatego weryfikacja
  // na pełnych rozdzielczościach 768/1080/1440 tego nie wyłapała.
  const OVERVIEW_METRIC_SUFFIXES = ['-cisnienie-zbiornik'];
  const metrics = (snapshot?.metrics ?? []).filter(
    (m) => m.unit !== '' && OVERVIEW_METRIC_SUFFIXES.some((s) => m.id.endsWith(s))
  );
  const fitChars = fitValueChars(metrics, COMPRESSOR_FIT_MIN_CHARS);

  return (
    <section className={cn('min-h-0 shrink-0', NARROW_SECTION)}>
      {/* Makieta nazywa tę sekcję "Sprężone powietrze", mimo że rejestr (i
       * pasek nazw obszarów powyżej) używa "Sprężarkownia" — świadomie różne
       * etykiety w dwóch miejscach, zgodnie z decyzją #27/makietą. */}
      <SectionHeading icon={Wind} color="slate">
        Sprężone powietrze
      </SectionHeading>
      <div className={cn('grid grid-cols-2 gap-2 xl:gap-3 2xl:gap-4', NARROW_TILE_ROW)}>
        {metrics.map((metric) => (
          <OverviewMetricTile
            key={metric.id}
            testId={`overview-metric-tile-${metric.id}`}
            // "Magazyn Aluminium — Ciśnienie zbiornik" → "Magazyn Aluminium":
            // nagłówek sekcji ("Sprężone powietrze") już mówi, o jaki odczyt
            // chodzi, a makieta z decyzji #28 podpisuje te kafle samą nazwą
            // magazynu. Ten sam idiom co w `PowerSection` niżej.
            label={metric.label.split(' — ')[0]}
            value={metric.value}
            unit={metric.unit}
            decimals={metric.decimals}
            alarm={metric.alarm}
            offline={metric.online === false}
            fitChars={fitChars}
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
  const fitChars = fitValueChars(activePowerMetrics, POWER_FIT_MIN_CHARS);
  const totalFitChars = fitValueChars([{ value: totalKw, decimals: TOTAL_POWER_DECIMALS }], TOTAL_POWER_FIT_MIN_CHARS);

  return (
    // `narrow:row-span-2`: Energia (dwa rzędy kafli) zajmuje wiersze 2–3 prawej
    // kolumny, obok Chłodni 2 i 3 — prawa kolumna kończy się równo z lewą,
    // zamiast zostawiać pustkę pod spodem. `grid-rows-[subgrid]` dzieli sekcję
    // dokładnie na te same dwa wiersze (z tym samym odstępem), więc kafle
    // trafostacji mają wysokość kafli Chłodni 2, a kafel sumy — Chłodni 3
    // (decyzja użytkownika, październik 2026). Poza `narrow:` oba wrappery to
    // zwykłe bloki i layout kiosku zostaje bez zmian.
    <section className="overview-fit-scope min-h-0 shrink-0 narrow:grid narrow:grid-rows-[subgrid] narrow:row-span-2">
      <div className={cn('min-h-0', NARROW_SECTION)}>
        <SectionHeading icon={Zap} color="slate">
          {definition.name}
        </SectionHeading>
        <div
          className={cn(
            'grid grid-cols-3 gap-2 xl:gap-3 2xl:gap-4 mb-2 xl:mb-3 2xl:mb-4 narrow:mb-0',
            NARROW_TILE_ROW
          )}
        >
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
              fitChars={fitChars}
            />
          ))}
        </div>
      </div>
      <div className={cn('min-h-0', NARROW_SECTION)}>
        {/* Niewidoczny odpowiednik nagłówka sekcji tylko w `narrow:`: Chłodnia 3
         * obok ma nad kaflami własny nagłówek, więc bez tej rezerwy kafel sumy
         * zaczynałby się wyżej i był wyższy niż jej kafle. Ten sam komponent
         * co prawdziwy nagłówek = identyczna wysokość na każdym progu.
         * `aria-hidden` + `invisible` — czytnik ekranu nie widzi duplikatu. */}
        <div aria-hidden="true" className="hidden narrow:block invisible">
          <SectionHeading icon={Zap} color="slate">
            {definition.name}
          </SectionHeading>
        </div>
        {snapshot && (
          <OverviewMetricTile
            testId="overview-metric-tile-total-active-power"
            label="Sumaryczne zużycie"
            value={totalKw}
            unit="kW"
            decimals={TOTAL_POWER_DECIMALS}
            alarm={anyActivePowerAlarm}
            offline={offline}
            fitChars={totalFitChars}
            className="narrow:flex-1 narrow:min-h-0"
          />
        )}
      </div>
    </section>
  );
}
