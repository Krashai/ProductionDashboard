import type { AreaType } from '@/lib/types';

export interface MetricDefinition {
  id: string;
  label: string;
  unit: string;
  decimals: number;
}

/** Metric id-y trzech bitów/wartości jednego urządzenia (kafel Chłodni
 * 1/2/3, sierpień 2026) — `hz` tylko dla urządzeń z regulacją obrotów
 * (patrz `DeviceSpec.hasFrequency`). */
export interface DeviceMetricIds {
  praca: string;
  awaria: string;
  hz?: string;
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
   * Concept.md) — każde urządzenie generuje dwie/trzy dodatkowe pozycje w
   * `metrics` (PRACA/AWARIA/Hz, patrz `buildDeviceGroup`), bo to jedyne
   * miejsce, które faktycznie steruje tym, co płynie przez WS/mock
   * (mirror: `backend/app/domain/areas.py`). */
  deviceGroups?: DeviceGroupDefinition[];
}

interface DeviceSpec {
  id: string;
  label: string;
  /** Urządzenie z regulacją obrotów (VFD) dodatkowo pokazuje zadaną
   * częstotliwość w Hz na swoim kaflu (np. jedna z 5 pomp Hyamat). */
  hasFrequency?: boolean;
}

function buildDeviceGroup(
  areaId: string,
  groupId: string,
  groupLabel: string,
  devices: DeviceSpec[]
): { group: DeviceGroupDefinition; metrics: MetricDefinition[] } {
  const metrics: MetricDefinition[] = [];
  const deviceDefs: DeviceDefinition[] = devices.map((device) => {
    const pracaId = `${areaId}-${device.id}-praca`;
    const awariaId = `${areaId}-${device.id}-awaria`;
    metrics.push({ id: pracaId, label: `${device.label} — Praca`, unit: '', decimals: 0 });
    metrics.push({ id: awariaId, label: `${device.label} — Awaria`, unit: '', decimals: 0 });

    const metricIds: DeviceMetricIds = { praca: pracaId, awaria: awariaId };
    if (device.hasFrequency) {
      const hzId = `${areaId}-${device.id}-hz`;
      metrics.push({ id: hzId, label: `${device.label} — Częstotliwość`, unit: 'Hz', decimals: 1 });
      metricIds.hz = hzId;
    }

    return { id: device.id, label: device.label, metricIds };
  });

  return { group: { id: groupId, label: groupLabel, devices: deviceDefs }, metrics };
}

interface DeviceGroupSpec {
  id: string;
  label: string;
  devices: DeviceSpec[];
}

// Wspólna dla wszystkich 3 chłodni grupa 5 pomp obiegowych stacji Hyamat —
// jedna z nich ma regulację obrotów (VFD), więc dodatkowo pokazuje zadaną
// częstotliwość w Hz. Nazwy "Pompa 1..5" są robocze (brak realnych nazw
// punktów PLC w źródłowych notatkach) — `Tag.label` jest edytowalny w
// panelu admina, nie blokuje to podpięcia realnych bitów później.
function pumpGroupSpec(): DeviceGroupSpec {
  return {
    id: 'pompy',
    label: 'Pompy obiegowe',
    devices: [
      { id: 'pompa-1', label: 'Pompa 1', hasFrequency: true },
      { id: 'pompa-2', label: 'Pompa 2' },
      { id: 'pompa-3', label: 'Pompa 3' },
      { id: 'pompa-4', label: 'Pompa 4' },
      { id: 'pompa-5', label: 'Pompa 5' },
    ],
  };
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

  const built = deviceGroupSpecs.map((spec) => buildDeviceGroup(id, spec.id, spec.label, spec.devices));

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
// Chłodnia 1 ma DWIE osobne grupy sprężarkowe (Sprężarki: V101/V201,
// Agregaty: KWR125A/KWR125B), Chłodnia 2/3 mają tylko jedną (Sprężarki:
// V301A/V301B) — potwierdzone wprost przez użytkownika, nie założenie.
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
    pumpGroupSpec(),
  ]),
  coolingArea('chlodnia-2', 'Chłodnia 2', 150, [
    {
      id: 'sprezarki',
      label: 'Sprężarki',
      devices: [
        { id: 'v301a', label: 'V301A' },
        { id: 'v301b', label: 'V301B' },
      ],
    },
    pumpGroupSpec(),
  ]),
  coolingArea('chlodnia-3', 'Chłodnia 3', 150, [
    {
      id: 'sprezarki',
      label: 'Sprężarki',
      devices: [
        { id: 'v301a', label: 'V301A' },
        { id: 'v301b', label: 'V301B' },
      ],
    },
    pumpGroupSpec(),
  ]),
  compressorArea(),
  powerArea(),
];
