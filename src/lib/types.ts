export type AreaType = 'cooling' | 'compressor' | 'power';

export interface Metric {
  id: string;
  label: string;
  value: number;
  unit: string;
  decimals: number;
  history: number[];
  alarm: boolean;
}

export interface AreaSnapshot {
  id: string;
  name: string;
  type: AreaType;
  metrics: Metric[];
  lastSeenAt: string | null;
  isOnline: boolean;
}

export interface AlarmState {
  areaId: string;
  areaName: string;
  metricId: string;
  metricLabel: string;
}
