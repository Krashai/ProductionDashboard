import type { AreaSnapshot } from '@/lib/types';

/**
 * Jak długo po utracie danych (cały WebSocket albo PLC jednego obszaru)
 * kafle trzymają ostatnie znane wartości, zanim zszarzeją do "—".
 * Decyzja użytkownika z 2026-10-26 — nie zmieniać bez jego zgody.
 *
 * Powód: krótkie zerwania (restart backendu, mrugnięcie Wi-Fi, chwilowy
 * brak odpowiedzi PLC) zdarzają się często, a szarzenie całej tablicy po
 * kilku sekundach wygląda dla operatora jak awaria zakładu, choć to tylko
 * telemetria. Po 2 minutach "ostatnia znana wartość" przestaje być wiarygodna.
 */
export const STALE_HOLD_MS = 120_000;

/**
 * - `live` — obszar odpowiada, dane świeże,
 * - `held` — obszar offline od krócej niż `STALE_HOLD_MS`, ekran trzyma
 *   ostatnie wartości i wygląda jak `live`,
 * - `unavailable` — offline od dłużej niż okno albo nigdy nie miał danych
 *   (wtedy zero z mappera nie może uchodzić za odczyt): szarość i "—".
 */
export type AreaDataState = 'live' | 'held' | 'unavailable';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE;
// Od tego wieku pokazujemy już tylko pełne minuty — sekundy przy "3 min"
// tylko migałyby, a operatorowi z kilku metrów nic nie dają.
const WHOLE_MINUTES_FROM_MS = 2 * MS_PER_MINUTE;

/** Wiek danych względem zegara klienta. Ujemny (skok zegara wstecz, np. po
 * synchronizacji NTP kiosku) liczymy jak 0 — inaczej `held` pokazałoby
 * "dane sprzed -3 s". */
export function staleAgeMs(lastFreshAt: number, now: number): number {
  return Math.max(0, now - lastFreshAt);
}

export function areaDataState(
  area: Pick<AreaSnapshot, 'isOnline' | 'lastFreshAt'>,
  now: number
): AreaDataState {
  if (area.isOnline) return 'live';
  // Nigdy nie było świeżej ramki — nie mamy czego "trzymać".
  if (area.lastFreshAt === null) return 'unavailable';
  return staleAgeMs(area.lastFreshAt, now) < STALE_HOLD_MS ? 'held' : 'unavailable';
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** `23 s` → `1 min 05 s` → (od 2 min) `3 min` → (od 60 min) `1 h 05 min`. */
export function formatStaleAge(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / MS_PER_SECOND);

  if (safeMs < MS_PER_MINUTE) return `${totalSeconds} s`;
  if (safeMs < WHOLE_MINUTES_FROM_MS) {
    return `1 min ${pad2(totalSeconds - SECONDS_PER_MINUTE)} s`;
  }

  const totalMinutes = Math.floor(safeMs / MS_PER_MINUTE);
  if (totalMinutes < MINUTES_PER_HOUR) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  return `${hours} h ${pad2(totalMinutes % MINUTES_PER_HOUR)} min`;
}
