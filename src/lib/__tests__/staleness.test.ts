import { describe, expect, test } from 'vitest';
import { STALE_HOLD_MS, areaDataState, formatStaleAge, staleAgeMs } from '@/lib/staleness';

const NOW = 1_700_000_000_000;

describe('STALE_HOLD_MS', () => {
  test('okno wstrzymania to 2 minuty (decyzja użytkownika z 2026-10-26)', () => {
    expect(STALE_HOLD_MS).toBe(120_000);
  });
});

describe('areaDataState', () => {
  test('obszar online jest "live" niezależnie od wieku lastFreshAt', () => {
    expect(areaDataState({ isOnline: true, lastFreshAt: NOW - 10 * STALE_HOLD_MS }, NOW)).toBe('live');
    expect(areaDataState({ isOnline: true, lastFreshAt: null }, NOW)).toBe('live');
  });

  test('offline w tej samej chwili co ostatnia ramka (0 ms) jest "held"', () => {
    expect(areaDataState({ isOnline: false, lastFreshAt: NOW }, NOW)).toBe('held');
  });

  test('offline o 1 ms krócej niż okno jest "held"', () => {
    expect(areaDataState({ isOnline: false, lastFreshAt: NOW - (STALE_HOLD_MS - 1) }, NOW)).toBe('held');
  });

  test('offline dokładnie po oknie wstrzymania jest "unavailable"', () => {
    expect(areaDataState({ isOnline: false, lastFreshAt: NOW - STALE_HOLD_MS }, NOW)).toBe('unavailable');
  });

  test('offline bez żadnej świeżej ramki (lastFreshAt = null) jest "unavailable" — nigdy nie pokazujemy zer', () => {
    expect(areaDataState({ isOnline: false, lastFreshAt: null }, NOW)).toBe('unavailable');
  });

  test('skok zegara wstecz (lastFreshAt w przyszłości) liczy się jak wiek 0 → "held"', () => {
    expect(areaDataState({ isOnline: false, lastFreshAt: NOW + 5_000 }, NOW)).toBe('held');
  });
});

describe('staleAgeMs', () => {
  test('zwraca różnicę now - lastFreshAt', () => {
    expect(staleAgeMs(NOW - 23_000, NOW)).toBe(23_000);
  });

  test('ujemny wiek (skok zegara wstecz) obcina do 0', () => {
    expect(staleAgeMs(NOW + 1, NOW)).toBe(0);
  });
});

describe('formatStaleAge', () => {
  test.each([
    [0, '0 s'],
    [999, '0 s'],
    [23_000, '23 s'],
    [59_999, '59 s'],
  ])('poniżej minuty: %i ms → "%s"', (ms, expected) => {
    expect(formatStaleAge(ms)).toBe(expected);
  });

  test.each([
    [60_000, '1 min 00 s'],
    [65_000, '1 min 05 s'],
    [119_999, '1 min 59 s'],
  ])('od minuty do dwóch: %i ms → "%s"', (ms, expected) => {
    expect(formatStaleAge(ms)).toBe(expected);
  });

  test.each([
    [120_000, '2 min'],
    [179_999, '2 min'],
    [180_000, '3 min'],
    [59 * 60_000 + 59_000, '59 min'],
  ])('od dwóch minut: %i ms → "%s" (pełne minuty, bez sekund)', (ms, expected) => {
    expect(formatStaleAge(ms)).toBe(expected);
  });

  test.each([
    [60 * 60_000, '1 h 00 min'],
    [65 * 60_000, '1 h 05 min'],
    [3 * 60 * 60_000 + 7 * 60_000, '3 h 07 min'],
  ])('od godziny: %i ms → "%s"', (ms, expected) => {
    expect(formatStaleAge(ms)).toBe(expected);
  });

  test('ujemny czas traktuje jak 0', () => {
    expect(formatStaleAge(-5_000)).toBe('0 s');
  });
});
