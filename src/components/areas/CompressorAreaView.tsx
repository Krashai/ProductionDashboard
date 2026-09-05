import { DeviceStatusTile } from '@/components/DeviceStatusTile';
import { OverviewMetricTile } from '@/components/OverviewMetricTile';
import { deriveDeviceGroupStatuses } from '@/lib/device-status';
import { cn, stripSectionPrefix } from '@/lib/utils';
import type { AreaDefinition } from '@/lib/areas';
import type { AreaSnapshot } from '@/lib/types';

interface CompressorAreaViewProps {
  area: AreaSnapshot;
  definition: AreaDefinition;
}

// Id grup muszą być zgodne z `compressorArea()` w `src/lib/areas.ts`.
const ALUMINIUM_GROUP_ID = 'magazyn-aluminium';
const BEBNY_GROUP_ID = 'magazyn-bebnow';

/**
 * Waga kolumny sekcji w siatce ekranu — i JEDNOCZEŚNIE liczba kolumn obu
 * wewnętrznych rzędów tej sekcji (urządzenia i odczyty). To musi być ta sama
 * liczba, bo dopiero wtedy kafel z jednej sekcji ma praktycznie identyczną
 * szerokość co kafel z drugiej, mimo że sekcje niosą różną ilość danych:
 *   kolumna o wadze W ma szerokość W·u (u = jednostka `fr`), a jej rząd
 *   dzieli ją na W kolumn → kafel = (W·u − (W−1)·g)/W = u − g·(W−1)/W,
 * czyli dla W=2 i W=3 różnica to zaledwie g/6 (≈4 px przy `2xl:gap-6`).
 * Efekty: samotny odczyt Magazynu Aluminium NIE rozdyma się już na całą
 * kolumnę (dotychczasowe `flex-1` dawało mu 900 px przy 1920×1080 wobec
 * 284 px kafli sąsiedniej sekcji), a nadmiar miejsca w rzędzie urządzeń
 * Magazynu Bębnów (2 sprężarki na 3 kolumny) zostaje jako jedna pusta
 * komórka siatki wyrównana z kaflem pod spodem, a nie jako przypadkowy pas
 * po prawej. Bez ani jednego ręcznie dobranego `max-w`.
 *
 * Dlaczego akurat 2:3, a nie proporcja czystej "ilości treści" (3:5 — po 2
 * urządzenia + 1 vs 3 odczyty)? Lewa kolumna ma twardą podłogę: dwa
 * `DeviceStatusTile` muszą zmieścić się obok siebie w JEDNEJ linii na każdej
 * szerokości kiosku (`<main>` jest `overflow-hidden` — zawinięty kafel nie
 * zjeżdża na scroll, tylko znika pod krawędzią). Najciaśniej jest przy
 * 1366×768: do podziału zostaje 1366 − 2·24 (`px-6`) − 24 (`gap-6`) = 1294 px,
 * więc 2/5 daje 517 px → kafel 253 px przy 158 px potrzebnych na
 * jednoliniową etykietę "SPRĘŻARKA 1" i 157 px na rząd kropek (zmierzone).
 * Podział 3:5 zszedłby do 194 px na kafel i zaczął ściskać treść.
 */
const ALUMINIUM_WEIGHT = 2;
const BEBNY_WEIGHT = 3;

// Tailwind skanuje źródła statycznie — klasy muszą istnieć dosłownie.
const SECTION_GRID_CLASSES: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
};


/**
 * Ekran szczegółowy Sprężarkowni — korekta po konsultacji z użytkownikiem
 * (sierpień 2026): jeden slajd karuzeli (decyzja #17), ale dwie fizycznie
 * odrębne sekcje UI obok siebie — "Magazyn Aluminium" i "Magazyn Bębnów" —
 * każda z własną parą sprężarek (kafle PRACA/AWARIA, bez regulacji obrotów —
 * żadna z nich nie ma VFD, więc `DeviceStatusTile` nie dostaje tu ani
 * `frequencyHz`, ani `reserveFrequencyRow`) i własnymi odczytami
 * analogowymi. Ten sam wzorzec komponentów (`DeviceStatusTile`,
 * `OverviewMetricTile`, `deriveDeviceGroupStatuses`) co `CoolingAreaView` —
 * celowo brak tu banera "wyłączona"/`deriveCoolingOperationalState`, bo
 * warunek dotyczy tylko pomp obiegowych chłodni, nie sprężarek.
 */
export function CompressorAreaView({ area, definition }: CompressorAreaViewProps) {
  const offline = !area.isOnline;

  const groupStatuses = deriveDeviceGroupStatuses(definition.deviceGroups, area.metrics, offline);
  const aluminiumGroup = groupStatuses.find((g) => g.id === ALUMINIUM_GROUP_ID);
  const bebnyGroup = groupStatuses.find((g) => g.id === BEBNY_GROUP_ID);

  const aluminiumMetricIds = [`${definition.id}-magazyn-aluminium-cisnienie-zbiornik`];
  const bebnyMetricIds = [
    `${definition.id}-magazyn-bebnow-cisnienie-zbiornik`,
    `${definition.id}-magazyn-bebnow-cisnienie-kolektor`,
    `${definition.id}-magazyn-bebnow-przeplyw-powietrza`,
  ];

  return (
    // Kolumny ważone treścią zamiast `grid-cols-2` — patrz `ALUMINIUM_WEIGHT`.
    <div className="grid grid-cols-[2fr_3fr] gap-6 2xl:gap-10 h-full">
      <CompressorSection
        groupId={ALUMINIUM_GROUP_ID}
        heading="Magazyn Aluminium"
        devices={aluminiumGroup?.devices ?? []}
        metricIds={aluminiumMetricIds}
        columns={ALUMINIUM_WEIGHT}
        area={area}
        offline={offline}
      />
      <CompressorSection
        groupId={BEBNY_GROUP_ID}
        heading="Magazyn Bębnów"
        devices={bebnyGroup?.devices ?? []}
        metricIds={bebnyMetricIds}
        columns={BEBNY_WEIGHT}
        area={area}
        offline={offline}
      />
    </div>
  );
}

interface CompressorSectionProps {
  groupId: string;
  heading: string;
  devices: ReturnType<typeof deriveDeviceGroupStatuses>[number]['devices'];
  metricIds: string[];
  /** Liczba kolumn OBU rzędów sekcji; musi być równa wadze jej kolumny w
   * siatce ekranu — patrz `ALUMINIUM_WEIGHT`. */
  columns: number;
  area: AreaSnapshot;
  offline: boolean;
}

function CompressorSection({
  groupId,
  heading,
  devices,
  metricIds,
  columns,
  area,
  offline,
}: CompressorSectionProps) {
  const metrics = metricIds
    .map((id) => area.metrics.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => m !== undefined);

  return (
    <section className="min-h-0 flex flex-col gap-3 2xl:gap-6">
      <div className="shrink-0 flex items-center gap-2 2xl:gap-3">
        <p className="font-black text-slate-500 uppercase tracking-[0.3em] text-[10px] 2xl:text-sm">
          {heading}
        </p>
        {devices.length > 0 && (
          <span
            data-testid={`compressor-group-summary-${groupId}`}
            className={cn(
              'rounded-full border px-2 py-0.5 2xl:px-3 2xl:py-1 text-[9px] 2xl:text-xs font-black uppercase tracking-widest',
              devices.some((d) => d.fault)
                ? 'border-rose-200 bg-rose-50 text-rose-600 animate-alarm-flash motion-reduce:animate-none'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            )}
          >
            {devices.filter((d) => d.running).length} z {devices.length} pracuje
          </span>
        )}
      </div>
      {/* Podział wysokości 1:1 między rząd urządzeń a rząd odczytów (`flex-1`
       * na obu). Poprzednio rząd metryk miał `flex-1`, a rząd urządzeń
       * `shrink-0`, więc CAŁA nadmiarowa wysokość ekranu (przy 1920×1080 ok.
       * 460 px ponad naturalną wysokość treści) lądowała w kaflach metryk —
       * kafel rósł do 645 px z wartością przyklejoną do górnej i etykietą do
       * dolnej krawędzi. To ten sam defekt co #42 w Concept.md, tyle że
       * wywołany rozkładem `flex`, a nie `stretch` w gridzie.
       *
       * Dlaczego 1:1, a nie z przewagą dla którejś strony: obie sekcje mają
       * po 2 kafle urządzeń, więc rząd urządzeń jest w obu identyczny i to on
       * wyznacza wspólną linię, na której czyta się PRACA/AWARIA w całej hali
       * — nierówny podział przesuwałby ją bez powodu. Przy 1920×1080 daje to
       * po ~417 px na rząd i kafle ~345×417 w obu rzędach i obu sekcjach:
       * urządzenie z dużymi kropkami (`size="lg"`) i odczyt z wielką liczbą
       * wyśrodkowaną w pionie (`align="center"`). Ekran wypełnia się w
       * całości — pod dolnym rzędem nie zostaje pusty pas. */}
      <div className={cn('flex-1 min-h-0 grid gap-3 2xl:gap-6', SECTION_GRID_CLASSES[columns])}>
        {devices.map((device) => (
          <DeviceStatusTile
            key={device.id}
            testId={`device-tile-${device.id}`}
            // `justify-center` zamiast domyślnego `justify-between`: na tym
            // ekranie kafel jest wyraźnie wyższy od swojej treści, a
            // `between` odklejałoby etykietę od kropek stanu na kilkaset px.
            className="justify-center"
            // Szerszy kafel z większymi kropkami — jedyne miejsce, gdzie w
            // rzędzie stoją tylko dwa urządzenia (Chłodnia ma ich do pięciu).
            // Przy okazji naprawia łamanie etykiety na "SPRĘŻARKA" / "1".
            size="lg"
            label={device.label}
            running={device.running}
            fault={device.fault}
            offline={device.offline}
          />
        ))}
      </div>
      <div className={cn('flex-1 min-h-0 grid gap-3 2xl:gap-6', SECTION_GRID_CLASSES[columns])}>
        {metrics.map((metric) => (
          <OverviewMetricTile
            key={metric.id}
            testId={`metric-card-${metric.id}`}
            label={stripSectionPrefix(metric.label, heading)}
            value={metric.value}
            unit={metric.unit}
            decimals={metric.decimals}
            alarm={metric.alarm}
            offline={offline}
            // `lg` jak na Chłodni — kafel dostaje tu ~40% wysokości ekranu,
            // więc odzyskaną przestrzeń wydajemy na czytelność liczby z
            // dystansu kioskowego, nie na puste pole.
            size="lg"
            align="center"
          />
        ))}
      </div>
    </section>
  );
}
