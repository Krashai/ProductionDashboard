import { describe, expect, test } from 'vitest';
import {
  CURRENT_DEVIATION_FULL_SCALE,
  VOLTAGE_DEVIATION_FULL_SCALE,
  computePhaseDeviations,
} from '@/lib/phase-balance';

/** Skrót do asercji na liczbach zmiennoprzecinkowych — odchyłki niemal nigdy
 * nie wychodzą "okrągłe" (mean 232 z 230/225/241). */
function expectClose(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 6));
}

describe('computePhaseDeviations', () => {
  describe('skale pełne', () => {
    test('napięcia mają skalę ±10%, prądy ±25% (prądy rozjeżdżają się naturalnie szerzej)', () => {
      expect(VOLTAGE_DEVIATION_FULL_SCALE).toBe(0.1);
      expect(CURRENT_DEVIATION_FULL_SCALE).toBe(0.25);
    });
  });

  describe('kodowanie odchyłki', () => {
    test('idealna symetria daje same zera — zbalansowane MA wyglądać na zbalansowane', () => {
      // Arrange
      const values = [230, 230, 230];

      // Act
      const deviations = computePhaseDeviations(values, VOLTAGE_DEVIATION_FULL_SCALE);

      // Assert
      expect(deviations).toEqual([0, 0, 0]);
    });

    test('realny przypadek napięć 230/225/241 mapuje się na −9%/−30%/+39% toru', () => {
      // Arrange — średnia 232 V, odchyłki −0,862% / −3,017% / +3,879%.
      const values = [230, 225, 241];

      // Act
      const deviations = computePhaseDeviations(values, VOLTAGE_DEVIATION_FULL_SCALE);

      // Assert
      expectClose(deviations, [-0.0862069, -0.3017241, 0.3879310]);
    });

    test('znak odchyłki idzie za stroną średniej (poniżej ujemny, powyżej dodatni)', () => {
      const deviations = computePhaseDeviations([90, 100, 110], 0.5);

      expect(deviations[0]).toBeLessThan(0);
      expect(deviations[1]).toBe(0);
      expect(deviations[2]).toBeGreaterThan(0);
    });

    test('suma odchyłek przed przycięciem wynosi zero (średnia jest punktem zerowym)', () => {
      const deviations = computePhaseDeviations([224, 221, 232], VOLTAGE_DEVIATION_FULL_SCALE);

      expect(deviations.reduce((sum, value) => sum + value, 0)).toBeCloseTo(0, 10);
    });

    test('skala pełna dzieli, a nie skaluje wyniku liniowo bez ograniczeń: ta sama grupa węższą skalą daje dłuższe paski', () => {
      const wide = computePhaseDeviations([100, 100, 130], 0.5);
      const narrow = computePhaseDeviations([100, 100, 130], 0.25);

      expect(Math.abs(narrow[2])).toBeGreaterThan(Math.abs(wide[2]));
    });

    test('skala jest STAŁA, nie autoskalowana: mały rozjazd zostaje mały', () => {
      // 224/221/232 V to rozjazd 4,7% — przy ±10% żaden pasek nie może dobić
      // do końca toru. Autoskalowanie rozciągnęłoby ten szum na pełny tor.
      const deviations = computePhaseDeviations([224, 221, 232], VOLTAGE_DEVIATION_FULL_SCALE);

      for (const deviation of deviations) {
        expect(Math.abs(deviation)).toBeLessThan(0.6);
      }
    });
  });

  describe('przycinanie do −1..+1', () => {
    test('realny rozjazd prądów (58,1/99,6/40,2 A) przycina się do końca toru zamiast wyjeżdżać poza kafel', () => {
      // Średnia 65,97 A → +51% dla L2, czyli 2,03× skali ±25%.
      const deviations = computePhaseDeviations(
        [58.1, 99.6, 40.2],
        CURRENT_DEVIATION_FULL_SCALE
      );

      expect(deviations[1]).toBe(1);
      for (const deviation of deviations) {
        expect(deviation).toBeGreaterThanOrEqual(-1);
        expect(deviation).toBeLessThanOrEqual(1);
      }
    });

    test('faza zerowa przy dodatnich sąsiadach przycina się do −1, nigdy niżej', () => {
      // Średnia 66,67 → −100% / +50% / +50%, czyli −4 / +2 / +2 skali ±25%.
      expect(computePhaseDeviations([0, 100, 100], 0.25)).toEqual([-1, 1, 1]);
    });

    test('bez przycięcia ta sama grupa szerszą skalą mieści się w torze', () => {
      expectClose(computePhaseDeviations([0, 100, 100], 1), [-1, 0.5, 0.5]);
    });

    test('każdy wynik mieści się w domkniętym przedziale −1..1', () => {
      const cases: number[][] = [
        [1, 2, 3],
        [0, 0, 7],
        [-1, NaN, 12],
        [999],
        [1e9, 1, 1],
      ];

      for (const values of cases) {
        for (const deviation of computePhaseDeviations(values, 0.1)) {
          expect(deviation).toBeGreaterThanOrEqual(-1);
          expect(deviation).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('przypadki brzegowe (surowy odczyt z PLC)', () => {
    test('pusta tablica zwraca pustą tablicę (brak dzielenia przez zero)', () => {
      expect(computePhaseDeviations([], VOLTAGE_DEVIATION_FULL_SCALE)).toEqual([]);
    });

    test('pojedyncza wartość jest własną średnią, więc stoi dokładnie na środku toru', () => {
      expect(computePhaseDeviations([42], VOLTAGE_DEVIATION_FULL_SCALE)).toEqual([0]);
    });

    test('same zera dają same zera zamiast NaN (średnia = 0)', () => {
      const deviations = computePhaseDeviations([0, 0, 0], 0.1);

      expect(deviations).toEqual([0, 0, 0]);
      expect(deviations.every(Number.isFinite)).toBe(true);
    });

    test('same wartości ujemne (szum PLC) dają same zera, nie ujemne odchyłki', () => {
      expect(computePhaseDeviations([-5, -1, -0.05], 0.1)).toEqual([0, 0, 0]);
    });

    test('ujemna wartość jest przycinana do 0 PRZED średnią — tak jak liczba na kaflu', () => {
      // clampNonNegative(−50) = 0, więc średnia to (0+100+200)/3 = 100.
      const deviations = computePhaseDeviations([-50, 100, 200], 1);

      expectClose(deviations, [-1, 0, 1]);
    });

    test('NaN traktowany jak brak odczytu (0) i nie propaguje się na resztę', () => {
      const deviations = computePhaseDeviations([NaN, 100, 200], 1);

      expectClose(deviations, [-1, 0, 1]);
      expect(deviations.every(Number.isFinite)).toBe(true);
    });

    test('Infinity nie zeruje całej grupy — jest traktowany jak brak odczytu', () => {
      const deviations = computePhaseDeviations([Infinity, 100, 200], 1);

      expectClose(deviations, [-1, 0, 1]);
    });

    test('sam NaN daje same zera, nigdy NaN na wyjściu', () => {
      const deviations = computePhaseDeviations([NaN, NaN], 0.1);

      expect(deviations).toEqual([0, 0]);
      expect(deviations.every(Number.isFinite)).toBe(true);
    });

    test('fullScale = 0 daje same zera zamiast ±Infinity', () => {
      const deviations = computePhaseDeviations([220, 230, 240], 0);

      expect(deviations).toEqual([0, 0, 0]);
      expect(deviations.every(Number.isFinite)).toBe(true);
    });

    test('ujemny fullScale nie odwraca kierunku pasków — daje same zera', () => {
      expect(computePhaseDeviations([220, 230, 240], -0.1)).toEqual([0, 0, 0]);
    });

    test('nie-skończony fullScale (NaN/Infinity) daje same zera', () => {
      expect(computePhaseDeviations([220, 230, 240], NaN)).toEqual([0, 0, 0]);
      expect(computePhaseDeviations([220, 230, 240], Infinity)).toEqual([0, 0, 0]);
    });

    test('nie mutuje tablicy wejściowej', () => {
      const values = [10, 20];

      computePhaseDeviations(values, 0.1);

      expect(values).toEqual([10, 20]);
    });
  });
});
