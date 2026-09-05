import type { AreaDefinition, DeviceDefinition, DeviceGroupDefinition } from '@/lib/areas';
import type { Metric } from '@/lib/types';

// Grupa pomp obiegowych steruje warunkiem "chłodnia wyłączona" — id musi być
// zgodne z `pumpGroupSpec()` w `src/lib/areas.ts`. Wyeksportowany (nie lokalny
// do jednego komponentu), bo `isCoolingShutdown`/`coolingSuppressedAlarmMetricIds`
// poniżej muszą go znać, a korzystają z niego zarówno `CoolingAreaView.tsx`
// (żeby wyciszyć kartę) jak i `AlarmBar.tsx` (żeby wyciszyć globalny pasek
// alarmów o ten sam warunek — patrz komentarz przy tych funkcjach).
export const PUMP_GROUP_ID = 'pompy';

export interface DeviceStatus {
  id: string;
  label: string;
  running: boolean;
  fault: boolean;
  /** `null` gdy urządzenie nie ma metryki częstotliwości (nie ma VFD) —
   * odróżnia to od "0 Hz zmierzone". */
  frequencyHz: number | null;
  offline: boolean;
}

export interface DeviceGroupStatus {
  id: string;
  label: string;
  devices: DeviceStatus[];
}

function findMetric(metrics: Metric[], id: string | undefined): Metric | undefined {
  if (!id) return undefined;
  return metrics.find((m) => m.id === id);
}

/** PRACA/AWARIA płyną przez ten sam kanał co metryki analogowe — Tag typu
 * BOOL dekoduje się do liczby 0/1 (patrz `backend/app/plc/decode.py`), więc
 * "running"/"fault" to po prostu `value === 1` na odpowiedniej metryce. */
export function deriveDeviceStatus(
  device: DeviceDefinition,
  metrics: Metric[],
  areaOffline: boolean
): DeviceStatus {
  const pracaMetric = findMetric(metrics, device.metricIds.praca);
  const awariaMetric = findMetric(metrics, device.metricIds.awaria);
  const hzMetric = findMetric(metrics, device.metricIds.hz);

  return {
    id: device.id,
    label: device.label,
    running: pracaMetric?.value === 1,
    fault: awariaMetric?.value === 1,
    frequencyHz: hzMetric ? hzMetric.value : null,
    offline: areaOffline,
  };
}

export function deriveDeviceGroupStatuses(
  groups: DeviceGroupDefinition[] | undefined,
  metrics: Metric[],
  areaOffline: boolean
): DeviceGroupStatus[] {
  if (!groups) return [];
  return groups.map((group) => ({
    id: group.id,
    label: group.label,
    devices: group.devices.map((device) => deriveDeviceStatus(device, metrics, areaOffline)),
  }));
}

export type CoolingOperationalState = 'running' | 'shutdown';

/**
 * Warunek z notatek (Dane szczegółowe/Chłodnia {1,2,3}.md): jeśli pompy
 * obiegowe są wyłączone, chłodnia jest "wyłączona" — brak alarmów
 * temperatury/ciśnienia. Pusta lista pomp (grupa jeszcze nie skonfigurowana)
 * świadomie rozstrzyga się do `'running'` — nigdy nie oznaczaj chłodni jako
 * wyłączonej tylko dlatego, że nie znaleziono żadnej pompy.
 */
export function deriveCoolingOperationalState(pumpDevices: DeviceStatus[]): CoolingOperationalState {
  if (pumpDevices.length === 0) return 'running';
  return pumpDevices.some((pump) => pump.running) ? 'running' : 'shutdown';
}

/**
 * Czy dana chłodnia jest "wyłączona" (żadna pompa obiegowa nie pracuje) —
 * jedyne, autorytatywne miejsce liczące ten warunek z surowych `metrics`.
 * Wcześniej `CoolingAreaView.tsx` liczył to lokalnie, a `AlarmBar.tsx` w
 * ogóle o tym nie wiedział — efekt: karta chłodni poprawnie ukrywała alarm
 * temperatury/ciśnienia dla wyłączonej chłodni, ale globalny pasek alarmów u
 * dołu ekranu (widoczny niezależnie od tego, który obszar akurat pokazuje
 * karuzela) nadal pulsował chipem dla tej samej metryki — sprzeczny sygnał
 * dla operatora. Jedna funkcja, dwóch konsumentów, zero duplikacji logiki.
 */
export function isCoolingShutdown(definition: AreaDefinition, metrics: Metric[]): boolean {
  if (definition.type !== 'cooling') return false;
  const pumpGroup = definition.deviceGroups?.find((g) => g.id === PUMP_GROUP_ID);
  const pumpDevices = pumpGroup ? deriveDeviceGroupStatuses([pumpGroup], metrics, false)[0].devices : [];
  return deriveCoolingOperationalState(pumpDevices) === 'shutdown';
}

/**
 * Id metryk, których alarm ma być zignorowany, gdy chłodnia jest wyłączona —
 * z notatek: warunek dotyczy WYŁĄCZNIE temperatury/ciśnienia, NIE poziomu
 * zbiornika (to fizyczny stan zbiornika, niezależny od pracy pomp). Zwraca
 * pusty zbiór dla obszarów innych niż 'cooling' albo gdy chłodnia pracuje.
 */
export function coolingSuppressedAlarmMetricIds(
  definition: AreaDefinition,
  metrics: Metric[]
): ReadonlySet<string> {
  if (!isCoolingShutdown(definition, metrics)) return new Set();
  return new Set([`${definition.id}-temp`, `${definition.id}-pressure`]);
}
