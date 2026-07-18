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

  test('ciśnienie (chłodnia i sprężarkownia) mieści się w zakresie ~6-8 bar', () => {
    for (let i = 0; i < 50; i++) {
      const coolingSnap = generateSnapshot(coolingArea, { random: Math.random });
      const compressorSnap = generateSnapshot(compressorArea, { random: Math.random });

      for (const metric of [
        ...coolingSnap.metrics.filter((m) => m.unit === 'bar'),
        ...compressorSnap.metrics,
      ]) {
        expect(metric.value).toBeGreaterThanOrEqual(6);
        expect(metric.value).toBeLessThanOrEqual(8);
      }
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

    for (let i = 0; i < first.metrics.length; i++) {
      const range =
        first.metrics[i].unit === 'cm'
          ? (coolingArea.maxCm as number)
          : first.metrics[i].unit === '°C'
            ? 8 - 2
            : 8 - 6;
      const delta = Math.abs(second.metrics[i].value - first.metrics[i].value);
      expect(delta).toBeLessThanOrEqual(range);
    }
  });

  test('metryki sprężarkowni (Magazyn Bębnów / Magazyn Aluminium) generowane są niezależnie od siebie', () => {
    const snapshot = generateSnapshot(compressorArea, { random: Math.random });
    expect(snapshot.metrics).toHaveLength(2);
    expect(snapshot.metrics[0].label).toBe('Magazyn Bębnów');
    expect(snapshot.metrics[1].label).toBe('Magazyn Aluminium');
  });
});
