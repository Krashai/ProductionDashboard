import { describe, expect, test } from 'vitest';
import { AREAS } from '@/lib/areas';

const COOLING_METRIC_LABELS = [
  'Temperatura wody na halę',
  'Ciśnienie wody na halę',
  'Poziom wody w zbiorniku',
];

// Kolejność wg notatek źródłowych: napięcia -> prądy -> moc (czynna, bierna,
// pozorna) -> temperatura -> THD. Ta sama kolejność per trafostacja 1/2/3.
function powerMetricIdsFor(n: number): string[] {
  return [
    `trafostacja-${n}-l1n`,
    `trafostacja-${n}-l2n`,
    `trafostacja-${n}-l3n`,
    `trafostacja-${n}-prad-l1`,
    `trafostacja-${n}-prad-l2`,
    `trafostacja-${n}-prad-l3`,
    `trafostacja-${n}-active`,
    `trafostacja-${n}-reactive`,
    `trafostacja-${n}-apparent`,
    `trafostacja-${n}-temperatura`,
    `trafostacja-${n}-thdi`,
    `trafostacja-${n}-thdu`,
  ];
}

const POWER_METRIC_IDS = [1, 2, 3].flatMap(powerMetricIdsFor);

const POWER_METRIC_UNITS_DECIMALS: Record<string, { unit: string; decimals: number }> = {
  l1n: { unit: 'V', decimals: 0 },
  l2n: { unit: 'V', decimals: 0 },
  l3n: { unit: 'V', decimals: 0 },
  'prad-l1': { unit: 'A', decimals: 1 },
  'prad-l2': { unit: 'A', decimals: 1 },
  'prad-l3': { unit: 'A', decimals: 1 },
  active: { unit: 'kW', decimals: 1 },
  reactive: { unit: 'kVAr', decimals: 1 },
  apparent: { unit: 'kVA', decimals: 1 },
  temperatura: { unit: '°C', decimals: 1 },
  thdi: { unit: '%', decimals: 1 },
  thdu: { unit: '%', decimals: 1 },
};

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

    test('mają wśród metryk dokładnie: temperatura, ciśnienie, poziom (jako pierwsze 3)', () => {
      for (const area of coolingAreas) {
        expect(area.metrics.slice(0, 3).map((m) => m.label)).toEqual(COOLING_METRIC_LABELS);
      }
    });

    test('mają zdefiniowane dodatnie maxCm (skala poziomu zbiornika)', () => {
      for (const area of coolingAreas) {
        expect(typeof area.maxCm).toBe('number');
        expect(area.maxCm as number).toBeGreaterThan(0);
      }
    });

    // Korekta po konsultacji z użytkownikiem: maxCm 250→150 — przy 150cm
    // zbiornik jest w pełni "zatopiony" (100% wypełnienia kafla).
    test('maxCm to 150cm dla wszystkich trzech chłodni', () => {
      for (const area of coolingAreas) {
        expect(area.maxCm).toBe(150);
      }
    });

    // Sierpień 2026: ekran szczegółowy Chłodni 1/2/3 dostał kafle urządzeń
    // (sprężarki/agregaty/pompy) z bitami PRACA/AWARIA — świadome odejście
    // od "AREAS zamrożone od Fazy 2" (decyzja #18, Concept.md).
    test('Chłodnia 1 ma 3 grupy urządzeń: Sprężarki, Agregaty, Pompy obiegowe', () => {
      const chlodnia1 = coolingAreas.find((a) => a.id === 'chlodnia-1')!;
      const groupIds = chlodnia1.deviceGroups?.map((g) => g.id) ?? [];
      expect(new Set(groupIds)).toEqual(new Set(['sprezarki', 'agregaty', 'pompy']));
    });

    test('Chłodnia 2/3 mają tylko 2 grupy urządzeń: Sprężarki, Pompy obiegowe', () => {
      for (const id of ['chlodnia-2', 'chlodnia-3']) {
        const area = coolingAreas.find((a) => a.id === id)!;
        const groupIds = area.deviceGroups?.map((g) => g.id) ?? [];
        expect(new Set(groupIds)).toEqual(new Set(['sprezarki', 'pompy']));
      }
    });

    test('każde urządzenie generuje metryki PRACA/AWARIA z unit="" i decimals=0 w area.metrics', () => {
      const chlodnia1 = coolingAreas.find((a) => a.id === 'chlodnia-1')!;
      const v101 = chlodnia1.deviceGroups
        ?.flatMap((g) => g.devices)
        .find((d) => d.id === 'v101')!;
      expect(v101.metricIds.praca).toBe('chlodnia-1-v101-praca');
      expect(v101.metricIds.awaria).toBe('chlodnia-1-v101-awaria');
      expect(v101.metricIds.hz).toBeUndefined();

      const pracaMetric = chlodnia1.metrics.find((m) => m.id === 'chlodnia-1-v101-praca')!;
      expect(pracaMetric.unit).toBe('');
      expect(pracaMetric.decimals).toBe(0);
    });

    test('tylko Pompa 1 ma dodatkową metrykę Hz, pozostałe pompy nie', () => {
      const chlodnia1 = coolingAreas.find((a) => a.id === 'chlodnia-1')!;
      const pompy = chlodnia1.deviceGroups?.find((g) => g.id === 'pompy')!;
      const pompa1 = pompy.devices.find((d) => d.id === 'pompa-1')!;
      const pompa2 = pompy.devices.find((d) => d.id === 'pompa-2')!;
      expect(pompa1.metricIds.hz).toBe('chlodnia-1-pompa-1-hz');
      expect(pompa2.metricIds.hz).toBeUndefined();

      const hzMetric = chlodnia1.metrics.find((m) => m.id === 'chlodnia-1-pompa-1-hz')!;
      expect(hzMetric.unit).toBe('Hz');
      expect(hzMetric.decimals).toBe(1);
    });
  });

  describe('obszar typu compressor (Sprężarkownia, jeden slajd z dwiema sekcjami UI: Magazyn Aluminium / Magazyn Bębnów)', () => {
    const compressorArea = AREAS.find((area) => area.type === 'compressor')!;

    test('istnieje dokładnie jeden obszar typu compressor', () => {
      expect(AREAS.filter((area) => area.type === 'compressor')).toHaveLength(1);
    });

    test('nazwa to "Sprężarkownia" (bez numeru — jedna sieć, jeden slajd)', () => {
      expect(compressorArea.name).toBe('Sprężarkownia');
    });

    test('nie ma zdefiniowanego maxCm', () => {
      expect(compressorArea.maxCm).toBeUndefined();
    });

    test('ma 2 grupy urządzeń: magazyn-aluminium, magazyn-bebnow', () => {
      const groupIds = compressorArea.deviceGroups?.map((g) => g.id) ?? [];
      expect(new Set(groupIds)).toEqual(new Set(['magazyn-aluminium', 'magazyn-bebnow']));
    });

    test('grupa magazyn-aluminium ma 2 sprężarki (aluminium-1/2), bez regulacji obrotów', () => {
      const group = compressorArea.deviceGroups!.find((g) => g.id === 'magazyn-aluminium')!;
      expect(group.label).toBe('Magazyn Aluminium');
      expect(group.devices.map((d) => d.id)).toEqual(['aluminium-1', 'aluminium-2']);
      expect(group.devices.map((d) => d.label)).toEqual(['Sprężarka 1', 'Sprężarka 2']);
      for (const device of group.devices) {
        expect(device.metricIds.hz).toBeUndefined();
      }
    });

    test('grupa magazyn-bebnow ma 2 sprężarki (bebny-1/2), bez regulacji obrotów', () => {
      const group = compressorArea.deviceGroups!.find((g) => g.id === 'magazyn-bebnow')!;
      expect(group.label).toBe('Magazyn Bębnów');
      expect(group.devices.map((d) => d.id)).toEqual(['bebny-1', 'bebny-2']);
      expect(group.devices.map((d) => d.label)).toEqual(['Sprężarka 1', 'Sprężarka 2']);
      for (const device of group.devices) {
        expect(device.metricIds.hz).toBeUndefined();
      }
    });

    test('id urządzeń są prefiksowane per sekcja — brak kolizji metric id między grupami w jednym areaId', () => {
      const metricIds = compressorArea.metrics.map((m) => m.id);
      expect(metricIds).toContain('sprezarkownia-aluminium-1-praca');
      expect(metricIds).toContain('sprezarkownia-bebny-1-praca');
      expect(new Set(metricIds).size).toBe(metricIds.length);
    });

    test('ma dokładnie 4 analogowe metryki ciśnienia/przepływu z poprawnymi jednostkami i dokładnością', () => {
      const expected = [
        {
          id: 'sprezarkownia-magazyn-aluminium-cisnienie-zbiornik',
          label: 'Magazyn Aluminium — Ciśnienie zbiornik',
          unit: 'bar',
          decimals: 2,
        },
        {
          id: 'sprezarkownia-magazyn-bebnow-cisnienie-zbiornik',
          label: 'Magazyn Bębnów — Ciśnienie zbiornik',
          unit: 'bar',
          decimals: 2,
        },
        {
          id: 'sprezarkownia-magazyn-bebnow-cisnienie-kolektor',
          label: 'Magazyn Bębnów — Ciśnienie kolektor',
          unit: 'bar',
          decimals: 2,
        },
        {
          id: 'sprezarkownia-magazyn-bebnow-przeplyw-powietrza',
          label: 'Magazyn Bębnów — Przepływ powietrza',
          unit: 'm³/min',
          decimals: 1,
        },
      ];
      for (const exp of expected) {
        const found = compressorArea.metrics.find((m) => m.id === exp.id);
        expect(found).toMatchObject(exp);
      }
    });
  });

  describe('obszar typu power (Energia elektryczna, konsolidacja 3 trafostacji, spec sheet)', () => {
    const powerArea = AREAS.find((area) => area.type === 'power')!;

    test('istnieje dokładnie jeden obszar typu power', () => {
      expect(AREAS.filter((area) => area.type === 'power')).toHaveLength(1);
    });

    test('nazwa to "Energia elektryczna"', () => {
      expect(powerArea.name).toBe('Energia elektryczna');
    });

    // 12 metryk (3 napięcia + 3 prądy + 3 moc + 1 temperatura + 2 THD) × 3
    // trafostacje = 36 — dense "spec sheet" (sierpień 2026), nie dawna
    // uboga siatka 6 kart.
    test('ma dokładnie 36 metryk (12 na trafostację × 3 trafostacje) w ustalonej kolejności id', () => {
      expect(powerArea.metrics).toHaveLength(36);
      expect(powerArea.metrics.map((m) => m.id)).toEqual(POWER_METRIC_IDS);
    });

    test('każda metryka ma poprawną jednostkę/decimals wg swojego sufiksu id', () => {
      for (const m of powerArea.metrics) {
        const suffix = m.id.replace(/^trafostacja-\d-/, '');
        const expected = POWER_METRIC_UNITS_DECIMALS[suffix];
        expect(expected).toBeDefined();
        expect(m.unit).toBe(expected.unit);
        expect(m.decimals).toBe(expected.decimals);
      }
    });

    test('etykiety zaczynają się od "Trafostacja {n} — " i zawierają rozpoznawalną nazwę wielkości', () => {
      for (const n of [1, 2, 3]) {
        const active = powerArea.metrics.find((m) => m.id === `trafostacja-${n}-active`)!;
        expect(active.label).toBe(`Trafostacja ${n} — Moc czynna`);
        const reactive = powerArea.metrics.find((m) => m.id === `trafostacja-${n}-reactive`)!;
        expect(reactive.label).toBe(`Trafostacja ${n} — Moc bierna`);
        const apparent = powerArea.metrics.find((m) => m.id === `trafostacja-${n}-apparent`)!;
        expect(apparent.label).toBe(`Trafostacja ${n} — Moc pozorna`);
        const l1n = powerArea.metrics.find((m) => m.id === `trafostacja-${n}-l1n`)!;
        expect(l1n.label).toBe(`Trafostacja ${n} — L1N`);
        const pradL1 = powerArea.metrics.find((m) => m.id === `trafostacja-${n}-prad-l1`)!;
        expect(pradL1.label).toBe(`Trafostacja ${n} — L1 (prąd)`);
        const temp = powerArea.metrics.find((m) => m.id === `trafostacja-${n}-temperatura`)!;
        expect(temp.label).toBe(`Trafostacja ${n} — Temperatura`);
        const thdi = powerArea.metrics.find((m) => m.id === `trafostacja-${n}-thdi`)!;
        expect(thdi.label).toBe(`Trafostacja ${n} — THDi`);
        const thdu = powerArea.metrics.find((m) => m.id === `trafostacja-${n}-thdu`)!;
        expect(thdu.label).toBe(`Trafostacja ${n} — THDu`);
      }
    });

    // Zachowanie wsteczne — te dwa id/jednostki/decimals czyta
    // `overview-power-summary.ts` (`unit === 'kW'`) i `OverviewView.tsx`,
    // oba świadomie poza zakresem tej zmiany i MUSZĄ działać bez modyfikacji.
    test('pre-istniejące id trafostacja-{n}-active/apparent zostają bez zmian (kW/kVA, decimals=1)', () => {
      for (const n of [1, 2, 3]) {
        const active = powerArea.metrics.find((m) => m.id === `trafostacja-${n}-active`)!;
        expect(active.unit).toBe('kW');
        expect(active.decimals).toBe(1);
        const apparent = powerArea.metrics.find((m) => m.id === `trafostacja-${n}-apparent`)!;
        expect(apparent.unit).toBe('kVA');
        expect(apparent.decimals).toBe(1);
      }
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
