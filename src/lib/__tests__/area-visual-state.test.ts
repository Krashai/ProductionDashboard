import { describe, expect, test } from 'vitest';
import {
  deriveAreaVisualState,
  type DeriveAreaVisualStateParams,
} from '@/lib/area-visual-state';

// Baza poprawnych parametrów — testy nadpisują tylko to, co istotne.
// `hasData` = obszar ma co najmniej jeden świeży, potwierdzony odczyt (green).
// `hasWarning` = sygnał ostrzegawczy poniżej progu alarmu (amber, na przyszłość).
// Domyślnie oba `false`, żeby brak nadpisań dawał jednoznaczny stan `neutral`
// — to ten sam stan, który SSR renderuje przed pierwszym `useEffect` (Concept.md §13 ryzyka).
function params(
  overrides: Partial<DeriveAreaVisualStateParams>
): DeriveAreaVisualStateParams {
  return {
    isOnline: true,
    hasAlarm: false,
    hasWarning: false,
    hasData: false,
    ...overrides,
  };
}

describe('deriveAreaVisualState', () => {
  test('offline ma najwyższy priorytet — bije alarm, dane i ostrzeżenie', () => {
    const state = deriveAreaVisualState(
      params({ isOnline: false, hasAlarm: true, hasWarning: true, hasData: true })
    );
    expect(state.variant).toBe('offline');
  });

  test('offline przy braku jakiegokolwiek innego sygnału', () => {
    expect(deriveAreaVisualState(params({ isOnline: false })).variant).toBe('offline');
  });

  test('alarm bije dane i ostrzeżenie, gdy obszar jest online', () => {
    const state = deriveAreaVisualState(
      params({ hasAlarm: true, hasWarning: true, hasData: true })
    );
    expect(state.variant).toBe('alarm');
  });

  test('green (potwierdzone dane), gdy brak alarmu, nawet przy aktywnym ostrzeżeniu', () => {
    const state = deriveAreaVisualState(params({ hasData: true, hasWarning: true }));
    expect(state.variant).toBe('green');
  });

  test('amber, gdy brak alarmu i brak potwierdzonych danych, ale jest ostrzeżenie', () => {
    const state = deriveAreaVisualState(params({ hasWarning: true }));
    expect(state.variant).toBe('amber');
  });

  test('neutral jako domyślny stan przy braku jakiegokolwiek sygnału (SSR-safe default)', () => {
    const state = deriveAreaVisualState(params({}));
    expect(state.variant).toBe('neutral');
  });

  test('pełna drabinka priorytetów: offline > alarm > green > amber > neutral', () => {
    expect(
      deriveAreaVisualState(
        params({ isOnline: false, hasAlarm: true, hasData: true, hasWarning: true })
      ).variant
    ).toBe('offline');

    expect(
      deriveAreaVisualState(
        params({ isOnline: true, hasAlarm: true, hasData: true, hasWarning: true })
      ).variant
    ).toBe('alarm');

    expect(
      deriveAreaVisualState(
        params({ isOnline: true, hasAlarm: false, hasData: true, hasWarning: true })
      ).variant
    ).toBe('green');

    expect(
      deriveAreaVisualState(
        params({ isOnline: true, hasAlarm: false, hasData: false, hasWarning: true })
      ).variant
    ).toBe('amber');

    expect(
      deriveAreaVisualState(
        params({ isOnline: true, hasAlarm: false, hasData: false, hasWarning: false })
      ).variant
    ).toBe('neutral');
  });
});
