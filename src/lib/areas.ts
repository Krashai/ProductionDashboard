import type { AreaType } from '@/lib/types';

export interface MetricDefinition {
  id: string;
  label: string;
  unit: string;
  decimals: number;
}

/** Metric id-y bitów/wartości jednego urządzenia (kafel Chłodni 1/2/3,
 * sierpień 2026 → wrzesień 2026). Zgeneralizowane po dodaniu Chłodni 3
 * (Darpin/Rhoss, faktyczne sprężarki — patrz komentarz przy `AREAS`):
 * - `awaria` bywa NIEOBECNE (Darpin nie ma bitu awarii w ogóle — patrz
 *   `DeviceSpec.hasAwaria`) albo tablicą WIELU bitów OR-owanych w jeden
 *   status "fault" na kaflu (Rhoss: "alarm sterowania" + "alarm pompy" —
 *   patrz `DeviceSpec.awariaLabels`), mimo że każdy bit nadal trafia do
 *   `area.metrics` jako osobna, nazwana metryka (pasek alarmów pokazuje je
 *   z osobna, kafel urządzenia — połączone).
 * - `hz` (dawniej VFD-specific) stał się `secondary` — jedna, opcjonalna
 *   dodatkowa wartość liczbowa urządzenia niezależna od jednostki: Hz dla
 *   pompy z regulacją obrotów, ale też bezjednostkowy "poziom pracy"
 *   sprężarki Darpin (patrz `DeviceSpec.secondaryMetric`). */
export interface DeviceMetricIds {
  praca: string;
  awaria?: string | string[];
  secondary?: string;
}

export interface DeviceDefinition {
  id: string;
  label: string;
  metricIds: DeviceMetricIds;
}

export interface DeviceGroupDefinition {
  id: string;
  label: string;
  devices: DeviceDefinition[];
  /** Krótka informacja kioskowa pod nagłówkiem grupy (np. "sprężarki w
   * trakcie podłączania do systemu") — wizualnie podrzędna wobec nagłówka,
   * NIE alarmowa (patrz `CoolingAreaView`, `data-testid="device-group-note-
   * ${group.id}"`). Generyczny mechanizm zamiast hardkodowania id obszaru w
   * widoku — Chłodnia 2 używa go dziś, ale każda przyszła grupa może. */
  note?: string;
}

export interface AreaDefinition {
  id: string;
  name: string;
  type: AreaType;
  metrics: MetricDefinition[];
  /**
   * Skala poziomu zbiornika w cm — tylko dla obszarów typu 'cooling'.
   * Żyje na definicji obszaru (nie na Metric), bo to własność fizycznego
   * zbiornika danej chłodni, nie odczytu — Concept.md §9 zał. 7.
   */
  maxCm?: number;
  /** Kafle urządzeń (sprężarki/agregaty/pompy) na ekranie szczegółowym
   * Chłodni 1/2/3 — tylko dla obszarów typu 'cooling'. Świadome, udoku-
   * mentowane odejście od "AREAS zamrożone od Fazy 2" (decyzja #18,
   * Concept.md) — każde urządzenie generuje jedną-cztery dodatkowe pozycje w
   * `metrics` (PRACA, zero/jeden/wiele bitów AWARIA, opcjonalna wartość
   * dodatkowa — patrz `buildDeviceGroup`), bo to jedyne miejsce, które
   * faktycznie steruje tym, co płynie przez WS/mock (mirror:
   * `backend/app/domain/areas.py`). */
  deviceGroups?: DeviceGroupDefinition[];
}

interface DeviceSpec {
  id: string;
  label: string;
  /** Dodatkowa wartość liczbowa urządzenia poza PRACA/AWARIA — np.
   * częstotliwość VFD (jedna z 5 pomp Hyamat) albo "poziom pracy" sprężarki
   * Darpin (Chłodnia 3). `slug` buduje sufiks metric id
   * (`${areaId}-${device.id}-${slug}`), `unit=''` renderuje się na kaflu bez
   * jednostki (patrz `DeviceStatusTile`). */
  secondaryMetric?: { slug: string; label: string; unit: string; decimals?: number };
  /** `false` — urządzenie NIE ma bitu awarii wcale (Darpin, Chłodnia 3: PLC
   * nie udostępnia takiego bitu). Domyślnie `true` (każde inne urządzenie w
   * tym pliku ma dokładnie jeden bit awarii). */
  hasAwaria?: boolean;
  /** Gdy urządzenie ma WIĘCEJ NIŻ JEDEN bit awarii (Rhoss, Chłodnia 3: "alarm
   * sterowania" + "alarm pompy") — każda etykieta generuje własną, osobno
   * nazwaną metrykę (pasek alarmów pokazuje je z osobna), ale
   * `DeviceMetricIds.awaria` staje się tablicą, a `deriveDeviceStatus` OR-uje
   * wszystkie bity w jeden status "fault" kafla (kafel ma tylko jedną kropkę
   * Awaria — decyzja użytkownika, nie dublujemy jej w `DeviceStatusTile`).
   * Nadpisuje `hasAwaria` (obecność `awariaLabels` oznacza "ma awarię"). */
  awariaLabels?: string[];
}

function buildDeviceGroup(
  areaId: string,
  groupId: string,
  groupLabel: string,
  devices: DeviceSpec[],
  note?: string
): { group: DeviceGroupDefinition; metrics: MetricDefinition[] } {
  const metrics: MetricDefinition[] = [];
  const deviceDefs: DeviceDefinition[] = devices.map((device) => {
    const pracaId = `${areaId}-${device.id}-praca`;
    metrics.push({ id: pracaId, label: `${device.label} — Praca`, unit: '', decimals: 0 });

    const metricIds: DeviceMetricIds = { praca: pracaId };

    if (device.awariaLabels && device.awariaLabels.length > 0) {
      metricIds.awaria = device.awariaLabels.map((label, index) => {
        const awariaId = `${areaId}-${device.id}-awaria-${index + 1}`;
        metrics.push({ id: awariaId, label: `${device.label} — ${label}`, unit: '', decimals: 0 });
        return awariaId;
      });
    } else if (device.hasAwaria !== false) {
      const awariaId = `${areaId}-${device.id}-awaria`;
      metrics.push({ id: awariaId, label: `${device.label} — Awaria`, unit: '', decimals: 0 });
      metricIds.awaria = awariaId;
    }

    if (device.secondaryMetric) {
      const { slug, label, unit, decimals = 0 } = device.secondaryMetric;
      const secondaryId = `${areaId}-${device.id}-${slug}`;
      metrics.push({ id: secondaryId, label: `${device.label} — ${label}`, unit, decimals });
      metricIds.secondary = secondaryId;
    }

    return { id: device.id, label: device.label, metricIds };
  });

  return { group: { id: groupId, label: groupLabel, devices: deviceDefs, note }, metrics };
}

interface DeviceGroupSpec {
  id: string;
  label: string;
  devices: DeviceSpec[];
  note?: string;
}

// Wspólny wzorzec pomp obiegowych stacji Hyamat dla wszystkich 3 chłodni —
// TYLKO Pompa 1 ma regulację obrotów (VFD), więc dodatkowo pokazuje zadaną
// częstotliwość w Hz; liczba pomp różni się per chłodnia (Chłodnia 1: 5,
// Chłodnia 2: 4, Chłodnia 3: 1 — potwierdzone przez użytkownika), stąd
// parametr `count` zamiast sztywnej listy. Nazwy "Pompa 1..N" są robocze
// (brak realnych nazw punktów PLC w źródłowych notatkach) — `Tag.label` jest
// edytowalny w panelu admina, nie blokuje to podpięcia realnych bitów
// później.
function pumpGroupSpec(count: number): DeviceGroupSpec {
  const devices: DeviceSpec[] = Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const device: DeviceSpec = { id: `pompa-${n}`, label: `Pompa ${n}` };
    if (n === 1) {
      device.secondaryMetric = { slug: 'hz', label: 'Częstotliwość', unit: 'Hz', decimals: 1 };
    }
    return device;
  });

  return { id: 'pompy', label: 'Pompy obiegowe', devices };
}

function coolingArea(
  id: string,
  name: string,
  maxCm: number,
  deviceGroupSpecs: DeviceGroupSpec[]
): AreaDefinition {
  const baseMetrics: MetricDefinition[] = [
    { id: `${id}-temp`, label: 'Temperatura wody na halę', unit: '°C', decimals: 1 },
    { id: `${id}-pressure`, label: 'Ciśnienie wody na halę', unit: 'bar', decimals: 2 },
    { id: `${id}-level`, label: 'Poziom wody w zbiorniku', unit: 'cm', decimals: 0 },
  ];

  const built = deviceGroupSpecs.map((spec) =>
    buildDeviceGroup(id, spec.id, spec.label, spec.devices, spec.note)
  );

  return {
    id,
    name,
    type: 'cooling',
    maxCm,
    metrics: [...baseMetrics, ...built.flatMap((b) => b.metrics)],
    deviceGroups: built.map((b) => b.group),
  };
}

// Decyzja #17 (Concept.md): fizyczne sprężarkownie 1 i 2 zasilają jedną
// wspólną sieć sprężonego powietrza, więc karuzela ma dla nich JEDEN
// slajd/obszar "Sprężarkownia" (nie dwa). Korekta po konsultacji z
// użytkownikiem (sierpień 2026): ten jeden obszar dostaje jednak DWIE
// wizualnie odrębne sekcje UI — "Magazyn Aluminium" i "Magazyn Bębnów" —
// każda z własną parą sprężarek (PRACA/AWARIA, bez regulacji obrotów) i
// własnymi odczytami ciśnienia/przepływu, ten sam wzorzec `buildDeviceGroup`
// co Chłodnia 1/2/3. Id urządzeń MUSZĄ być prefiksowane per sekcja
// (`aluminium-1`, nie gołe `sprezarka-1`), bo obie grupy dzielą jeden
// `areaId` "sprezarkownia" — `buildDeviceGroup` namespace'uje metric id jako
// `${areaId}-${device.id}-praca`, więc identyczne gołe id w obu grupach
// kolidowałoby.
function compressorArea(): AreaDefinition {
  const areaId = 'sprezarkownia';
  const aluminium = buildDeviceGroup(areaId, 'magazyn-aluminium', 'Magazyn Aluminium', [
    { id: 'aluminium-1', label: 'Sprężarka 1' },
    { id: 'aluminium-2', label: 'Sprężarka 2' },
  ]);
  const bebny = buildDeviceGroup(areaId, 'magazyn-bebnow', 'Magazyn Bębnów', [
    { id: 'bebny-1', label: 'Sprężarka 1' },
    { id: 'bebny-2', label: 'Sprężarka 2' },
  ]);

  const analogMetrics: MetricDefinition[] = [
    {
      id: `${areaId}-magazyn-aluminium-cisnienie-zbiornik`,
      label: 'Magazyn Aluminium — Ciśnienie zbiornik',
      unit: 'bar',
      decimals: 2,
    },
    {
      id: `${areaId}-magazyn-bebnow-cisnienie-zbiornik`,
      label: 'Magazyn Bębnów — Ciśnienie zbiornik',
      unit: 'bar',
      decimals: 2,
    },
    {
      id: `${areaId}-magazyn-bebnow-cisnienie-kolektor`,
      label: 'Magazyn Bębnów — Ciśnienie kolektor',
      unit: 'bar',
      decimals: 2,
    },
    {
      id: `${areaId}-magazyn-bebnow-przeplyw-powietrza`,
      label: 'Magazyn Bębnów — Przepływ powietrza',
      unit: 'm³/min',
      decimals: 1,
    },
  ];

  return {
    id: areaId,
    name: 'Sprężarkownia',
    type: 'compressor',
    metrics: [...aluminium.metrics, ...bebny.metrics, ...analogMetrics],
    deviceGroups: [aluminium.group, bebny.group],
  };
}

// Korekta po konsultacji z użytkownikiem: Trafostacje 1/2/3 nie są osobnymi
// slajdami karuzeli — to JEDEN obszar "Energia elektryczna". Ekran szczegółowy
// (sierpień 2026) rozrósł się z ubogiej siatki 6 kart (moc czynna+pozorna) do
// gęstego "arkusza danych" — 12 metryk na trafostację (napięcia L1N/L2N/L3N,
// prądy L1/L2/L3, moc czynna/bierna/pozorna, temperatura, THDi/THDu), 36
// metryk łącznie. Kolejność `metrics` per trafostacja ODZWIERCIEDLA docelową
// kolejność wyświetlania w `PowerAreaView`/`SubstationCard` (napięcia →
// prądy → moc → temperatura → THD), bo to jedyne miejsce, które faktycznie
// steruje tym, co płynie przez WS/mock (ten sam wzorzec co reszta tego pliku).
//
// `trafostacja-{n}-active`/`-apparent` (id, unit, decimals) MUSZĄ zostać bez
// zmian — czyta je `overview-power-summary.ts` (`unit === 'kW'`, poza
// zakresem tej zmiany) i `OverviewView.tsx` (ekran główny, też poza
// zakresem). decimals=1: backend dzieli surowe odczyty PLC przez 1000 (W→kW,
// VA→kVA) u źródła (mirror w backend/app/domain/areas.py) — dawne 5-cyfrowe
// waty (np. 44439) stają się np. 44.439, więc 1 miejsce po przecinku (44.4)
// zachowuje użyteczną precyzję zamiast zaokrąglać ją niemal do zera.
function powerArea(): AreaDefinition {
  const substations = [1, 2, 3];

  const metrics: MetricDefinition[] = substations.flatMap((n) => [
    { id: `trafostacja-${n}-l1n`, label: `Trafostacja ${n} — L1N`, unit: 'V', decimals: 0 },
    { id: `trafostacja-${n}-l2n`, label: `Trafostacja ${n} — L2N`, unit: 'V', decimals: 0 },
    { id: `trafostacja-${n}-l3n`, label: `Trafostacja ${n} — L3N`, unit: 'V', decimals: 0 },
    { id: `trafostacja-${n}-prad-l1`, label: `Trafostacja ${n} — L1 (prąd)`, unit: 'A', decimals: 1 },
    { id: `trafostacja-${n}-prad-l2`, label: `Trafostacja ${n} — L2 (prąd)`, unit: 'A', decimals: 1 },
    { id: `trafostacja-${n}-prad-l3`, label: `Trafostacja ${n} — L3 (prąd)`, unit: 'A', decimals: 1 },
    { id: `trafostacja-${n}-active`, label: `Trafostacja ${n} — Moc czynna`, unit: 'kW', decimals: 1 },
    { id: `trafostacja-${n}-reactive`, label: `Trafostacja ${n} — Moc bierna`, unit: 'kVAr', decimals: 1 },
    { id: `trafostacja-${n}-apparent`, label: `Trafostacja ${n} — Moc pozorna`, unit: 'kVA', decimals: 1 },
    { id: `trafostacja-${n}-temperatura`, label: `Trafostacja ${n} — Temperatura`, unit: '°C', decimals: 1 },
    { id: `trafostacja-${n}-thdi`, label: `Trafostacja ${n} — THDi`, unit: '%', decimals: 1 },
    { id: `trafostacja-${n}-thdu`, label: `Trafostacja ${n} — THDu`, unit: '%', decimals: 1 },
  ]);

  return {
    id: 'energia-elektryczna',
    name: 'Energia elektryczna',
    type: 'power',
    metrics,
  };
}

// maxCm 250→150 (korekta po konsultacji z użytkownikiem): fizyczna skala
// zbiornika jest niższa niż zakładano pierwotnie — przy 150cm zbiornik jest
// w pełni "zatopiony" (100% wypełnienia), reszta logiki (ratio = clamp(
// valueCm/maxCm, 0, 1)) nie wymaga żadnej zmiany.
//
// Chłodnia 1 ma DWIE osobne grupy sprężarkowe (Sprężarki: V101/V201,
// Agregaty: KWR125A/KWR125B) i 5 pomp obiegowych — potwierdzone wprost przez
// użytkownika, nie założenie.
//
// Chłodnia 2 ma jedną grupę sprężarkową (Sprężarki: V301A/V301B) i 4 pompy
// obiegowe. Sprężarki V301A/V301B fizycznie istnieją, ale są w trakcie
// podłączania do systemu PLC (wrzesień 2026) — kafle zostają jako
// placeholder (PRACA/AWARIA), grupa dostaje `note` z informacją dla
// operatora zamiast czekać z całym ekranem na dokończenie podłączenia.
//
// Chłodnia 3 KOREKTA (wrzesień 2026, potwierdzone wprost przez użytkownika —
// wcześniejszy komentarz w tym miejscu zakładał identyczne V301A/V301B jak
// Chłodnia 2, co było błędnym założeniem, nie faktem): fizycznie ma DWIE
// RÓŻNE jednostki sprężarkowe, nie parę bliźniaczych sprężarek:
// - Darpin: jeden bit PRACA + jedna wartość INT "poziom pracy sprężarki"
//   (`secondaryMetric`) — BRAK bitu awarii w PLC (`hasAwaria: false`).
// - Rhoss: jeden bit PRACA + DWA osobne bity awarii — "alarm sterowania" i
//   "alarm pompy" (`awariaLabels`) — OR-owane w jeden status "fault" na
//   kaflu (`deriveDeviceStatus`), ale nadal dwie osobno nazwane metryki dla
//   paska alarmów.
// Chłodnia 3 ma tylko 1 pompę obiegową (nie 5/4 jak Chłodnia 1/2).
export const AREAS: AreaDefinition[] = [
  coolingArea('chlodnia-1', 'Chłodnia 1', 150, [
    {
      id: 'sprezarki',
      label: 'Sprężarki',
      devices: [
        { id: 'v101', label: 'V101' },
        { id: 'v201', label: 'V201' },
      ],
    },
    {
      id: 'agregaty',
      label: 'Agregaty',
      devices: [
        { id: 'kwr125a', label: 'KWR125A' },
        { id: 'kwr125b', label: 'KWR125B' },
      ],
    },
    pumpGroupSpec(5),
  ]),
  coolingArea('chlodnia-2', 'Chłodnia 2', 150, [
    {
      id: 'sprezarki',
      label: 'Sprężarki',
      note: 'Sprężarki w trakcie podłączania do systemu.',
      devices: [
        { id: 'v301a', label: 'V301A' },
        { id: 'v301b', label: 'V301B' },
      ],
    },
    pumpGroupSpec(4),
  ]),
  coolingArea('chlodnia-3', 'Chłodnia 3', 150, [
    {
      id: 'sprezarki',
      label: 'Sprężarki',
      devices: [
        {
          id: 'darpin',
          label: 'Darpin',
          secondaryMetric: { slug: 'poziom', label: 'Poziom pracy', unit: '', decimals: 0 },
          hasAwaria: false,
        },
        {
          id: 'rhoss',
          label: 'Rhoss',
          awariaLabels: ['Alarm sterowania', 'Alarm pompy'],
        },
      ],
    },
    pumpGroupSpec(1),
  ]),
  compressorArea(),
  powerArea(),
];
