import type { Metric } from '@/lib/types';

/**
 * Decyzja #29 (Concept.md §6a.1): overview pokazuje dodatkową kartę
 * "Sumaryczne zużycie" — sumę mocy czynnej (kW) z 3 trafostacji, liczoną po
 * stronie frontu z już dostępnego `AreaSnapshot` (bez nowego pola w warstwie
 * danych). Karuzela nadal pokazuje pełne 6 kart kW+kVA bez zmian.
 */
export function computeTotalActivePowerKw(metrics: Metric[]): number {
  return metrics
    .filter((metric) => metric.unit === 'kW')
    .reduce((sum, metric) => sum + metric.value, 0);
}
