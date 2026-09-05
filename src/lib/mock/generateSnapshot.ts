import type { AreaDefinition, MetricDefinition } from '@/lib/areas';
import type { AreaSnapshot, Metric } from '@/lib/types';

export const DEFAULT_HISTORY_LENGTH = 30;
export const ALARM_PROBABILITY = 0.05;

// Krok błądzenia losowego jako ułamek szerokości zakresu — na tyle mały, żeby
// kolejne odczyty wyglądały jak realny sygnał z PLC, nie biały szum.
const WALK_STEP_RATIO = 0.08;

// PRACA/AWARIA urządzeń (Chłodnia 1/2/3, sierpień 2026) to metryki z
// unit="" — 0/1, nie ciągła wartość analogowa, więc dostają własną,
// "lepką" generację (rzadka zmiana stanu między odczytami) zamiast
// błądzenia losowego po zakresie. Większość urządzeń pracuje w spoczynku,
// awarie są rzadkie — realistyczniejszy mock niż 50/50 losowanie.
const BOOL_FLIP_PROBABILITY = 0.03;
const PRACA_INITIAL_PROBABILITY = 0.9;
const AWARIA_INITIAL_PROBABILITY = 0.02;

export interface GenerateSnapshotOptions {
  previous?: AreaSnapshot;
  now?: () => Date;
  random?: () => number;
  historyLength?: number;
}

export function generateSnapshot(
  area: AreaDefinition,
  options: GenerateSnapshotOptions = {}
): AreaSnapshot {
  const random = options.random ?? Math.random;
  const now = options.now ?? (() => new Date());
  const historyLength = options.historyLength ?? DEFAULT_HISTORY_LENGTH;
  const previousById = new Map(
    (options.previous?.metrics ?? []).map((metric) => [metric.id, metric])
  );

  const metrics: Metric[] = area.metrics.map((definition) =>
    generateMetric(definition, area, previousById.get(definition.id), random, historyLength)
  );

  return {
    id: area.id,
    name: area.name,
    type: area.type,
    metrics,
    lastSeenAt: now().toISOString(),
    isOnline: true,
  };
}

function generateMetric(
  definition: MetricDefinition,
  area: AreaDefinition,
  previous: Metric | undefined,
  random: () => number,
  historyLength: number
): Metric {
  // Bool (PRACA/AWARIA urządzeń, unit="") to dyskretny 0/1, nie ciągła
  // wartość — osobna ścieżka generacji, żadnego błądzenia losowego po
  // zakresie. `alarm` zostaje zawsze false: AWARIA sygnalizuje się przez
  // wartość samej metryki (patrz `src/lib/device-status.ts`), nie przez
  // ten ogólny flag — inaczej losowy alarm=true na metryce "V101 — Praca"
  // trafiłby bez sensu do globalnego paska alarmów (AlarmBar).
  if (definition.unit === '') {
    const value = nextBoolValue(definition, previous?.value, random);
    const history = [...(previous?.history ?? []), value].slice(-historyLength);
    return { id: definition.id, label: definition.label, value, unit: definition.unit, decimals: definition.decimals, history, alarm: false };
  }

  const range = resolveRange(definition, area);
  const rawValue = nextValue(range, previous?.value, random);
  const value = roundTo(rawValue, definition.decimals);
  const history = [...(previous?.history ?? []), value].slice(-historyLength);
  const alarm = random() < ALARM_PROBABILITY;

  return {
    id: definition.id,
    label: definition.label,
    value,
    unit: definition.unit,
    decimals: definition.decimals,
    history,
    alarm,
  };
}

function nextBoolValue(
  definition: MetricDefinition,
  previousValue: number | undefined,
  random: () => number
): 0 | 1 {
  if (previousValue === undefined) {
    const initialProbability = definition.id.endsWith('-awaria')
      ? AWARIA_INITIAL_PROBABILITY
      : PRACA_INITIAL_PROBABILITY;
    return random() < initialProbability ? 1 : 0;
  }
  if (random() < BOOL_FLIP_PROBABILITY) {
    return previousValue === 1 ? 0 : 1;
  }
  return previousValue === 1 ? 1 : 0;
}

type Range = [min: number, max: number];

function resolveRange(definition: MetricDefinition, area: AreaDefinition): Range {
  switch (definition.unit) {
    case '°C':
      // Temperatura transformatora (obszar 'power') to zupełnie inna
      // fizyczna skala niż temperatura wody chłodzącej (obszar 'cooling') —
      // generyczny [2, 8] byłby błędny dla obu, gdyby zostawić go
      // wspólnym dla wszystkich obszarów.
      return area.type === 'power' ? [35, 75] : [2, 8];
    case 'bar':
      return [6, 8];
    case 'cm':
      return [0, area.maxCm ?? 100];
    case 'kW':
      return [50, 500];
    case 'kVA':
      return [60, 550];
    case 'kVAr':
      return [10, 150];
    case 'V':
      return [215, 245];
    case 'A':
      return [20, 200];
    case '%':
      return [1, 8];
    case 'Hz':
      return [30, 50];
    case 'm³/min':
      return [5, 40];
    default:
      return [0, 100];
  }
}

function nextValue(range: Range, previousValue: number | undefined, random: () => number): number {
  const [min, max] = range;
  const width = max - min;
  const seed = previousValue ?? min + width * random();
  const step = width * WALK_STEP_RATIO;
  const delta = (random() - 0.5) * 2 * step;
  return clamp(seed + delta, min, max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}
