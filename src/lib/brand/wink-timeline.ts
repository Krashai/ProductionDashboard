// Easter egg (decyzja użytkownika, październik 2026): lampka NIE pokazuje
// stanu systemu — świeci stałym kolorem marki, ale co jakiś czas mruga dwa
// razy na czerwono. Losowy odstęp, żeby nie dało się go przewidzieć.
// Ten plik to jedyne źródło czasów mrugnięcia — korzystają z niego logo
// (animacja CSS) i favicon, dzięki czemu mrugają w tym samym momencie.
export const WINK_MIN_DELAY_MS = 60_000;
export const WINK_MAX_DELAY_MS = 180_000;
// Musi być równe czasowi animacji `ln-wink` w globals.css.
export const WINK_DURATION_MS = 1_600;

export type LensColor = 'red' | 'teal';

/**
 * Klatki soczewki względem startu mrugnięcia — odwzorowanie keyframes
 * `ln-wink` (`step-end`): czerwień w 15%–35% i 65%–85% z 1600 ms.
 * Zgodność z CSS pilnuje test `wink-timeline.test.ts`.
 */
export const WINK_FRAMES: ReadonlyArray<{ atMs: number; lens: LensColor }> = [
  { atMs: 240, lens: 'red' },
  { atMs: 560, lens: 'teal' },
  { atMs: 1040, lens: 'red' },
  { atMs: 1360, lens: 'teal' },
];

/** Losowy odstęp do następnego mrugnięcia (równomiernie między min a maks). */
export function nextWinkDelayMs(random: () => number = Math.random): number {
  return WINK_MIN_DELAY_MS + random() * (WINK_MAX_DELAY_MS - WINK_MIN_DELAY_MS);
}
