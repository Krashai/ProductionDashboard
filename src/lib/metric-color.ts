import type { MetricCardColor } from '@/components/MetricCard';

// Przypisanie koloru per jednostka nie jest przesądzone przez Concept.md/
// DesignGuideline — subiektywna, ale świadoma decyzja (Faza 3): blue dla
// temperatury (woda lodowa), emerald dla ciśnienia ("w normie"), amber dla
// mocy czynnej (obciążenie "na gorąco"), slate dla pozornej (pomocnicza).
// Scentralizowane tutaj, żeby CoolingAreaView/PowerAreaView/OverviewView nie
// duplikowały tej samej mapy po raz trzeci.
const METRIC_COLOR_BY_UNIT: Record<string, MetricCardColor> = {
  '°C': 'blue',
  bar: 'emerald',
  kW: 'amber',
  kVA: 'slate',
};

export function metricColorForUnit(unit: string): MetricCardColor {
  return METRIC_COLOR_BY_UNIT[unit] ?? 'slate';
}
