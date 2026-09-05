import { describe, expect, test } from 'vitest';
import { generateSnapshot, DEFAULT_HISTORY_LENGTH } from '@/lib/mock/generateSnapshot';
import { AREAS } from '@/lib/areas';
import type { AreaSnapshot } from '@/lib/types';

const coolingArea = AREAS.find((a) => a.type === 'cooling')!;
const compressorArea = AREAS.find((a) => a.type === 'compressor')!;
const powerArea = AREAS.find((a) => a.type === 'power')!;

// rng zwracający zawsze tę samą wartość — deterministyczne testy bez mockowania Math.random.
const constantRandom = (value: number) => () => value;

describe('generateSnapshot', () => {
  test('kształt snapshotu odpowiada dokładnie AreaSnapshot', () => {
    const snapshot: AreaSnapshot = generateSnapshot(coolingArea, {
      random: constantRandom(0.5),
    });

    expect(Object.keys(snapshot).sort()).toEqual(
      ['id', 'isOnline', 'lastSeenAt', 'metrics', 'name', 'type'].sort()
    );
    expect(snapshot.id).toBe(coolingArea.id);
    expect(snapshot.name).toBe(coolingArea.name);
    expect(snapshot.type).toBe(coolingArea.type);
    expect(snapshot.isOnline).toBe(true);
    expect(typeof snapshot.lastSeenAt).toBe('string');
    expect(() => new Date(snapshot.lastSeenAt as string).toISOString()).not.toThrow();

    for (const metric of snapshot.metrics) {
      expect(Object.keys(metric).sort()).toEqual(
        ['alarm', 'decimals', 'history', 'id', 'label', 'unit', 'value'].sort()
      );
      expect(Array.isArray(metric.history)).toBe(true);
      expect(typeof metric.alarm).toBe('boolean');
    }
  });

  test('temperatura chłodni mieści się w zakresie ~2-8°C', () => {
    for (let i = 0; i < 50; i++) {
      const snapshot = generateSnapshot(coolingArea, { random: Math.random });
      const temp = snapshot.metrics.find((m) => m.unit === '°C')!;
      expect(temp.value).toBeGreaterThanOrEqual(2);
      expect(temp.value).toBeLessThanOrEqual(8);
    }
  });

  test('temperatura trafostacji (obszar power) mieści się w zakresie ~35-75°C, innym niż chłodnia', () => {
    // Fizyczna skala temperatury transformatora jest zupełnie inna niż woda
    // chłodząca — resolveRange('°C') musi rozróżniać obszar po area.type,
    // inaczej ten sam generyczny [2,8] byłby błędny dla obu.
    for (let i = 0; i < 50; i++) {
      const snapshot = generateSnapshot(powerArea, { random: Math.random });
      const temp = snapshot.metrics.find((m) => m.unit === '°C')!;
      expect(temp.value).toBeGreaterThanOrEqual(35);
      expect(temp.value).toBeLessThanOrEqual(75);
    }
  });

  test('napięcia fazowe trafostacji (V) mieszczą się w zakresie ~215-245V', () => {
    for (let i = 0; i < 50; i++) {
      const snapshot = generateSnapshot(powerArea, { random: Math.random });
      for (const metric of snapshot.metrics.filter((m) => m.unit === 'V')) {
        expect(metric.value).toBeGreaterThanOrEqual(215);
        expect(metric.value).toBeLessThanOrEqual(245);
      }
    }
  });

  test('prądy fazowe trafostacji (A) mieszczą się w zakresie ~20-200A', () => {
    for (let i = 0; i < 50; i++) {
      const snapshot = generateSnapshot(powerArea, { random: Math.random });
      for (const metric of snapshot.metrics.filter((m) => m.unit === 'A')) {
        expect(metric.value).toBeGreaterThanOrEqual(20);
        expect(metric.value).toBeLessThanOrEqual(200);
      }
    }
  });

  test('moc bierna (kVAr) mieści się w zakresie ~10-150', () => {
    for (let i = 0; i < 50; i++) {
      const snapshot = generateSnapshot(powerArea, { random: Math.random });
      for (const metric of snapshot.metrics.filter((m) => m.unit === 'kVAr')) {
        expect(metric.value).toBeGreaterThanOrEqual(10);
        expect(metric.value).toBeLessThanOrEqual(150);
      }
    }
  });

  test('THDi/THDu (%) mieszczą się w zakresie ~1-8', () => {
    for (let i = 0; i < 50; i++) {
      const snapshot = generateSnapshot(powerArea, { random: Math.random });
      for (const metric of snapshot.metrics.filter((m) => m.unit === '%')) {
        expect(metric.value).toBeGreaterThanOrEqual(1);
        expect(metric.value).toBeLessThanOrEqual(8);
      }
    }
  });

  test('ciśnienie (chłodnia i sprężarkownia) mieści się w zakresie ~6-8 bar', () => {
    for (let i = 0; i < 50; i++) {
      const coolingSnap = generateSnapshot(coolingArea, { random: Math.random });
      const compressorSnap = generateSnapshot(compressorArea, { random: Math.random });

      for (const metric of [
        ...coolingSnap.metrics.filter((m) => m.unit === 'bar'),
        ...compressorSnap.metrics.filter((m) => m.unit === 'bar'),
      ]) {
        expect(metric.value).toBeGreaterThanOrEqual(6);
        expect(metric.value).toBeLessThanOrEqual(8);
      }
    }
  });

  test('przepływ powietrza (Magazyn Bębnów) mieści się w zakresie ~5-40 m³/min', () => {
    for (let i = 0; i < 50; i++) {
      const snapshot = generateSnapshot(compressorArea, { random: Math.random });
      const flow = snapshot.metrics.find((m) => m.unit === 'm³/min')!;
      expect(flow.value).toBeGreaterThanOrEqual(5);
      expect(flow.value).toBeLessThanOrEqual(40);
    }
  });

  test('poziom zbiornika mieści się w [0, maxCm] zdefiniowanym per obszar', () => {
    for (let i = 0; i < 50; i++) {
      const snapshot = generateSnapshot(coolingArea, { random: Math.random });
      const level = snapshot.metrics.find((m) => m.unit === 'cm')!;
      expect(level.value).toBeGreaterThanOrEqual(0);
      expect(level.value).toBeLessThanOrEqual(coolingArea.maxCm as number);
    }
  });

  test('moc czynna/pozorna trafostacji mieści się w realistycznym zakresie dodatnim', () => {
    for (let i = 0; i < 50; i++) {
      const snapshot = generateSnapshot(powerArea, { random: Math.random });
      for (const metric of snapshot.metrics) {
        expect(metric.value).toBeGreaterThan(0);
        expect(Number.isFinite(metric.value)).toBe(true);
      }
    }
  });

  test('historia jest ograniczona do skonfigurowanej długości (domyślnie DEFAULT_HISTORY_LENGTH)', () => {
    let snapshot = generateSnapshot(powerArea, { random: Math.random });
    for (let i = 0; i < DEFAULT_HISTORY_LENGTH + 20; i++) {
      snapshot = generateSnapshot(powerArea, { previous: snapshot, random: Math.random });
    }
    for (const metric of snapshot.metrics) {
      expect(metric.history.length).toBeLessThanOrEqual(DEFAULT_HISTORY_LENGTH);
    }
  });

  test('historia rośnie o jeden element na wywołanie, aż osiągnie limit', () => {
    let snapshot = generateSnapshot(powerArea, { random: Math.random });
    expect(snapshot.metrics[0].history).toHaveLength(1);

    snapshot = generateSnapshot(powerArea, { previous: snapshot, random: Math.random });
    expect(snapshot.metrics[0].history).toHaveLength(2);
  });

  test('respektuje niestandardową historyLength', () => {
    let snapshot = generateSnapshot(powerArea, { random: Math.random, historyLength: 3 });
    for (let i = 0; i < 10; i++) {
      snapshot = generateSnapshot(powerArea, {
        previous: snapshot,
        random: Math.random,
        historyLength: 3,
      });
    }
    for (const metric of snapshot.metrics) {
      expect(metric.history.length).toBeLessThanOrEqual(3);
    }
  });

  test('respektuje wstrzykniętą funkcję now()', () => {
    const fixedDate = new Date('2026-01-01T00:00:00.000Z');
    const snapshot = generateSnapshot(powerArea, {
      random: constantRandom(0.5),
      now: () => fixedDate,
    });
    expect(snapshot.lastSeenAt).toBe(fixedDate.toISOString());
  });

  test('alarm jest deterministyczny przy stałym rng: bardzo niska wartość rng => alarm true', () => {
    const snapshot = generateSnapshot(powerArea, { random: constantRandom(0) });
    expect(snapshot.metrics.every((m) => m.alarm === true)).toBe(true);
  });

  test('alarm jest deterministyczny przy stałym rng: wysoka wartość rng => alarm false', () => {
    const snapshot = generateSnapshot(powerArea, { random: constantRandom(0.99) });
    expect(snapshot.metrics.every((m) => m.alarm === false)).toBe(true);
  });

  test('wartość zaokrąglana jest do liczby miejsc po przecinku z definicji metryki', () => {
    const snapshot = generateSnapshot(coolingArea, { random: constantRandom(0.37) });
    for (const metric of snapshot.metrics) {
      const decimalPart = metric.value.toString().split('.')[1] ?? '';
      expect(decimalPart.length).toBeLessThanOrEqual(metric.decimals);
    }
  });

  test('kontynuacja z poprzedniego snapshotu nie robi skoków poza rozsądny krok (bounded random walk)', () => {
    const first = generateSnapshot(coolingArea, { random: constantRandom(0.5) });
    const second = generateSnapshot(coolingArea, {
      previous: first,
      random: constantRandom(0.5),
    });

    function rangeForUnit(unit: string): number {
      switch (unit) {
        case 'cm':
          return coolingArea.maxCm as number;
        case '°C':
          return 8 - 2;
        case 'Hz':
          return 50 - 30;
        case '':
          // Bool (PRACA/AWARIA): jedyny możliwy skok to 0<->1.
          return 1;
        default:
          return 8 - 6; // bar
      }
    }

    for (let i = 0; i < first.metrics.length; i++) {
      const range = rangeForUnit(first.metrics[i].unit);
      const delta = Math.abs(second.metrics[i].value - first.metrics[i].value);
      expect(delta).toBeLessThanOrEqual(range);
    }
  });

  describe('metryki urządzeń (PRACA/AWARIA/Hz, Chłodnia 1/2/3)', () => {
    const chlodnia1 = AREAS.find((a) => a.id === 'chlodnia-1')!;

    test('PRACA/AWARIA (unit="") generują wyłącznie wartości 0 lub 1', () => {
      for (let i = 0; i < 50; i++) {
        const snapshot = generateSnapshot(chlodnia1, { random: Math.random });
        for (const metric of snapshot.metrics.filter((m) => m.unit === '')) {
          expect([0, 1]).toContain(metric.value);
        }
      }
    });

    test('metryki bool nigdy nie mają alarm=true (AWARIA sygnalizuje się przez wartość, nie ten flag)', () => {
      for (let i = 0; i < 50; i++) {
        const snapshot = generateSnapshot(chlodnia1, { random: Math.random });
        for (const metric of snapshot.metrics.filter((m) => m.unit === '')) {
          expect(metric.alarm).toBe(false);
        }
      }
    });

    test('metryka Hz (Pompa 1) mieści się w realistycznym zakresie 30-50 Hz', () => {
      for (let i = 0; i < 50; i++) {
        const snapshot = generateSnapshot(chlodnia1, { random: Math.random });
        const hz = snapshot.metrics.find((m) => m.id === 'chlodnia-1-pompa-1-hz')!;
        expect(hz.value).toBeGreaterThanOrEqual(30);
        expect(hz.value).toBeLessThanOrEqual(50);
      }
    });

    test('bool sticky: przy stałym rng powyżej progu zmiany stanu, wartość pozostaje stabilna między tickami', () => {
      // rng=0.5 nigdy nie jest < BOOL_FLIP_PROBABILITY(0.03), więc stan
      // ustalony przy pierwszym generowaniu powinien się utrzymać.
      let snapshot = generateSnapshot(chlodnia1, { random: constantRandom(0.5) });
      const pracaId = 'chlodnia-1-v101-praca';
      const first = snapshot.metrics.find((m) => m.id === pracaId)!.value;
      for (let i = 0; i < 5; i++) {
        snapshot = generateSnapshot(chlodnia1, { previous: snapshot, random: constantRandom(0.5) });
      }
      const later = snapshot.metrics.find((m) => m.id === pracaId)!.value;
      expect(later).toBe(first);
    });
  });

  test('metryki sprężarkowni (obie sekcje: Magazyn Aluminium / Magazyn Bębnów) generowane są niezależnie od siebie', () => {
    const snapshot = generateSnapshot(compressorArea, { random: Math.random });
    // 2 grupy x 2 urządzenia x 2 metryki (praca/awaria, bez hz) + 4 metryki analogowe.
    expect(snapshot.metrics).toHaveLength(12);
    const ids = snapshot.metrics.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
