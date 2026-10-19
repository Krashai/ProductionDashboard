import { describe, expect, test } from 'vitest';
import { fitValueChars } from '@/lib/overview-fit';

describe('fitValueChars', () => {
  test('zwraca długość najdłuższej sformatowanej wartości w rzędzie', () => {
    expect(
      fitValueChars([
        { value: 8, decimals: 1 },
        { value: 6.891, decimals: 2 },
        { value: 102, decimals: 0 },
      ])
    ).toBe(4); // "6.89"
  });

  test('nie schodzi poniżej minimum — rząd krótkich liczb nie dostaje gigantycznej czcionki', () => {
    expect(fitValueChars([{ value: 5, decimals: 0 }], 4)).toBe(4);
  });

  test('rośnie ponad minimum, gdy wartość się wydłuży (np. moc > 999.9 kW)', () => {
    expect(fitValueChars([{ value: 1234.56, decimals: 1 }], 5)).toBe(6); // "1234.6"
  });

  test('liczy długość po obcięciu ujemnego szumu, tak jak kafel ją wyświetla', () => {
    expect(fitValueChars([{ value: -0.05, decimals: 2 }], 1)).toBe(4); // "0.00"
  });

  test('pusty rząd (brak snapshotu) daje minimum', () => {
    expect(fitValueChars([], 4)).toBe(4);
  });
});
