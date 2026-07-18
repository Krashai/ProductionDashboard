import { describe, expect, test } from 'vitest';
import { cn } from '@/lib/utils';

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
