import { describe, expect, test } from 'vitest';
import { clampNonNegative, cn, stripSectionPrefix } from '@/lib/utils';

describe('cn', () => {
  test('łączy proste klasy stringowe', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  test('pomija falsy wartości (undefined, null, false, "")', () => {
    expect(cn('a', undefined, null, false, '', 'b')).toBe('a b');
  });

  test('scala konfliktujące klasy Tailwind, zachowując ostatnią', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  test('obsługuje warunkowe obiekty klas', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active');
  });

  test('zwraca pusty string, gdy nie podano żadnych argumentów', () => {
    expect(cn()).toBe('');
  });
});

describe('clampNonNegative', () => {
  test('przycina ujemny szum PLC do 0', () => {
    expect(clampNonNegative(-0.05)).toBe(0);
  });

  test('zwraca dodatnią wartość bez zmian', () => {
    expect(clampNonNegative(7.3)).toBe(7.3);
  });

  test('0 pozostaje 0', () => {
    expect(clampNonNegative(0)).toBe(0);
  });
});

describe('stripSectionPrefix', () => {
  test('ścina prefiks sekcji wraz z separatorem " — "', () => {
    expect(stripSectionPrefix('Trafostacja 2 — Moc czynna', 'Trafostacja 2')).toBe('Moc czynna');
  });

  test('działa tak samo dla nagłówków Sprężarkowni', () => {
    expect(stripSectionPrefix('Magazyn Bębnów — Ciśnienie kolektor', 'Magazyn Bębnów')).toBe(
      'Ciśnienie kolektor'
    );
  });

  test('zwraca etykietę bez zmian, gdy nie zaczyna się od prefiksu', () => {
    expect(stripSectionPrefix('Temperatura wody', 'Trafostacja 1')).toBe('Temperatura wody');
  });

  test('nie ścina prefiksu innej sekcji (Trafostacja 1 vs 2)', () => {
    expect(stripSectionPrefix('Trafostacja 1 — L1N', 'Trafostacja 2')).toBe('Trafostacja 1 — L1N');
  });

  test('wymaga pełnego separatora — sam nagłówek bez " — " nie jest ścinany', () => {
    expect(stripSectionPrefix('Trafostacja 1 L1N', 'Trafostacja 1')).toBe('Trafostacja 1 L1N');
  });

  test('ścina tylko pierwsze wystąpienie, kolejny " — " zostaje w etykiecie', () => {
    expect(stripSectionPrefix('Trafostacja 1 — L1 — faza', 'Trafostacja 1')).toBe('L1 — faza');
  });
});
