export type AreaType = 'cooling' | 'compressor' | 'power';

export interface Metric {
  id: string;
  label: string;
  value: number;
  unit: string;
  decimals: number;
  history: number[];
  alarm: boolean;
  /** Dlaczego jest alarm (np. "Powyżej maksimum (9.0)", opis bitu awarii) —
   * z `alarm_description` backendu. Opcjonalne: mock i starsze fixture'y go
   * nie mają, a brak opisu to zwykły chip z samą nazwą metryki. */
  alarmDescription?: string | null;
  /** Whether THIS metric's own source PLC is currently online —
   * independent of `AreaSnapshot.isOnline` (an AND across every PLC
   * feeding the area). An area can straddle several physical PLCs (e.g.
   * Sprężarkownia: one per device-group section); one going dark must not
   * blank another's still-live readings. Optional (not every producer of
   * a `Metric` sets it — mocks, most tests) — `undefined` is treated as
   * "online" by the one consumer that reads it (CompressorAreaView.tsx),
   * so call sites that never set it keep their previous behavior.
   */
  online?: boolean;
}

/** Alarm tagu spoza katalogu metryk (np. bit słowa awarii) — nie ma karty
 * na wallboardzie, istnieje wyłącznie na pasku alarmów. */
export interface ExtraAlarm {
  metricId: string;
  label: string;
  description: string | null;
}

export interface AreaSnapshot {
  id: string;
  name: string;
  type: AreaType;
  metrics: Metric[];
  lastSeenAt: string | null;
  isOnline: boolean;
  extraAlarms?: ExtraAlarm[];
}

export interface AlarmState {
  areaId: string;
  areaName: string;
  metricId: string;
  metricLabel: string;
  description: string | null;
}
