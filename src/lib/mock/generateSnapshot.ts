import type { AreaDefinition, MetricDefinition } from '@/lib/areas';
import type { AreaSnapshot, Metric } from '@/lib/types';

export const DEFAULT_HISTORY_LENGTH = 30;
export const ALARM_PROBABILITY = 0.05;

// Krok błądzenia losowego jako ułamek szerokości zakresu — na tyle mały, żeby
// kolejne odczyty wyglądały jak realny sygnał z PLC, nie biały szum.
const WALK_STEP_RATIO = 0.08;

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

type Range = [min: number, max: number];

function resolveRange(definition: MetricDefinition, area: AreaDefinition): Range {
  switch (definition.unit) {
    case '°C':
      return [2, 8];
    case 'bar':
      return [6, 8];
    case 'cm':
      return [0, area.maxCm ?? 100];
    case 'kW':
      return [50, 500];
    case 'kVA':
      return [60, 550];
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
