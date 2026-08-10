import type { AreaType } from '@/lib/types';

export interface MetricDefinition {
  id: string;
  label: string;
  unit: string;
  decimals: number;
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
}

function coolingArea(id: string, name: string, maxCm: number): AreaDefinition {
  return {
    id,
    name,
    type: 'cooling',
    maxCm,
    metrics: [
      { id: `${id}-temp`, label: 'Temperatura wody na halę', unit: '°C', decimals: 1 },
      { id: `${id}-pressure`, label: 'Ciśnienie wody na halę', unit: 'bar', decimals: 2 },
      { id: `${id}-level`, label: 'Poziom wody w zbiorniku', unit: 'cm', decimals: 0 },
    ],
  };
}

// Decyzja #17 (Concept.md) + korekta po konsultacji z użytkownikiem: fizyczne
// sprężarkownie 1 i 2 zasilają jedną wspólną sieć sprężonego powietrza, więc
// karuzela ma dla nich JEDEN slajd/obszar "Sprężarkownia" (nie dwa), a obie
// wartości ciśnienia trafiają na JEDNĄ kartę "Ciśnienie sieci" w UI.
// Metric/AreaSnapshot są zamrożone od Fazy 2 (decyzja #18) i celowo nie
// dostają pola grupującego — obszar typu 'compressor' ma z definicji zawsze
// dokładnie te dwie metryki, więc przyszły CompressorAreaView (Faza 3) może
// bezpiecznie renderować całą tablicę `metrics` jednej karty, bez dodatkowej
// flagi w typach.
function compressorArea(): AreaDefinition {
  return {
    id: 'sprezarkownia',
    name: 'Sprężarkownia',
    type: 'compressor',
    metrics: [
      { id: 'sprezarkownia-drums', label: 'Magazyn Bębnów', unit: 'bar', decimals: 2 },
      { id: 'sprezarkownia-aluminium', label: 'Magazyn Aluminium', unit: 'bar', decimals: 2 },
    ],
  };
}

// Korekta po konsultacji z użytkownikiem: Trafostacje 1/2/3 nie są osobnymi
// slajdami karuzeli — to JEDEN obszar "Energia elektryczna" z 6 metrykami
// (moc czynna + pozorna dla każdej z 3 trafostacji), etykietowanymi per
// trafostacja, żeby przyszła karta (Faza 3) mogła je czytelnie pogrupować.
function powerArea(): AreaDefinition {
  const substations = [1, 2, 3];
  // decimals 0→1: backend dzieli te surowe odczyty PLC przez 1000 (W→kW,
  // VA→kVA) u źródła (mirror w backend/app/domain/areas.py, zsynchronizowane
  // ręcznie) — dawne 5-cyfrowe watty (np. 44439) stają się np. 44.439, więc
  // 1 miejsce po przecinku (44.4) zachowuje użyteczną precyzję zamiast
  // zaokrąglać ją niemal całkowicie do zera.
  const metrics: MetricDefinition[] = substations.flatMap((n) => [
    {
      id: `trafostacja-${n}-active`,
      label: `Trafostacja ${n} — Moc czynna`,
      unit: 'kW',
      decimals: 1,
    },
    {
      id: `trafostacja-${n}-apparent`,
      label: `Trafostacja ${n} — Moc pozorna`,
      unit: 'kVA',
      decimals: 1,
    },
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
export const AREAS: AreaDefinition[] = [
  coolingArea('chlodnia-1', 'Chłodnia 1', 150),
  coolingArea('chlodnia-2', 'Chłodnia 2', 150),
  coolingArea('chlodnia-3', 'Chłodnia 3', 150),
  compressorArea(),
  powerArea(),
];
