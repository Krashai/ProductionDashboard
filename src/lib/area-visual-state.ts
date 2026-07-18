/**
 * Czysta logika wyboru wizualnego stanu obszaru infrastruktury.
 *
 * Re-domenizowany kształt `deriveLineVisualState` z ProductionMonitor:
 * ten sam priorytet "offline bije wszystko", ale bez pojęcia trybu
 * planu/prędkości linii produkcyjnej — tu liczy się połączenie z PLC,
 * flaga alarmu per metryka i (na przyszłość) sygnał ostrzegawczy poniżej
 * progu alarmu.
 *
 * Priorytety:
 *   1. offline — brak połączenia z obszarem bije wszystko inne.
 *   2. alarm — dowolna metryka w stanie `alarm: true`.
 *   3. green — obszar ma co najmniej jeden potwierdzony, aktualny odczyt.
 *   4. amber — brak potwierdzonych danych, ale jest sygnał ostrzegawczy.
 *   5. neutral — domyślny, SSR-safe stan przy braku jakiegokolwiek sygnału
 *      (renderowany przed pierwszym `useEffect`, patrz Concept.md §13 ryzyka).
 */

export type AreaVisualVariant = 'offline' | 'alarm' | 'green' | 'amber' | 'neutral';

export interface AreaVisualState {
  variant: AreaVisualVariant;
}

export interface DeriveAreaVisualStateParams {
  isOnline: boolean;
  hasAlarm: boolean;
  hasWarning: boolean;
  hasData: boolean;
}

export function deriveAreaVisualState(
  params: DeriveAreaVisualStateParams
): AreaVisualState {
  const { isOnline, hasAlarm, hasWarning, hasData } = params;

  if (!isOnline) return { variant: 'offline' };
  if (hasAlarm) return { variant: 'alarm' };
  if (hasData) return { variant: 'green' };
  if (hasWarning) return { variant: 'amber' };
  return { variant: 'neutral' };
}
