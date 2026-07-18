import { describe, expect, test } from 'vitest';
import { AREAS } from '@/lib/areas';

const COOLING_METRIC_LABELS = [
  'Temperatura wody na halę',
  'Ciśnienie wody na halę',
  'Poziom wody w zbiorniku',
];

const POWER_METRIC_LABELS = [
  'Trafostacja 1 — Moc czynna',
  'Trafostacja 1 — Moc pozorna',
  'Trafostacja 2 — Moc czynna',
  'Trafostacja 2 — Moc pozorna',
  'Trafostacja 3 — Moc czynna',
  'Trafostacja 3 — Moc pozorna',
];

describe('AREAS registry', () => {
  // Skorygowane po konsultacji z użytkownikiem: karuzela ma 5 slajdów, nie
  // 7/8 jak sugerowała rozbieżność w Concept.md §3 vs §4/§9/§13. Sprężarkownie
  // 1/2 i Trafostacje 1/2/3 są konsolidowane w jeden slajd każda (fizyczne
  // podpunkty stają się metrykami w obrębie jednego obszaru, nie osobnymi
  // obszarami karuzeli).
  test('zawiera dokładnie 5 obszarów (3 chłodnie + 1 sprężarkownia + 1 energia elektryczna)', () => {
    expect(AREAS).toHaveLength(5);
  });

  test('wszystkie id obszarów są unikalne', () => {
    const ids = AREAS.map((area) => area.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('zawiera dokładnie 3 obszary chłodni, 1 sprężarkownię, 1 obszar energii', () => {
    const byType = (type: string) => AREAS.filter((area) => area.type === type);
    expect(byType('cooling')).toHaveLength(3);
    expect(byType('compressor')).toHaveLength(1);
    expect(byType('power')).toHaveLength(1);
  });

  test('nazwy obszarów odpowiadają skorygowanej liście 5 slajdów', () => {
    const names = AREAS.map((area) => area.name);
    expect(names).toEqual([
      'Chłodnia 1',
      'Chłodnia 2',
      'Chłodnia 3',
      'Sprężarkownia',
      'Energia elektryczna',
    ]);
  });

  describe('obszary typu cooling', () => {
    const coolingAreas = AREAS.filter((area) => area.type === 'cooling');

    test('mają dokładnie 3 metryki: temperatura, ciśnienie, poziom', () => {
      for (const area of coolingAreas) {
        expect(area.metrics).toHaveLength(3);
        expect(area.metrics.map((m) => m.label)).toEqual(COOLING_METRIC_LABELS);
      }
    });

    test('mają zdefiniowane dodatnie maxCm (skala poziomu zbiornika)', () => {
      for (const area of coolingAreas) {
        expect(typeof area.maxCm).toBe('number');
        expect(area.maxCm as number).toBeGreaterThan(0);
      }
    });
  });

  describe('obszar typu compressor (Sprężarkownia, konsolidacja 2 fizycznych sprężarkowni)', () => {
    const compressorArea = AREAS.find((area) => area.type === 'compressor')!;

    test('istnieje dokładnie jeden obszar typu compressor', () => {
      expect(AREAS.filter((area) => area.type === 'compressor')).toHaveLength(1);
    });

    test('nazwa to "Sprężarkownia" (bez numeru — jedna sieć, jeden slajd)', () => {
      expect(compressorArea.name).toBe('Sprężarkownia');
    });

    test('ma dokładnie 2 metryki: Magazyn Bębnów, Magazyn Aluminium', () => {
      expect(compressorArea.metrics).toHaveLength(2);
      expect(compressorArea.metrics.map((m) => m.label)).toEqual([
        'Magazyn Bębnów',
        'Magazyn Aluminium',
      ]);
    });

    test('nie ma zdefiniowanego maxCm', () => {
      expect(compressorArea.maxCm).toBeUndefined();
    });

    test('obie metryki mają jednostkę bar', () => {
      for (const metric of compressorArea.metrics) {
        expect(metric.unit).toBe('bar');
      }
    });
  });

  describe('obszar typu power (Energia elektryczna, konsolidacja 3 trafostacji)', () => {
    const powerArea = AREAS.find((area) => area.type === 'power')!;

    test('istnieje dokładnie jeden obszar typu power', () => {
      expect(AREAS.filter((area) => area.type === 'power')).toHaveLength(1);
    });

    test('nazwa to "Energia elektryczna"', () => {
      expect(powerArea.name).toBe('Energia elektryczna');
    });

    test('ma dokładnie 6 metryk: moc czynna + pozorna dla każdej z 3 trafostacji', () => {
      expect(powerArea.metrics).toHaveLength(6);
      expect(powerArea.metrics.map((m) => m.label)).toEqual(POWER_METRIC_LABELS);
    });

    test('jednostki naprzemiennie kW/kVA per trafostacja', () => {
      const units = powerArea.metrics.map((m) => m.unit);
      expect(units).toEqual(['kW', 'kVA', 'kW', 'kVA', 'kW', 'kVA']);
    });

    test('nie ma zdefiniowanego maxCm', () => {
      expect(powerArea.maxCm).toBeUndefined();
    });
  });

  test('każda metryka w rejestrze ma unikalne id w obrębie swojego obszaru', () => {
    for (const area of AREAS) {
      const ids = area.metrics.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
