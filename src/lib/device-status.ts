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
  /** `null` gdy urządzenie nie ma dodatkowej wartości liczbowej (np. Hz VFD
   * pompy, "poziom pracy" sprężarki Darpin) — odróżnia to od "0 zmierzone".
   * Zgeneralizowane z dawnego `frequencyHz` po dodaniu Chłodni 3 (Darpin ma
   * bezjednostkową wartość "poziom pracy", nie częstotliwość). */
  secondaryValue: number | null;
  /** Jednostka `secondaryValue` (np. "Hz"), `null` gdy `secondaryValue` też
   * `null`. Pusty string jest poprawną, jawną wartością (Darpin: "poziom
   * pracy" nie ma jednostki) — to NIE to samo co `null`. */
  secondaryUnit: string | null;
  /** Miejsca po przecinku `secondaryValue` (np. Hz: 1, "poziom pracy" Darpin:
   * 0 — to liczba całkowita, "2.0" wyglądałoby na kiosku jak pomiar, nie
   * dyskretny poziom pracy). `null` gdy `secondaryValue` też `null`. */
  secondaryDecimals: number | null;
  offline: boolean;
}

export interface DeviceGroupStatus {
  id: string;
  label: string;
  devices: DeviceStatus[];
  /** Przekazane 1:1 z `DeviceGroupDefinition.note` — patrz jej komentarz. */
  note?: string;
}

function findMetric(metrics: Metric[], id: string | undefined): Metric | undefined {
  if (!id) return undefined;
  return metrics.find((m) => m.id === id);
}

/** `device.metricIds.awaria` bywa nieobecne (Darpin, Chłodnia 3 — brak bitu
 * awarii w PLC), pojedynczym id (większość urządzeń), albo tablicą id
 * (Rhoss, Chłodnia 3 — "alarm sterowania" + "alarm pompy") — kafel ma jedną
 * kropkę Awaria, więc wiele bitów OR-uje się w jeden `fault: boolean`
 * (dowolny bit=1 → fault=true), mimo że każdy bit nadal istnieje osobno w
 * `area.metrics`/pasku alarmów. */
function resolveFault(metrics: Metric[], awaria: string | string[] | undefined): boolean {
  if (!awaria) return false;
  const ids = Array.isArray(awaria) ? awaria : [awaria];
  return ids.some((id) => findMetric(metrics, id)?.value === 1);
}

/** PRACA/AWARIA płyną przez ten sam kanał co metryki analogowe — Tag typu
 * BOOL dekoduje się do liczby 0/1, więc "running"/"fault" to po prostu
 * `value === 1` na odpowiedniej metryce (`fault` przez `resolveFault` powyżej,
 * bo `awaria` bywa zero/jeden/wiele bitów — patrz jej komentarz).
 *
 * Ten kontrakt jest EGZEKWOWANY, nie tylko opisany: `int(get_bool(...))` w
 * `backend/app/plc/decode.py` (funkcja `decode_tag_value`, gałąź BOOL), a
 * pilnuje go test `test_bool_decodes_to_int_not_python_bool`. Wcześniej ten
 * komentarz opisywał kontrakt, którego nikt nie realizował — snap7 zwracał
 * pythonowego boola, na drut szło `true`, a `true === 1` to w JS `false`.
 * Jeśli zmieniasz typ wartości po stronie PLC, zacznij od tamtego testu. */
export function deriveDeviceStatus(
  device: DeviceDefinition,
  metrics: Metric[],
  areaOffline: boolean
): DeviceStatus {
  const pracaMetric = findMetric(metrics, device.metricIds.praca);
  const secondaryMetric = findMetric(metrics, device.metricIds.secondary);

  return {
    id: device.id,
    label: device.label,
    running: pracaMetric?.value === 1,
    fault: resolveFault(metrics, device.metricIds.awaria),
    secondaryValue: secondaryMetric ? secondaryMetric.value : null,
    secondaryUnit: secondaryMetric ? secondaryMetric.unit : null,
    secondaryDecimals: secondaryMetric ? secondaryMetric.decimals : null,
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
    note: group.note,
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
